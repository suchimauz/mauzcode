import { useEffect, useState } from 'react';
import { loadLiveClient, type LiveHealth, type LiveStatus } from '../../lib/live';

type Phase = 'hidden' | 'lost' | 'restored';
const mac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
/** Shortcut of the desktop menu item «Сервер → Повторить подключение». */
export const retryShortcut = () => mac() ? '⌘R' : 'Ctrl+R';
/** Where the retry command lives: the macOS menu bar, or the title-strip menu (⋯) on Windows/Linux. */
const retryMenu = () => mac() ? '«Сервер → Повторить подключение»' : '«⋯ → Повторить подключение»';
/** Older transports report only status: a planned reopen ('connecting') is never a loss. */
const fromStatus = (status: LiveStatus): LiveHealth | null => status === 'disconnected' ? 'lost' : status === 'connected' ? 'ok' : null;

/**
 * Desktop-client-only live transport status. Reads the existing `mauzcodeLive`
 * transport (no new socket, reload or submit) and never moves focus, so a draft
 * in the composer stays intact while the connection drops and returns.
 * It follows transport health, not stream status: switching agents replaces
 * the stream on purpose and is never announced, however long the reopen takes.
 * Ordinary browsers render nothing: they keep the generic polling notice.
 */
/** `graceMs`: a real failure shorter than this (a quick automatic reconnect) is not announced at all. */
export function DesktopLiveStatus({ restoredMs = 4000, graceMs = 1500 }: { restoredMs?: number; graceMs?: number }) {
  const [phase, setPhase] = useState<Phase>('hidden');
  useEffect(() => {
    if (!window.mauzcodeDesktopLive) return;
    let active = true, current: Phase = 'hidden', pendingLoss = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;
    const set = (next: Phase) => { current = next; setPhase(next); };
    const apply = (health: LiveHealth | null) => {
      if (!active || health === null) return;
      if (health === 'ok') {
        clearTimeout(timer); pendingLoss = false;
        if (current !== 'lost') return set('hidden');
        set('restored');
        timer = setTimeout(() => { if (active) set('hidden'); }, restoredMs);
        return;
      }
      if (current === 'lost' || pendingLoss) return;
      clearTimeout(timer);
      if (graceMs <= 0) return set('lost');
      pendingLoss = true;
      timer = setTimeout(() => { pendingLoss = false; if (active) set('lost'); }, graceMs);
    };
    void loadLiveClient().then(() => {
      const live = window.mauzcodeLive;
      if (!active || !live) return;
      if (live.onHealth) {
        unsubscribe = live.onHealth(apply);
        apply(live.getHealth?.() ?? 'ok');
      } else if (live.onStatus) {
        unsubscribe = live.onStatus(status => apply(fromStatus(status)));
        apply(fromStatus(live.getStatus?.() ?? 'connecting'));
      }
    }, () => apply('lost'));
    return () => { active = false; clearTimeout(timer); unsubscribe?.(); };
  }, [restoredMs, graceMs]);
  if (!window.mauzcodeDesktopLive) return null;
  // The live region stays mounted so screen readers announce each change.
  return <div className={`desktop-live-status ${phase === 'hidden' ? '' : `is-${phase}`}`} role="status" aria-live="polite" aria-atomic="true">
    {phase === 'lost' && <><strong>Связь потеряна, переподключаемся…</strong> <span>Черновик сохранён и не будет отправлен сам. Повторить сейчас: <kbd>{retryShortcut()}</kbd> или меню {retryMenu()}.</span></>}
    {phase === 'restored' && <strong>Связь восстановлена.</strong>}
  </div>;
}
