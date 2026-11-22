import { ComposerRegistry, useComposerRegistry, type ComposerCoordinatorProps, type ComposerLifecycle } from './ComposerCoordinator';
export { useComposerNavigation } from './ComposerCoordinator';
import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { DraftDictation } from '../../lib/inlineDictation';
import { MessageInput, type DraftCaretHandle } from './MessageInput';
import { sendMessage, stopAgent } from '../../lib/mauzcode';
import { commandToken, executeCommand, notifyPlanningChanged, runClientCommand, validateCommand } from '../../lib/commands';
import { ComposerFooter } from './ComposerFooter';
import { ModelPicker } from './ModelPicker';
import { ComposerAddButton } from './ComposerAddButton';
import { ComposerStatusRow } from './ComposerStatusRow';
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
export type LiveComposerProps = { focusRequest?: number; readOnly?: boolean; agentId: string; running: boolean; onAccepted: () => void; mascot?: ReactNode; planningBadge?: ReactNode };
export function ComposerCoordinator(props: ComposerCoordinatorProps) {
  return <ComposerRegistry {...props} render={(props, outlet, controllers) => <SessionComposer key={props.agentId} {...props} outlet={outlet} controllers={controllers} />} />;
}
export function LiveComposer(props: LiveComposerProps) {
  const registry = useComposerRegistry(); const outlet = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (registry && outlet.current) registry.attach(props, outlet.current); }, [registry, props.agentId, props.running, props.readOnly, props.onAccepted, props.planningBadge, props.focusRequest, props.mascot]);
  useLayoutEffect(() => { const node = outlet.current; return () => { if (node) registry?.detach(props.agentId, node); }; }, [registry, props.agentId]);
  return registry ? <div ref={outlet} className="composer-outlet" style={{ display: 'contents' }} /> : <SessionComposer key={props.agentId} {...props} />;
}
function SessionComposer({ focusRequest, agentId, running, onAccepted, mascot, planningBadge, readOnly = false, outlet, controllers }: LiveComposerProps & { outlet?: HTMLElement | null; controllers?: Map<string, ComposerLifecycle> }) {
  const queue = useMessageQueue(agentId, onAccepted, outlet !== null);
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [revision, setRevision] = useState(0);
  const [sentCount, setSentCount] = useState(0);
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
  const registry = useComposerRegistry();
  const voice = useVoiceEntryHub({ agentId, readOnly, panelStart: registry?.claim });
  // Which dictated phrases of this draft are still unedited, for both entry points; forgotten once the draft is sent.
  const [dictation] = useState(() => new DraftDictation());
  const inline = useInlineDictation({ text, onText: changeText, caret, dictation, readOnly });
  const panel = useVoicePanel({ text, onText: changeText, caret, capture: voice.capture, dictation, sendLock: lock, readOnly });
  const voiceHandlers: VoiceEntryHandlers = { inline: inline.handler, panel: panel.handler };
  // Phrases route through the hub even while voice mode has unmounted the footer and its entry controls.
  voice.handlers.current = voiceHandlers;
  const [notice, setNotice] = useState('');
  useLayoutEffect(() => { if (readOnly && panel.open) { setNotice('Голосовой режим остановлен: нет доступа к редактированию.'); panel.exit(); } }, [readOnly]);
  const activePanel = useRef(panel); activePanel.current = panel;
  useEffect(() => { const teardown = () => activePanel.current.exit(); window.addEventListener('pagehide', teardown); return () => window.removeEventListener('pagehide', teardown); }, []);
  const lifecycle = useRef<ComposerLifecycle>(null!);
  lifecycle.current = {
    leave: () => { if (panel.open) voice.capture.setMuted(true); else if (voice.owner === 'inline') voice.capture.cancel(); },
    supersede: () => { if (panel.open) { panel.exit(); setNotice('Голосовой режим перешёл в другой чат.'); } },
    retain: () => panel.open || !!notice || !!files.length || lock.current || dictation.owned,
  };
  useLayoutEffect(() => { controllers?.set(agentId, { leave: () => lifecycle.current.leave(), supersede: () => lifecycle.current.supersede(), retain: () => lifecycle.current.retain() }); return () => { controllers?.delete(agentId); }; }, [controllers, agentId]);
  const hub = { ...voice, claim: (mode: Parameters<typeof voice.claim>[0]) => {
    setNotice(''); voice.claim(mode);
  } };
  useLayoutEffect(() => { const e = voice.capture.error; if (panel.open && e) { setNotice(`${e.code === 'superseded' ? 'Диктовка перешла в другую вкладку.' : e.message}${e.errorId ? ` ID: ${e.errorId}` : ''}`); panel.exit(); } }, [voice.capture.error, panel.open]);
  const dragging = useChatFileDrop({ anchor, visible: outlet !== null, onFiles: addFiles, disabled: busy || readOnly });
  const capturing = ['connecting', 'listening', 'muted', 'finalizing'].includes(voice.capture.state);
  const canSubmit = capturing || !!text.trim() || files.length > 0;
  const send = async () => {
    if (!canSubmit || lock.current || readOnly) return;
    const epoch = access.current;
    lock.current = true; setBusy(true); setError('');
    try {
      if (capturing) {
        // Mute only gates input; either live state still owes us the provider's final words.
        const finalized = await (panel.open && voice.capture.session?.persistent ? voice.capture.settle() : voice.capture.finish());
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
      const queued = !commandToken(value) && (submission.target === 'queue' || (submission.target !== 'send' && (running || waiting)));
      submission.target = queued ? 'queue' : 'send';
      // Preserve endpoint AND key for uncertain retries. Never persist a file key for a text-only remount.
      if (files.length) fileSubmission.current = submission;
      persist(files.length ? { text: value, key: crypto.randomUUID() } : submission);
      const resolved = await validateCommand(value, files.length, agentId);
      if (epoch !== access.current) return;
      if (resolved?.command.kind === 'client') {
        await runClientCommand(resolved.command.clientAction, resolved.args, { agentId, csrfToken: resolved.csrfToken, file: () => fileInput.current?.click(), goal: text => setGoalEditor({ text }) });
      } else {
        if (resolved && !files.length) {
          const result = await executeCommand(agentId, value, submission.key, resolved?.csrfToken);
          if (epoch !== access.current) return;
          if (result.status === 'failed' || result.status === 'interrupted') { persist({ text: value, key: crypto.randomUUID() }); throw new Error(result.error || 'Команда не выполнена. Новая отправка начнёт новую попытку.'); }
          notifyPlanningChanged(agentId);
        } else if (queued) await queue.enqueue(value, submission.key, files);
        else { const ack = await sendMessage(agentId, value, submission.key, files); if (epoch === access.current && ack.queued) void queue.refresh(); }
      }
      if (epoch !== access.current) return;
      // A reviewed draft can also be sent after a capture error. Dismiss it on acknowledgement.
      if (panel.open && voice.capture.state === 'error') voice.capture.cancel();
      setNotice(current => current === notice ? '' : current); setFiles([]); fileSubmission.current = null; setRevision(n => n + 1);
      if (panel.open) setSentCount(n => n + 1);
      setText(''); pending.current = null; dictation.reset(); if (activePanel.current.open && voice.capture.session?.persistent) activePanel.current.nextDraft();
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

  // One picker, shown in whichever bar is visible: the editor's or voice mode's.
  const modelPicker = <ModelPicker key={agentId} agentId={agentId} running={running} busy={busy || readOnly} revision={revision} onSaved={() => { setRevision(n => n + 1); onAccepted(); }} onBusyChange={value => { lock.current = value; setBusy(value); }} />;
  if (outlet === null) return null;
  const content = <fieldset disabled={readOnly} className={`composer-readonly-boundary ${readOnly ? 'is-archived' : ''}`} aria-label={readOnly ? 'Ввод недоступен' : undefined}><div ref={anchor} className="composer-input-anchor">{dragging && anchor.current?.closest('.chat-panel') && createPortal(<div className="chat-file-drop-overlay" aria-hidden="true">Перетащите файлы, чтобы прикрепить к сообщению</div>, anchor.current.closest('.chat-panel')!)}{mascot && <div className="composer-pet-slot">{mascot}</div>}<TodoDock agentId={agentId} /><TriggerDock agentId={agentId} /><GoalDock agentId={agentId} running={running} disabled={readOnly || busy} editor={goalEditor} onClose={() => setGoalEditor(null)} onAccepted={onAccepted} /><QueueDock queue={queue} running={running} disabled={readOnly || busy} /><ComposerStatusRow modes={planningBadge} />{panel.open && <VoicePanel model={modelPicker} leading={<ComposerAddButton open={false} disabled onClick={() => {}} />} capture={voice.capture} text={text} attachments={files.length ? <PendingAttachments files={files} disabled={busy || readOnly} onRemove={removeFile} /> : undefined} busy={busy || readOnly} canSubmit={canSubmit} onSend={send} onToggle={panel.toggle} onDeleteWord={panel.deleteWord} onClear={panel.clear} canClear={panel.canClear} onExit={panel.exit} sentCount={sentCount} sendError={error || undefined} />}<div hidden={panel.open} className="voice-panel-editor"><MessageInput bar={{ start: panel.open ? undefined : modelPicker, end: readOnly || panel.open ? undefined : <VoiceEntryControls key={`voice:${agentId}`} variant="flat" agentId={agentId} busy={busy} handlers={voiceHandlers} hub={hub} /> }} leading={<ComposerAddButton open={!!menuOpen} disabled={busy || readOnly} onClick={() => { if (!panel.open) setMenuOpen(open => !open); }} />} focusRequest={(focusRequest ?? 0) + panel.returns} onSteerAll={running && !queue.waitingForInput && queue.items.length ? () => { if (!busy && !readOnly && !queue.processing) void queue.perform(queue.items, 'steer'); } : undefined} commandsEnabled commandMenuOpen={menuOpen} onCommandMenuClose={() => setMenuOpen(false)} onFile={() => fileInput.current?.click()} agentId={agentId} placeholder={running && queue.items.length ? 'Ctrl/Cmd+Enter — направить всю очередь агенту' : 'Сообщение или /команда…'} onFiles={addFiles} attachments={files.length && !panel.open ? <PendingAttachments files={files} disabled={busy || readOnly} onRemove={removeFile} /> : undefined} hasAttachments={files.length > 0} pendingVoice={capturing} value={text} disabled={busy || readOnly} running={running && !readOnly} onStop={() => { void stop(); }} onSend={() => { void send(); }}
    caretRef={caret} onChange={value => { inline.observe(value); changeText(value); }}
    notice={!panel.open && (notice || error || voice.owner === 'inline' && voice.capture.error) ? <p role="alert" className="voice-panel-error">{notice || error ? [notice, error].filter(Boolean).join(' ') : <>{voice.capture.error?.message}{voice.capture.error?.errorId && <> ID: <code>{voice.capture.error.errorId}</code></>}</>}</p> : undefined}
  /></div></div>
    <input ref={fileInput} type="file" multiple hidden aria-label="Добавить файлы" onChange={event => {
      addFiles(Array.from(event.target.files || [])); event.target.value = '';
    }} />
    {/* The metrics row stays in voice mode so the layout does not jump; notices and the stop button stay hidden. */}
    <ComposerFooter agentId={agentId} running={running} revision={revision} />
    {!panel.open && error && running && text.startsWith('/') && <button type="button" className="button button--secondary" disabled={busy || readOnly} onClick={() => { void stop(); }}>Остановить выполнение</button>}
    </fieldset>;
  return outlet ? createPortal(content, outlet) : content;
}
