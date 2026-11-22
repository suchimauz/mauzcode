import { useEffect, useState } from 'react';
import { loadLiveClient, type LiveStatus } from '../../lib/live';

type Phase = 'hidden' | 'lost' | 'restored';
const mac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
/** Shortcut of the desktop menu item «Сервер → Повторить подключение». */
export const retryShortcut = () => mac() ? '⌘R' : 'Ctrl+R';

/**
 * Desktop-client-only live transport status. Reads the existing `mauzcodeLive`
 * transport (no new socket, reload or submit) and never moves focus, so a draft
 * in the composer stays intact while the connection drops and returns.
 * Ordinary browsers render nothing: they keep the generic polling notice.
 */
export function DesktopLiveStatus({ restoredMs = 4000 }: { restoredMs?: number }) {
  const [phase, setPhase] = useState<Phase>('hidden');
  useEffect(() => {
    if (!window.mauzcodeDesktopLive) return;
    let active = true, seen = false, current: Phase = 'hidden';
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unstatus: (() => void) | undefined;
    const apply = (status: LiveStatus) => {
      if (!active) return;
      clearTimeout(timer);
      const set = (next: Phase) => { current = next; setPhase(next); };
      if (status === 'connected') {
        seen = true;
        if (current !== 'lost') return set('hidden');
        set('restored');
        timer = setTimeout(() => { if (active) set('hidden'); }, restoredMs);
      } else if (seen || status === 'disconnected') set('lost');
    };
    void loadLiveClient().then(() => {
      const live = window.mauzcodeLive;
      if (!active || !live?.onStatus) return;
      unstatus = live.onStatus(apply);
      apply(live.getStatus?.() ?? 'connecting');
    }, () => apply('disconnected'));
    return () => { active = false; clearTimeout(timer); unstatus?.(); };
  }, [restoredMs]);
  if (!window.mauzcodeDesktopLive) return null;
  // The live region stays mounted so screen readers announce each change.
  return <div className={`desktop-live-status ${phase === 'hidden' ? '' : `is-${phase}`}`} role="status" aria-live="polite" aria-atomic="true">
    {phase === 'lost' && <><strong>Связь потеряна, переподключаемся…</strong> <span>Черновик сохранён и не будет отправлен сам. Повторить сейчас: <kbd>{retryShortcut()}</kbd> или меню «Сервер → Повторить подключение».</span></>}
    {phase === 'restored' && <strong>Связь восстановлена.</strong>}
  </div>;
}
