import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { EventPage } from '../../lib/mauzcode';
import { mascotActivity, type MascotActivity } from '../../lib/mascotActivity';
import { mascotNames } from '../../lib/mascots';
import { tokibeanRenderers, type TokibeanPet } from '../../lib/tokibean';
import type { TokibeanExtra, TokibeanState } from '../../lib/tokibean/types';
import { useMascotLife } from './useMascotLife';
import './tokibean-mascot.css';

// Upstream draws into a fixed 288×184 logical canvas (src/index.html) at 4 px per art pixel.
const WIDTH = 288, HEIGHT = 184;
const NOTES: Partial<Record<MascotActivity, string>> = { command: 'cmd', git: 'git', testing: 'testing', editing: 'coding', reading: 'reading', searching: 'searching', browsing: 'browsing', planning: 'planning', compacting: 'planning' };

/** Upstream state and extras for a MauzCode activity, done reaction, sleep, poke or hover. */
export function tokibeanFrame(activity: MascotActivity, life: { reaction: 'done' | 'error' | 'poke' | null; sleeping: boolean; hover: boolean }): { state: TokibeanState; extra: TokibeanExtra } {
  const extra: TokibeanExtra = { textScale: 1 };
  if (life.reaction === 'done') return { state: 'done', extra: { ...extra, celebrate: 1 } };
  if (life.reaction === 'poke') return { state: 'idle', extra: { ...extra, tickle: true } };
  if (activity === 'error' || life.reaction === 'error') return { state: 'idle', extra: { ...extra, oops: true } };
  if (activity === 'waiting') return { state: 'attention', extra };
  if (activity === 'delegating') return { state: 'working', extra: { ...extra, agentCount: 1 } };
  if (activity === 'thinking') return { state: 'working', extra };
  const note = NOTES[activity];
  if (note) return { state: 'working', extra: { ...extra, toolNote: note } };
  if (life.sleeping) return { state: 'limit', extra };
  return { state: 'idle', extra: { ...extra, pat: life.hover } };
}

/** Vendored Tokibean canvas skin driven by chat activity. No upstream app, hooks or network. */
export function TokibeanMascot({ page, pet, control }: { page: EventPage | null; pet: TokibeanPet; control?: (className: string) => ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState(false);
  const life = useMascotLife(page);
  const activity = mascotActivity(page);
  const frame = tokibeanFrame(activity, { ...life, hover });
  const latest = useRef(frame); latest.current = frame;
  const key = `${frame.state}|${frame.extra.toolNote ?? ''}|${life.reduced}`;
  useEffect(() => {
    const el = canvas.current; const ctx = el?.getContext('2d'); if (!el || !ctx) return;
    const renderer = tokibeanRenderers[pet];
    const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    el.width = WIDTH * dpr; el.height = HEIGHT * dpr;
    // Skins read clientWidth for their centre column; keep the CSS box at the design size and scale the element visually.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let t = 0, handle = 0;
    const paint = () => { ctx.save(); renderer.draw(ctx, el, latest.current.state, false, null, t, latest.current.extra); ctx.restore(); };
    if (life.reduced) { t = 120; paint(); return; }
    const loop = () => { t++; paint(); handle = requestAnimationFrame(loop); };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [pet, life.reduced, key]);
  return <div className="tokibean-mascot" data-pet={pet} data-animation={frame.state} data-note={frame.extra.toolNote ?? undefined}>
    <canvas ref={canvas} className="tokibean-canvas" width={WIDTH} height={HEIGHT} aria-hidden="true" />
    {control ? control('tokibean-hit') : <button type="button" className="tokibean-hit" aria-label={`Поиграть с ${mascotNames[pet]}`} disabled={!!page?.isRunning}
      onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)} onClick={life.poke} />}
  </div>;
}
