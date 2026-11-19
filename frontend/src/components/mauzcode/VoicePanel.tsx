import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Eraser, Pause, Play, Send, X } from 'lucide-react';
import type { VoiceCapture, VoiceCaptureState } from '../../hooks/useVoiceCapture';
import './voice-panel.css';

const STATE_LABEL: Record<VoiceCaptureState, string> = {
  idle: 'Запись остановлена', connecting: 'Подключение…', listening: 'Идёт запись', finalizing: 'Завершение распознавания…', paused: 'Пауза', error: 'Ошибка',
};
/**
 * Only these state changes are announced (never phrase text). Finalizing is shown but not announced: a pause passes
 * through it, and the user hears only "recording" and "paused" for it.
 */
const ANNOUNCE: Partial<Record<VoiceCaptureState, string>> = { listening: 'Идёт запись', paused: 'Пауза' };
const MOVED = 'Диктовка перешла в другую вкладку';
const THRESHOLDS = [{ ms: 60_000, text: 'Осталась 1 минута записи' }, { ms: 10_000, text: 'Осталось 10 секунд записи' }];

const clock = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/**
 * Targets whose own keys win, Escape included: buttons and other controls (Space/Enter activate them) and text entry
 * of any kind. Shortcuts act only on the panel itself and its read-only content; leaving from a focused button is its
 * own labelled "Exit" button.
 */
export function ownsKeys(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], button, a[href], summary, [role="button"], [role="link"], [role="menuitem"], [role="checkbox"], [role="switch"], [role="tab"], [role="option"]');
}

export type VoicePanelProps = {
  capture: VoiceCapture;
  /** The composer's draft; shown read-only here and readable on demand, never announced automatically. */
  text: string;
  /** The composer's pending attachments, unchanged by voice mode. */
  attachments?: ReactNode;
  onToggle: () => void;
  onClear: () => void;
  canClear: boolean;
  onExit: () => void;
  /** The ordinary composer send; no action on silence, pause, exit, or a recognition event. */
  onSend: () => void;
  canSubmit: boolean;
  busy: boolean;
};

/**
 * Dedicated voice mode shown instead of the ordinary editor. Shortcuts are bound to this container only: Space pauses or
 * resumes, Enter requests send, Escape stops capture and returns to the editor. They never fire for typing outside the
 * panel, and a focused button or text field inside it keeps its native keys. Every shortcut has a labelled button.
 * One polite live region announces state changes and the 1 min / 10 s thresholds; transcript text is never in it.
 */
export function VoicePanel({ capture, text, attachments, onToggle, onClear, canClear, onExit, onSend, busy, canSubmit }: VoicePanelProps) {
  const root = useRef<HTMLElement>(null);
  const id = useId();
  const [announcement, setAnnouncement] = useState('');
  const announced = useRef<{ state: VoiceCaptureState | null; error: string | null; generation: number; thresholds: Set<number> }>({ state: null, error: null, generation: -1, thresholds: new Set() });
  const { state, error, remainingMs, generation } = capture;

  // Voice mode takes focus so its shortcuts work at once; leaving returns focus to the editor (composer's job).
  useLayoutEffect(() => { root.current?.focus({ preventScroll: true }); }, []);

  useEffect(() => {
    const seen = announced.current;
    if (seen.generation !== generation) { seen.generation = generation; seen.thresholds = new Set(); }
    if (state === 'error') {
      const message = error?.code === 'superseded' ? MOVED : `Ошибка: ${error?.message ?? 'голосовой ввод остановлен'}`;
      if (seen.state !== 'error' || seen.error !== message) setAnnouncement(message);
      seen.state = state; seen.error = message; return;
    }
    if (seen.state !== state) { seen.state = state; seen.error = null; const text = ANNOUNCE[state]; if (text) setAnnouncement(text); }
  }, [state, error, generation]);
  useEffect(() => {
    if (remainingMs == null || state !== 'listening') return;
    const seen = announced.current;
    // Only the tightest threshold reached is announced; one already passed is never repeated in this generation.
    const reached = THRESHOLDS.filter(t => remainingMs <= t.ms && !seen.thresholds.has(t.ms));
    if (!reached.length) return;
    reached.forEach(t => seen.thresholds.add(t.ms));
    setAnnouncement(reached[reached.length - 1].text);
  }, [remainingMs, state]);

  const running = state === 'listening' || state === 'connecting';
  const toggleLabel = running ? 'Пауза' : 'Продолжить запись';
  const toggleDisabled = busy || state === 'finalizing';

  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (busy || event.defaultPrevented || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (ownsKeys(event.target)) return;
    if (event.key === ' ' || event.key === 'Spacebar') { event.preventDefault(); if (!event.repeat && !toggleDisabled) onToggle(); }
    else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (!event.repeat && canSubmit) onSend(); }
    else if (event.key === 'Escape') { event.preventDefault(); onExit(); }
  };

  return <section ref={root} className="voice-panel" tabIndex={-1} aria-label="Голосовой режим" aria-describedby={`${id}-keys`} data-state={state} onKeyDown={keyDown}>
    <p id={`${id}-keys`} className="sr-only">Пробел — пауза или продолжение, Enter — отправить, Escape — выйти в поле ввода. Клавиши работают, пока фокус на самой панели или в тексте сообщения; на кнопках действуют их собственные клавиши.</p>
    <div className="voice-panel-status">
      <span className="voice-panel-dot" aria-hidden="true" />
      <span className="voice-panel-state">{STATE_LABEL[state]}</span>
      {remainingMs != null && state === 'listening' && <span className="voice-panel-time">осталось <time>{clock(remainingMs)}</time></span>}
    </div>
    {state === 'error' && error && <p className="voice-panel-error">{error.code === 'superseded' ? `${MOVED}.` : error.message} Текст сохранён; можно продолжить запись или вернуться к редактированию.</p>}
    {attachments}
    <div className="voice-panel-transcript" tabIndex={0} role="group" aria-label="Текст сообщения">
      {text ? text : <span className="voice-panel-placeholder">Говорите — текст появится здесь и в поле сообщения.</span>}
    </div>
    <div className="voice-panel-actions" role="group" aria-label="Управление голосовым режимом">
      <button type="button" className="button button--secondary voice-panel-action" aria-keyshortcuts="Space" disabled={toggleDisabled} onClick={onToggle}>
        {running ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}<span>{toggleLabel}</span><kbd aria-hidden="true">Пробел</kbd>
      </button>
      <button type="button" className="button button--secondary voice-panel-action" disabled={busy} aria-disabled={canClear ? undefined : true} title={canClear ? undefined : 'Надиктованного текста нет'} onClick={() => { if (canClear) onClear(); }}>
        <Eraser size={14} aria-hidden="true" /><span>Очистить диктовку</span>
      </button>
      <button type="button" className="button button--primary voice-panel-action" aria-keyshortcuts="Enter" disabled={busy || !canSubmit} onClick={onSend}>
        <Send size={14} aria-hidden="true" /><span>Отправить</span><kbd aria-hidden="true">Enter</kbd>
      </button>
      <button type="button" className="button button--ghost voice-panel-action" aria-keyshortcuts="Escape" disabled={busy} onClick={onExit}>
        <X size={14} aria-hidden="true" /><span>Выйти</span><kbd aria-hidden="true">Esc</kbd>
      </button>
    </div>
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
  </section>;
}
