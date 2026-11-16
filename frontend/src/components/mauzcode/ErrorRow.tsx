import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, CircleAlert, Copy } from 'lucide-react';
import type { ChatEvent } from '../../lib/mauzcode';
import './compaction-row.css';

const SUMMARY_LIMIT = 160;

/** User stops arrive as error events but are not failures. */
export function isUserStopError(event: ChatEvent) {
  return event.type === 'error' && /^stopped by user/i.test((event.text ?? '').trim());
}

/** Compact failed-run row: error icon, first line, expandable full text and copy. */
export function ErrorRow({ event, latest = false }: { event: ChatEvent; latest?: boolean }) {
  const [open, setOpen] = useState(false);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const text = (event.text ?? '').trim() || 'Неизвестная ошибка';
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const expandable = text.includes('\n') || firstLine.length > SUMMARY_LIMIT;
  return <div className="compaction-row error-row" data-event-idx={event.idx} role={latest ? 'alert' : undefined}>
    <div className="error-row-head">
      <button type="button" className="compaction-row-toggle" disabled={!expandable} aria-expanded={expandable ? open : undefined} onClick={() => setOpen(value => !value)}>
        <span className="compaction-row-leading" aria-hidden="true"><CircleAlert className="compaction-row-context" size={14} />{expandable && (open ? <ChevronDown className="compaction-row-disclosure" size={14} /> : <ChevronRight className="compaction-row-disclosure" size={14} />)}</span>
        <span className="error-row-title">Ошибка</span><span className="compaction-row-sep" aria-hidden="true" /><span className="compaction-row-label">{firstLine}</span>
      </button>
      <button type="button" className="error-row-copy" aria-label={copy === 'copied' ? 'Скопировано' : 'Копировать ошибку'} onClick={async () => { try { await navigator.clipboard.writeText(text); setCopy('copied'); } catch { setCopy('failed'); } }} onBlur={() => setCopy('idle')} onMouseLeave={() => setCopy(state => state === 'copied' ? 'idle' : state)}>
        {copy === 'copied' ? <Check size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}
      </button>
      {copy === 'failed' && <span className="error-row-copy-status" role="status">Не удалось скопировать</span>}
    </div>
    {open && expandable && <pre className="compaction-row-body retry-row-body error-row-body">{text}</pre>}
  </div>;
}
