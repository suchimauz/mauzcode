import { useCallback, useEffect, useRef, useState } from 'react';
import type { EventPage } from '../../lib/mauzcode';

const DONE_MS = 3000, ERROR_MS = 3000, POKE_MS = 1500, SLEEP_AFTER_MS = 60000;
type Reaction = 'done' | 'error' | 'poke' | null;

/** Shared run-outcome reaction, sleep timer, poke and reduced-motion preference for the Tokibean and image mascots. */
export function useMascotLife(page: EventPage | null) {
  const running = !!(page?.isRunning || page?.thinking || page?.activeTools?.length);
  const [reaction, setReaction] = useState<Reaction>(null);
  const [sleeping, setSleeping] = useState(false);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const wasRunning = useRef(running);
  const quietSince = useRef(Date.now());
  useEffect(() => { const media = matchMedia('(prefers-reduced-motion: reduce)'); const change = () => setReduced(media.matches); media.addEventListener('change', change); return () => media.removeEventListener('change', change); }, []);
  useEffect(() => {
    if (wasRunning.current && !running) setReaction(page?.lastError ? 'error' : 'done');
    if (running || wasRunning.current) { quietSince.current = Date.now(); setSleeping(false); }
    wasRunning.current = running;
  }, [running, page?.lastError]);
  useEffect(() => {
    if (!reaction) return;
    const timer = setTimeout(() => setReaction(null), reaction === 'done' ? DONE_MS : reaction === 'error' ? ERROR_MS : POKE_MS);
    return () => clearTimeout(timer);
  }, [reaction]);
  useEffect(() => {
    if (running) return;
    const timer = setInterval(() => { if (Date.now() - quietSince.current >= SLEEP_AFTER_MS) setSleeping(true); }, 10000);
    return () => clearInterval(timer);
  }, [running]);
  const poke = useCallback(() => { quietSince.current = Date.now(); setSleeping(false); setReaction('poke'); }, []);
  return { reaction, sleeping, reduced, running, poke };
}
