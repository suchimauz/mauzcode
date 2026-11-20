import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Delete, Pause, Play, RotateCcw, Send, X } from 'lucide-react';
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

const COARSE = '(pointer: coarse)';
/** Touch devices always get the mobile layout; a narrow composer with a fine pointer is handled by CSS alone. */
function useCoarsePointer() {
  const [coarse, setCoarse] = useState(() => !!window.matchMedia?.(COARSE).matches);
  useEffect(() => {
    const query = window.matchMedia?.(COARSE); if (!query) return;
    const change = () => setCoarse(query.matches);
    query.addEventListener?.('change', change);
    return () => query.removeEventListener?.('change', change);
  }, []);
  return coarse;
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
  /** The composer's last send failure, shown in the panel's single error line when there is no capture error. */
  sendError?: string;
  /** The model picker, shown at the left of the input bar (icon only on a touch device). */
  model?: ReactNode;
  /** The add button, kept in place on the first line but disabled. */
  leading?: ReactNode;
};

/**
 * Dedicated voice mode shown instead of the ordinary editor. Shortcuts are bound to this container only: Space pauses or
 * resumes, Enter requests send, Escape stops capture and returns to the editor. They never fire for typing outside the
 * panel, and a focused button or text field inside it keeps its native keys. Every shortcut has a labelled button.
 * One polite live region announces state changes and the 1 min / 10 s thresholds; transcript text is never in it.
 * It reuses the ordinary input frame: the transcript replaces the text, the add button stays disabled on the first line,
 * and the bar holds the model, waveform with time, clear, pause/resume, exit and send. The state is conveyed by the
 * waveform, the toggle icon, the time and the accent frame (the state label is screen-reader only). Tooltips name the
 * shortcuts; there is no hint line. See voice-panel.css.
 */
export function VoicePanel({ capture, text, attachments, onToggle, onClear, canClear, onExit, onSend, busy, canSubmit, sendError, model, leading }: VoicePanelProps) {
  const root = useRef<HTMLElement>(null);
  const id = useId();
  const coarse = useCoarsePointer();
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

  // One error line: the capture error leads; a send failure replaces its generic tail so neither message is lost.
  const errorText = state === 'error' && error
    ? <>{error.code === 'superseded' ? `${MOVED}.` : error.message}{error.errorId && <> ID: <code>{error.errorId}</code></>} {sendError || 'Текст сохранён; можно продолжить запись или вернуться к редактированию.'}</>
    : sendError ? <>{sendError}</> : null;
  const ToggleIcon = running ? Pause : state === 'error' ? RotateCcw : Play;
  const clearTitle = canClear ? 'Очистить диктовку' : 'Надиктованного текста нет';

  // The ordinary input frame: transcript in the text area, controls in the bar, the error line inside the frame.
  return <section ref={root} className={`voice-panel message-input has-bar${leading ? ' has-leading' : ''}`} tabIndex={-1} aria-label="Голосовой режим" aria-describedby={`${id}-state ${id}-keys`} data-state={state} data-error={errorText ? true : undefined} data-can-clear={canClear || undefined} onKeyDown={keyDown}>
    <p id={`${id}-keys`} className="sr-only">Пробел — пауза или продолжение, Enter — отправить, Escape — выйти в поле ввода. Клавиши работают, пока фокус на самой панели или в тексте сообщения; на кнопках действуют их собственные клавиши.</p>
    <span id={`${id}-state`} className="sr-only">{STATE_LABEL[state]}</span>
    {attachments}
    <div className="message-input-row">{leading && <span className="message-input-leading">{leading}</span>}
      <div className="voice-panel-transcript" tabIndex={0} role="group" aria-label="Текст сообщения">
        {text ? text : <span className="voice-panel-placeholder">Говорите — текст появится здесь и в поле сообщения.</span>}
      </div>
    </div>
    {/* A capture error is announced by the live region below; a send failure has no announcement there. */}
    {errorText && <p className="voice-panel-error" role={state === 'error' && error ? undefined : 'alert'}>{errorText}</p>}
    <div className="composer-inbar voice-panel-controls" role="group" aria-label="Управление голосовым режимом">
      {model}
      <span className="composer-inbar-spacer" />
      <span className="voice-panel-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>
      <span className="voice-panel-time">{remainingMs != null && state === 'listening' && <><span className="sr-only">осталось </span><time>{clock(remainingMs)}</time></>}</span>
      <button type="button" className="voice-panel-button voice-panel-clear" aria-label="Очистить диктовку" title={clearTitle} hidden={coarse && !canClear} disabled={busy} aria-disabled={canClear ? undefined : true} onClick={() => { if (canClear) onClear(); }}>
        <Delete size={16} aria-hidden="true" />
      </button>
      <button type="button" className="voice-panel-button voice-panel-toggle" aria-label={toggleLabel} title={coarse ? toggleLabel : `${toggleLabel} (Пробел)`} aria-keyshortcuts="Space" disabled={toggleDisabled} onClick={onToggle}>
        <ToggleIcon size={16} aria-hidden="true" />
      </button>
      <button type="button" className="voice-panel-button voice-panel-exit" aria-label="Выйти" title={coarse ? 'Выйти' : 'Выйти (Esc)'} aria-keyshortcuts="Escape" disabled={busy} onClick={onExit}>
        <X size={16} aria-hidden="true" />
      </button>
      <button type="button" className="voice-panel-button voice-panel-send" aria-label="Отправить" title={coarse ? 'Отправить' : 'Отправить (Enter)'} aria-keyshortcuts="Enter" disabled={busy || !canSubmit} onClick={onSend}>
        <Send size={16} aria-hidden="true" />
      </button>
    </div>
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
  </section>;
}
