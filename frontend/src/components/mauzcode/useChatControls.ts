import { useEffect, useRef, useState } from 'react';
import { requestJson } from '../../lib/mauzcode';

export type Speed = 'standard' | 'fast' | 'ultrafast';
export type Verbosity = 'low' | 'medium' | 'high';
type View = { route: string; revision: string; speeds: Speed[]; speed: Speed; verbosities: Verbosity[]; verbosity: Verbosity | null; csrfToken: string; noticePending: boolean };
type Notice = { id: string; message: string };
const endpoint = (id: string) => `/agent/${encodeURIComponent(id)}/codex-controls`;
const post = <T,>(agentId: string, csrfToken: string, body: object) => requestJson<T>(endpoint(agentId), {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ ...body, csrfToken }),
});

/** Read-only on mount/reopen. Only the visible owner acknowledges a notice, after its text was painted. */
export function useChatControls(agentId: string, route: string, open: boolean, revision: number) {
  const [snapshot, setSnapshot] = useState<{ agentId: string; view: View } | null>(null);
  const [delivery, setDelivery] = useState<{ agentId: string; claimId: string; notice: Notice; token: string } | null>(null);
  const [presented, setPresented] = useState<{agentId: string; notice: Notice} | null>(null);
  const [cycle, setCycle] = useState(0);
  const [visible, setVisible] = useState(document.visibilityState !== 'hidden');
  const [error, setError] = useState('');
  const display = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const resume = () => { setVisible(document.visibilityState !== 'hidden'); setCycle(n => n + 1); };
    document.addEventListener('visibilitychange', resume); window.addEventListener('online', resume);
    return () => { document.removeEventListener('visibilitychange', resume); window.removeEventListener('online', resume); };
  }, []);
  useEffect(() => {
    if (!agentId || !visible) return;
    const controller = new AbortController();
    setSnapshot(null); setError('');
    void requestJson<View>(endpoint(agentId), { signal: controller.signal }).then(view => {
      if (!controller.signal.aborted) setSnapshot({ agentId, view });
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load response settings'); });
    return () => controller.abort();
  }, [agentId, route, open, revision, visible, cycle]);
  const view = snapshot?.agentId === agentId ? snapshot.view : null;
  useEffect(() => {
    if (!visible || !view?.noticePending || !agentId) return;
    const claimId = crypto.randomUUID(), token = view.csrfToken;
    let active = true, claimed: Notice | null = null, timer: ReturnType<typeof setTimeout>;
    const release = (id: string) => { void post(agentId, token, { action: 'release', noticeId: id, claimId }).catch(() => {}); };
    const retry = () => { if (active) timer = setTimeout(() => setCycle(n => n + 1), 30_000); };
    void post<{notice: Notice | null}>(agentId, token, { action: 'claim', claimId }).then(({notice}) => {
      if (!notice) { retry(); return; }
      if (!active || document.visibilityState === 'hidden') { release(notice.id); return; }
      claimed = notice; setDelivery({ agentId, notice, claimId, token });
    }).catch(retry);
    return () => { active = false; clearTimeout(timer); if (claimed) release(claimed.id); setDelivery(null); };
  }, [agentId, view, visible]);
  useEffect(() => {
    if (!delivery || delivery.agentId !== agentId || !visible) return;
    let frame = 0, active = true, timer: ReturnType<typeof setTimeout>;
    const acknowledge = () => {
      if (!active || !display.current?.isConnected || document.visibilityState === 'hidden') return;
      void post(agentId, delivery.token, { action: 'ack', claimId: delivery.claimId, noticeId: delivery.notice.id })
        .then(() => { if (active) { setPresented({ agentId, notice: delivery.notice }); setCycle(n => n + 1); } })
        .catch(() => { if (active) timer = setTimeout(() => setCycle(n => n + 1), 2000); });
    };
    // First frame commits the visible notice; the following frame is after a paint opportunity.
    frame = requestAnimationFrame(() => { frame = requestAnimationFrame(acknowledge); });
    return () => { active = false; cancelAnimationFrame(frame); clearTimeout(timer); };
  }, [agentId, delivery, visible]);
  const save = async (speed: Speed, verbosity: Verbosity | null) => {
    if (!view || route !== view.route || !view.csrfToken) throw new Error('Reload model settings before changing this chat.');
    try { await post(agentId, view.csrfToken, { action: 'save', route, revision: view.revision, speed, verbosity }); }
    finally { setCycle(n => n + 1); }
  };
  return { view: view?.route === route ? view : null, save, display, notice: visible ? (delivery?.agentId === agentId ? delivery.notice : presented?.agentId === agentId ? presented.notice : null) : null, dismiss: () => setPresented(null), canDismiss: !!presented && !delivery, error };
}
