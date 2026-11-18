import { useLayoutEffect, useRef, useState } from 'react';

const WINDOW = 5000;
const formatSize = (n: number) => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} МБ` : n >= 1024 ? `${Math.round(n / 1024)} КБ` : `${n} симв.`;

/** Output of a running call: a drop marker when the server cap discarded older output, the last ~5000 lines with "show earlier", and a scroll that sticks to the bottom unless the user scrolled up. */
export function LiveOutput({ text, dropped = 0 }: { text: string; dropped?: number }) {
  const [shown, setShown] = useState(WINDOW);
  const box = useRef<HTMLPreElement>(null);
  const stick = useRef(true);
  const lines = text ? text.split('\n') : [];
  const hidden = Math.max(0, lines.length - shown);
  useLayoutEffect(() => { const el = box.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [text]);
  return <div className="tool-live-output">
    {dropped > 0 && <p className="tool-live-marker" role="note">[более ранний вывод отброшен: {formatSize(dropped)}]</p>}
    {hidden > 0 && <button type="button" className="tool-preview-more" onClick={() => setShown(value => value + WINDOW)}>Показать более ранние строки ({hidden})</button>}
    <pre ref={box} className="tool-live-text" aria-label="Вывод" aria-live="off" onScroll={() => { const el = box.current!; stick.current = el.scrollTop >= el.scrollHeight - el.clientHeight - 4; }}>
      {hidden ? lines.slice(hidden).join('\n') : text}
    </pre>
  </div>;
}
