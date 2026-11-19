import { createPortal } from 'react-dom';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { DraftDictation } from '../../lib/inlineDictation';
import { MessageInput, type DraftCaretHandle } from './MessageInput';
import { sendMessage, stopAgent } from '../../lib/mauzcode';
import { executeCommand, notifyPlanningChanged, validateCommand } from '../../lib/commands';
import { ComposerFooter } from './ComposerFooter';
import { VoiceEntryControls, useVoiceEntryHub, type VoiceEntryHandlers } from './VoiceEntryControls';
import { VoicePanel } from './VoicePanel';
import { useInlineDictation } from '../../hooks/useInlineDictation';
import { useVoicePanel } from '../../hooks/useVoicePanel';
import { PendingAttachments } from './PendingAttachments';
import { useChatFileDrop } from '../../hooks/useChatFileDrop';
import { attachmentLimitError } from '../../lib/attachments';
import { useMessageQueue } from '../../hooks/useMessageQueue';
import { QueueDock } from './QueueDock';
import { GoalDock } from './GoalDock';
import { TodoDock } from './TodoDock';
import { TriggerDock } from './TriggerDock';

type Pending = { text: string; key: string; target?: 'queue' | 'send' };
function readDraft(id: string): Pending | null {
  try { const value = JSON.parse(sessionStorage.getItem(`mauzcode-ui-draft:${id}`) || 'null'); return value && typeof value.text === 'string' && typeof value.key === 'string' ? value : null; } catch { return null; }
}
type LiveComposerProps = { focusRequest?: number; readOnly?: boolean; agentId: string; running: boolean; onAccepted: () => void; mascot?: ReactNode; planningBadge?: ReactNode };
export function LiveComposer(props: LiveComposerProps) { return <SessionComposer key={props.agentId} {...props} />; }
function SessionComposer({ focusRequest, agentId, running, onAccepted, mascot, planningBadge, readOnly = false }: LiveComposerProps) {
  const queue = useMessageQueue(agentId, onAccepted);
  const [goalEditor, setGoalEditor] = useState<{ text: string } | null>(null);
  // A pending send belongs to this editable mount only (including across read-only → editable).
  const access = useRef(0);
  useLayoutEffect(() => () => { access.current++; }, [readOnly]);
  const routing = useRef({ running, waiting: queue.waitingForInput });
  routing.current = { running, waiting: queue.waitingForInput };
  const pending = useRef<Pending | null>(readDraft(agentId));
  const [text, setText] = useState(pending.current?.text || '');
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const compactKey = useRef<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [revision, setRevision] = useState(0);
  const anchor = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileSubmission = useRef<Pending | null>(null);
  const caret = useRef<DraftCaretHandle>(null);
  const persist = (value: Pending) => { pending.current = value; try { sessionStorage.setItem(`mauzcode-ui-draft:${agentId}`, JSON.stringify(value)); } catch { /* Draft still survives retries while mounted. */ } };
  const addFiles = (added: File[]) => {
    if (lock.current || readOnly) return;
    const next = [...files, ...added]; const issue = attachmentLimitError(next);
    if (issue) { setError(issue); return; }
    setFiles(next); fileSubmission.current = null; pending.current = null; setError('');
  };
  const removeFile = (index: number) => {
    if (lock.current || readOnly) return;
    setFiles(files.filter((_, i) => i !== index)); fileSubmission.current = null; pending.current = null;
  };
  /** One ordinary draft update for typing and dictation alike: new text, new request key, nothing sent. */
  const changeText = (value: string) => {
    setText(value); fileSubmission.current = null;
    if (value !== pending.current?.text) persist({ text: value, key: crypto.randomUUID() });
  };
  // One capture controller for both voice entry points; both edit the same draft through `changeText`.
  const voice = useVoiceEntryHub({ agentId, readOnly });
  // Which dictated phrases of this draft are still unedited, for both entry points; forgotten once the draft is sent.
  const [dictation] = useState(() => new DraftDictation());
  const inline = useInlineDictation({ text, onText: changeText, caret, dictation, readOnly });
  const panel = useVoicePanel({ text, onText: changeText, caret, capture: voice.capture, dictation, readOnly });
  const voiceHandlers: VoiceEntryHandlers = { inline: inline.handler, panel: panel.handler };
  const dragging = useChatFileDrop({ anchor, onFiles: addFiles, disabled: busy || readOnly });
  const capturing = ['connecting', 'listening', 'finalizing'].includes(voice.capture.state);
  const canSubmit = capturing || !!text.trim() || files.length > 0;
  const send = async () => {
    if (!canSubmit || lock.current || readOnly) return;
    const epoch = access.current;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      if (capturing) {
        // Both actions flush the last audio and wait for recognition; only the panel stays paused.
        const finalized = await (panel.open ? voice.capture.pause() : voice.capture.finish());
        if (epoch !== access.current) return;
        if (!finalized) {
          setError('Распознавание не завершилось. Ничего не отправлено. Проверьте текст и отправьте его ещё раз.');
          return;
        }
      }
      // A final phrase can update the draft and complete in one React batch. Read the synchronous
      // draft, not the text captured by the original Enter handler. File mutations are locked above.
      const value = (pending.current?.text ?? text).trim();
      if (!value && !files.length) return;
      const prior = files.length ? fileSubmission.current : pending.current;
      const submission: Pending = prior?.text === value ? prior : { text: value, key: crypto.randomUUID() };
      const { running, waiting } = routing.current;
      const queued = !value.startsWith('/') && (submission.target === 'queue' || (submission.target !== 'send' && (running || waiting)));
      submission.target = queued ? 'queue' : 'send';
      // Preserve endpoint AND key for uncertain retries. Never persist a file key for a text-only remount.
      if (files.length) fileSubmission.current = submission;
      persist(files.length ? { text: value, key: crypto.randomUUID() } : submission);
      if (/^\/goal(?:\s|$)/.test(value)) {
        if (files.length) throw new Error('Команда /goal не принимает вложения');
        setGoalEditor({ text: value.slice(5).trim() });
      } else {
        if (value.startsWith('/') && running) throw new Error('Сначала остановите выполнение, затем повторите команду.');
        await validateCommand(value, files.length);
        if (epoch !== access.current) return;
        if (value.startsWith('/') && !files.length) {
          const result = await executeCommand(agentId, value, submission.key);
          if (epoch !== access.current) return;
          if (result.status === 'failed' || result.status === 'interrupted') { persist({ text: value, key: crypto.randomUUID() }); throw new Error(result.error || 'Команда не выполнена. Новая отправка начнёт новую попытку.'); }
          notifyPlanningChanged(agentId); setNotice('');
        } else if (queued) await queue.enqueue(value, submission.key, files);
        else { const ack = await sendMessage(agentId, value, submission.key, files); if (epoch === access.current && ack.queued) void queue.refresh(); }
      }
      if (epoch !== access.current) return;
      if (panel.open) {
        // An explicit retry after a capture error may have no live session left to finish.
        if (!capturing && voice.capture.state !== 'paused') void voice.capture.pause();
        if (!value.startsWith('/')) setNotice(queued ? 'Сообщение добавлено в очередь.' : 'Сообщение принято.');
      }
      setFiles([]); fileSubmission.current = null; setRevision(n => n + 1);
      setText(''); pending.current = null; dictation.reset();
      try { sessionStorage.removeItem(`mauzcode-ui-draft:${agentId}`); } catch { /* In-memory state has already cleared. */ }
      onAccepted();
    } catch (err) { if (epoch === access.current) setError(`${err instanceof Error ? err.message : String(err)}. Файлы сохраняются до закрытия этой страницы. Повторная отправка использует тот же ключ.`); }
    finally { lock.current = false; setBusy(false); }
  };
  const stop = async () => {
    if (lock.current || readOnly) return; lock.current = true; setBusy(true); setError('');
    try { await stopAgent(agentId); onAccepted(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { lock.current = false; setBusy(false); }
  };
  const compact = async () => {
    if (lock.current || running || readOnly) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await executeCommand(agentId, '/compact', compactKey.current ?? (compactKey.current = crypto.randomUUID()));
      if (result.status !== 'running') compactKey.current = null;
      if (result.status === 'failed' || result.status === 'interrupted') throw new Error(result.error || 'Сжатие не выполнено.');
      setRevision(n => n + 1); onAccepted();
    }
    catch (err) { setNotice(''); setError(err instanceof Error ? err.message : String(err)); }
    finally { lock.current = false; setBusy(false); }
  };
  return <fieldset disabled={readOnly} className={`composer-readonly-boundary ${readOnly ? 'is-archived' : ''}`} aria-label={readOnly ? 'Ввод недоступен' : undefined}><div ref={anchor} className="composer-input-anchor">{dragging && anchor.current?.closest('.chat-panel') && createPortal(<div className="chat-file-drop-overlay" aria-hidden="true">Перетащите файлы, чтобы прикрепить к сообщению</div>, anchor.current.closest('.chat-panel')!)}{mascot}<TodoDock agentId={agentId} /><TriggerDock agentId={agentId} /><GoalDock agentId={agentId} running={running} disabled={readOnly || busy} editor={goalEditor} onClose={() => setGoalEditor(null)} onAccepted={onAccepted} /><QueueDock queue={queue} running={running} disabled={readOnly || busy} />{panel.open && <VoicePanel capture={voice.capture} text={text} attachments={files.length ? <PendingAttachments files={files} disabled={busy || readOnly} onRemove={removeFile} /> : undefined} busy={busy || readOnly} canSubmit={canSubmit} onSend={send} onToggle={panel.toggle} onClear={panel.clear} canClear={panel.canClear} onExit={panel.exit} />}<div hidden={panel.open} className="voice-panel-editor"><MessageInput focusRequest={(focusRequest ?? 0) + panel.returns} onSteerAll={running && !queue.waitingForInput && queue.items.length ? () => { if (!busy && !readOnly && !queue.processing) void queue.perform(queue.items, 'steer'); } : undefined} commandsEnabled commandMenuOpen={menuOpen} onCommandMenuClose={() => setMenuOpen(false)} onFile={() => fileInput.current?.click()} onCompact={() => { void compact(); }} placeholder={running && queue.items.length ? 'Ctrl/Cmd+Enter — направить всю очередь агенту' : 'Сообщение или /команда…'} onFiles={addFiles} attachments={files.length && !panel.open ? <PendingAttachments files={files} disabled={busy || readOnly} onRemove={removeFile} /> : undefined} hasAttachments={files.length > 0} pendingVoice={capturing} value={text} disabled={busy || readOnly} running={running && !readOnly} onStop={() => { void stop(); }} onSend={() => { void send(); }}
    caretRef={caret} onChange={value => { inline.observe(value); changeText(value); }}
  /></div></div>
    <input ref={fileInput} type="file" multiple hidden aria-label="Добавить файлы" onChange={event => {
      addFiles(Array.from(event.target.files || [])); event.target.value = '';
    }} />
    <div><ComposerFooter planningBadge={planningBadge} onModelBusy={value => { lock.current = value; setBusy(value); }} onModelSaved={() => { setRevision(n => n + 1); onAccepted(); }} menuOpen={menuOpen} onMenuToggle={() => { if (!panel.open) setMenuOpen(open => !open); }} agentId={agentId} busy={busy || readOnly} running={running} revision={revision} voice={readOnly ? undefined : <VoiceEntryControls key={`voice:${agentId}`} agentId={agentId} busy={busy} handlers={voiceHandlers} hub={voice} />} /></div>
    {error && running && text.startsWith('/') && <button type="button" className="button button--secondary" disabled={busy || readOnly} onClick={() => { void stop(); }}>Остановить выполнение</button>}
    {notice && <p role="status" className="transcript-notice">{notice}</p>}{error && <p role="alert" className="connection-error">{error}</p>}</fieldset>;
}
