import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { EventPage } from '../../lib/mauzcode';
import { mascotActivity } from '../../lib/mascotActivity';
import { mascotNames } from '../../lib/mascots';
import { imageFor, imageMascots, type ImagePet } from '../../lib/imageMascots';
import { useMascotLife } from './useMascotLife';
import './image-mascot.css';

const EXTRA_AFTER_MS = 20000, EXTRA_MS = 6000;

/** Per-state animated GIF/SVG pets. Shown only through <img>, so artwork can never run scripts. */
export function ImageMascot({ page, pet }: { page: EventPage | null; pet: ImagePet }) {
  const manifest = imageMascots[pet];
  const life = useMascotLife(page);
  const [poke, setPoke] = useState(0);
  const [extra, setExtra] = useState<string | null>(null);
  const activity = mascotActivity(page);
  useEffect(() => {
    const extras = 'idleExtras' in manifest ? manifest.idleExtras : undefined;
    if (life.running || life.reduced || !extras?.length) return;
    let clear = 0;
    const timer = window.setInterval(() => { setExtra(extras[Math.floor(Math.random() * extras.length)]); clear = window.setTimeout(() => setExtra(null), EXTRA_MS); }, EXTRA_AFTER_MS);
    return () => { clearInterval(timer); clearTimeout(clear); };
  }, [life.running, life.reduced, manifest]);
  const file = life.reaction === 'poke' ? manifest.poke[(poke + manifest.poke.length - 1) % manifest.poke.length]
    : life.reaction === 'done' ? manifest.done
    : life.reaction === 'error' ? manifest.states.error ?? manifest.working
    : activity === 'idle' && life.sleeping ? manifest.sleeping
    : activity === 'idle' && extra ? extra
    : imageFor(manifest, activity);
  const src = `${import.meta.env.BASE_URL}mascot/${pet}/${file}`;
  // Scale the source canvas so its idle art box is `height` px tall, and anchor that box at the perch; animation outside it stays visible.
  const [sw, sh] = manifest.size, [left, top, right, bottom] = manifest.art, scale = manifest.height / (bottom - top);
  const style = { '--pet-width': `${(right - left) * scale}px`, '--pet-height': `${manifest.height}px`, '--art-width': `${sw * scale}px`, '--art-height': `${sh * scale}px`, '--art-left': `${-left * scale}px`, '--art-top': `${-top * scale}px` } as CSSProperties;
  return <div className="image-mascot" style={style} data-pet={pet} data-animation={file.replace(/\.\w+$/, '')}>
    {life.reduced ? <StillImage src={src} /> : <img className="image-mascot-art" src={src} alt="" aria-hidden="true" draggable={false} decoding="async" />}
    <button type="button" className="image-mascot-hit" aria-label={`Поиграть с ${mascotNames[pet]}`} disabled={!!page?.isRunning}
      onClick={() => { setPoke(count => count + 1); setExtra(null); life.poke(); }} />
  </div>;
}

/** One frame of the animation: drawing an animated image onto a canvas captures a single still picture. */
function StillImage({ src }: { src: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const image = new Image(); let alive = true;
    image.onload = () => {
      const el = canvas.current; const ctx = el?.getContext('2d'); if (!alive || !el || !ctx) return;
      const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
      el.width = el.clientWidth * dpr || image.naturalWidth; el.height = el.clientHeight * dpr || image.naturalHeight;
      const scale = Math.min(el.width / image.naturalWidth, el.height / image.naturalHeight);
      const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
      ctx.clearRect(0, 0, el.width, el.height); ctx.drawImage(image, (el.width - w) / 2, el.height - h, w, h);
    };
    image.src = src;
    return () => { alive = false; image.onload = null; };
  }, [src]);
  return <canvas ref={canvas} className="image-mascot-art" aria-hidden="true" data-still="true" />;
}
