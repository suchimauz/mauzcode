import { useEffect, useRef } from 'react';

/**
 * Runs `read` now and then every `intervalMs` while the tab is visible. Hidden tabs send nothing; on return a read
 * starts at once only when the last successful one is at least `intervalMs` old, otherwise the remainder is awaited.
 * Overlapping timers and retries never start a second read. `read` resolves true on success; a failure does not
 * advance the last-success time, so the next due tick (or return) tries again. Changing `key` restarts the cycle.
 */
export function useVisiblePoll(read: (signal: AbortSignal) => Promise<boolean>, intervalMs: number, key: unknown = null) {
  const latest = useRef(read);
  latest.current = read;
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let busy = false;
    let lastSuccess = -Infinity;
    let lastAttempt = -Infinity;
    const schedule = () => {
      clearTimeout(timer);
      if (document.hidden || controller.signal.aborted) return;
      const since = Math.max(lastSuccess, lastAttempt);
      timer = setTimeout(() => { void run(); }, Math.max(0, since + intervalMs - Date.now()));
    };
    async function run() {
      if (busy || controller.signal.aborted || document.hidden) return;
      busy = true;
      lastAttempt = Date.now();
      try { if (await latest.current(controller.signal)) lastSuccess = Date.now(); }
      catch { /* The reader reports its own error; the last success stays as it was. */ }
      finally { busy = false; schedule(); }
    }
    const onVisibility = () => {
      if (document.hidden) { clearTimeout(timer); return; }
      if (Date.now() - lastSuccess >= intervalMs) void run(); else schedule();
    };
    document.addEventListener('visibilitychange', onVisibility);
    void run();
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [intervalMs, key]);
}
