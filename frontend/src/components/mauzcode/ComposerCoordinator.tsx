import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LiveComposerProps } from './LiveComposer';
import type { PanelStart } from '../../hooks/useVoiceCapture';

type Slot = { props: LiveComposerProps; element: HTMLElement | null };
export type ComposerLifecycle = { leave(): void; supersede(): void; retain(): boolean };
type Registry = { attach(props: LiveComposerProps, element: HTMLElement): void; detach(id: string, element: HTMLElement): void; navigate(): void; claim(id: string): PanelStart };
const Context = createContext<Registry | null>(null);
export const useComposerRegistry = () => useContext(Context);
const noop = () => {};
export const useComposerNavigation = () => useComposerRegistry()?.navigate ?? noop;

/** Owns only mounted or parked draft controllers. A parked controller renders no DOM or hidden composer. */
export type ComposerCoordinatorProps = { children: ReactNode; denied?: (id: string) => boolean };
export function ComposerRegistry({ children, denied, render }: ComposerCoordinatorProps & { render: (props: LiveComposerProps, element: HTMLElement | null, controllers: Map<string, ComposerLifecycle>) => ReactNode }) {
  const [slots, setSlots] = useState<Map<string, Slot>>(() => new Map());
  const controllers = useRef(new Map<string, ComposerLifecycle>());
  const active = useRef<string | null>(null);
  const navigate = useCallback(() => { if (active.current) controllers.current.get(active.current)?.leave(); }, []);
  const claim = useMemo(() => orderPanelStarts(id => controllers.current.get(id)?.supersede()), []);
  const registry = useMemo<Registry>(() => ({ navigate, claim,
    attach(props, element) {
      if (active.current !== props.agentId) navigate();
      active.current = props.agentId;
      setSlots(old => new Map(old).set(props.agentId, { props, element }));
    },
    detach(id, element) {
      if (active.current === id) { navigate(); active.current = null; }
      const keep = controllers.current.get(id)?.retain();
      setSlots(old => { const slot = old.get(id); if (slot?.element !== element) return old;
        const next = new Map(old); if (keep) next.set(id, { ...slot, element: null }); else next.delete(id); return next;
      });
    },
  }), [navigate, claim]);
  useLayoutEffect(() => { window.addEventListener('popstate', navigate, true); return () => window.removeEventListener('popstate', navigate, true); }, [navigate]);
  return <Context.Provider value={registry}>{children}{Array.from(slots, ([id, { props, element }]) => render({ ...props, readOnly: props.readOnly || denied?.(id) }, element, controllers.current))}</Context.Provider>;
}

/** A late permission/socket may not put an older start on the wire after a newer one.
 * A refusal releases the wait; only a claim accepted by the relay can evict a previous run. */
function orderPanelStarts(supersede: (id: string) => void) {
  type Attempt = { id: string; sent: boolean; send?: () => void };
  const pending: Attempt[] = [];
  let owner: Attempt | undefined;
  function dispatch() {
    for (let i = pending.length - 1; i >= 0; i--) {
      const attempt = pending[i];
      if (attempt.sent) return; // Wait for this newer claim's outcome, not for a newer permission prompt.
      if (!attempt.send) continue;
      const send = attempt.send;
      attempt.send = undefined; attempt.sent = true; send(); return;
    }
  }
  return (id: string): PanelStart => {
    const attempt: Attempt = { id, sent: false };
    pending.push(attempt);
    return {
      connect(send) { attempt.send = send; dispatch(); },
      accepted() {
        const index = pending.indexOf(attempt);
        if (index < 0) return;
        const older = pending.splice(0, index + 1);
        const previous = owner; owner = attempt;
        if (previous) supersede(previous.id);
        for (const other of older) if (other !== attempt) supersede(other.id);
      },
      release() {
        if (owner === attempt) owner = undefined;
        const index = pending.indexOf(attempt);
        if (index >= 0) { pending.splice(index, 1); dispatch(); }
      },
    };
  };
}
