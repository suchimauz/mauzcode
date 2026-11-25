import { useState } from 'react';
import { BookOpen, Check, Copy } from 'lucide-react';

/** Friendly, copyable label for a stored skill invocation; copy always yields the exact slash token. */
export function SkillChip({ token, label }: { token: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async () => {
    try { await navigator.clipboard.writeText(token); setState('copied'); } catch { setState('failed'); }
  };
  return <span className="skill-chip" title={token}>
    <BookOpen size={13} strokeWidth={1.3} aria-hidden="true" />
    <span className="skill-chip-label">{label}</span>
    <button type="button" className="skill-chip-copy" aria-label={state === 'copied' ? `Скопировано: ${token}` : `Копировать ${token}`} onClick={copy} onBlur={() => setState('idle')}>
      {state === 'copied' ? <Check size={12} strokeWidth={1.3} aria-hidden="true" /> : <Copy size={12} strokeWidth={1.3} aria-hidden="true" />}
    </button>
    {state === 'failed' && <span role="status" className="skill-chip-status">Не удалось скопировать</span>}
  </span>;
}
