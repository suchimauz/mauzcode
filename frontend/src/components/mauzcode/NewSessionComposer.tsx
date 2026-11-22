import { useEffect, useRef, useState } from 'react';
import { Menu } from '@base-ui/react/menu';
import { createPortal } from 'react-dom';
import { PendingAttachments } from './PendingAttachments';
import { attachmentLimitError } from '../../lib/attachments';
import { useChatFileDrop } from '../../hooks/useChatFileDrop';
import { Check, Circle, FolderOpen } from 'lucide-react';
import { ComposerAddButton } from './ComposerAddButton';
import { MessageInput } from './MessageInput';
import { ModelPicker } from './ModelPicker';
import { MascotPicker } from './MascotPicker';
import { AgentPresetDialog, AgentPresetPicker } from './AgentPresetPicker';
import { normalizeMascotChoice } from '../../lib/mascots';
import { ApiError } from '../../lib/mauzcode';
import { runClientCommand, validateCommand } from '../../lib/commands';
import type { NavigationProject } from '../../lib/navigation';
import { clearNewSessionDraft, getNewSessionDefaults, hasRemovedSessionFields, persistNewSessionDraft, resolveNewSessionPreset, submitNewSession, type AgentPresetOption, type NewSessionDraft } from '../../lib/newSession';
import './composer-footer.css';
import './new-session.css';
const pendingKey = 'mauzcode-ui-new-session-pending';
type PendingDraft = NewSessionDraft & { fileCount?: number };
// File objects never enter storage. A reload cannot turn a file request into text-only.
const pendingFiles = new Map<string, File[]>();
function readPending(): PendingDraft | null { try { return JSON.parse(sessionStorage.getItem(pendingKey) || 'null'); } catch { return null; } }
/** A pending submit saved by the old UI with a custom directory, presets or instructions is never replayed without them. */
function readReplayablePending(): { pending: PendingDraft | null; restored?: Pick<NewSessionDraft, 'text' | 'title'> } {
  const pending = readPending();
  if (!pending || !hasRemovedSessionFields(pending)) return { pending };
  try { sessionStorage.removeItem(pendingKey); } catch { /* Optional storage. */ }
  return { pending: null, restored: { text: typeof pending.text === 'string' ? pending.text : '', title: typeof pending.title === 'string' ? pending.title : '' } };
}
/** No agent-scoped endpoints run here. The first submit is the sole creation boundary. */
export function NewSessionComposer({ draft, onChange, projects, onCreated, onPending }: { draft: NewSessionDraft; onChange: (draft: NewSessionDraft) => void; projects: NavigationProject[]; onCreated: (id: string) => void; onPending: (pending: boolean) => void }) {
  const [initial] = useState(readReplayablePending);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [pending, setPending] = useState<PendingDraft | null>(initial.pending);
  const [error, setError] = useState('');
  const [presets, setPresets] = useState<{ list: AgentPresetOption[]; defaultId?: string }>({ list: [] });
  // Menu data only; a failed load leaves the chip disabled and the server applies its default preset.
  useEffect(() => {
    const controller = new AbortController();
    getNewSessionDefaults(controller.signal).then(data => { if (!controller.signal.aborted) setPresets({ list: [...(data?.presets ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)), defaultId: data?.defaultPresetId }); }).catch(() => { /* Submit reports catalogue failures. */ });
    return () => controller.abort();
  }, []);
  useEffect(() => { if (initial.restored) onChange({ ...draft, ...initial.restored, requestKey: crypto.randomUUID() }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const lock = useRef(false);
  const anchor = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const locked = busy || !!pending;
  const shownFiles = pending ? pendingFiles.get(pending.requestKey) || [] : files;
  const missingFiles = !!pending?.fileCount && shownFiles.length !== pending.fileCount;
  const addFiles = (incoming: File[]) => {
    if (lock.current || locked) return;
    const next = [...files, ...incoming.filter(file => file.size > 0)];
    const problem = attachmentLimitError(next);
    if (problem) { setError(problem); return; }
    setFiles(next); setError(''); onChange({ ...draft, requestKey: crypto.randomUUID() });
  };
  const dragging = useChatFileDrop({ anchor, onFiles: addFiles, disabled: locked });
  const available = projects.filter(p => !p.archived && !p.virtual);
  const selected = available.find(p => p.id === draft.projectId);
  const shown = pending || draft;
  const mascot = normalizeMascotChoice(shown.mascot);
  // A stored preset that no longer exists falls back to the default without failing.
  const presetId = pending ? pending.presetId : resolveNewSessionPreset(presets.list, presets.defaultId, draft.presetId);
  // The preset dialog opens by itself once per mount for an unconfirmed draft; the chip reopens it.
  const [presetDialog, setPresetDialog] = useState<'auto' | 'chip' | null>(null);
  const autoOpened = useRef(false);
  const presetChip = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (autoOpened.current || presets.list.length < 2) return;
    autoOpened.current = true;
    if (!draft.presetConfirmed && !pending && !busy) setPresetDialog('auto');
  }, [presets.list.length, draft.presetConfirmed, pending, busy]);
  // Read at close time, after the state is already cleared: an auto-open hands focus to the message input.
  const presetOpenedBy = useRef<'auto' | 'chip' | null>(null);
  if (presetDialog) presetOpenedBy.current = presetDialog;
  const presetDialogFocus = () => presetOpenedBy.current === 'auto' ? anchor.current?.querySelector<HTMLElement>('[role="textbox"], textarea') ?? true : presetChip.current ?? true;
  useEffect(() => { onPending(busy || !!pending); }, [busy, pending, onPending]);
  const change = (patch: Partial<NewSessionDraft>) => { if (!busy && !pending) onChange({ ...draft, ...patch, requestKey: crypto.randomUUID() }); };
  const send = async () => {
    if (lock.current || missingFiles || (!pending && (!modelReady || !draft.model || !selected))) return;
    lock.current = true; setBusy(true); setError('');
    const snapshot = pending || { ...draft, ...(presetId ? { presetId } : {}), text: draft.text.trim(), fileCount: files.length };
    const snapshotFiles = pending ? shownFiles : [...files];
    try {
      // An empty draft creates the session without a message, so there is no command to resolve.
      const resolved = snapshot.text || snapshotFiles.length ? await validateCommand(snapshot.text, snapshotFiles.length) : null;
      if (resolved?.command.kind === 'client') {
        await runClientCommand(resolved.command.clientAction, resolved.args, { file: () => picker.current?.click() });
        change({ text: '' }); lock.current = false; setBusy(false); return;
      }
    }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); lock.current = false; setBusy(false); return; }
    pendingFiles.set(snapshot.requestKey, snapshotFiles);
    setPending(snapshot);
    try { sessionStorage.setItem(pendingKey, JSON.stringify(snapshot)); } catch { /* Mounted state retains the retry snapshot. */ }
    persistNewSessionDraft(snapshot);
    try {
      const defaults = await getNewSessionDefaults();
      const result = await (snapshotFiles.length ? submitNewSession(snapshot, defaults.csrfToken, snapshotFiles) : submitNewSession(snapshot, defaults.csrfToken));
      if ((result.status !== 'sent' && result.status !== 'created') || !result.agentId) throw new Error('Сервер не подтвердил отправку. Повторите с тем же ключом.');
      clearNewSessionDraft(); try { sessionStorage.removeItem(pendingKey); } catch { /* Optional storage. */ }
      pendingFiles.delete(snapshot.requestKey); setFiles([]); setPending(null); onCreated(result.agentId);
    } catch (err) {
      // These responses reject the payload before creation; uncertain errors retain the immutable retry.
      if (err instanceof ApiError && [400, 401, 403, 404, 413, 415, 422].includes(err.status)) { pendingFiles.delete(snapshot.requestKey); setPending(null); try { sessionStorage.removeItem(pendingKey); } catch { /* Optional storage. */ } }
      setError(err instanceof Error ? err.message : String(err));
    } finally { lock.current = false; setBusy(false); }
  };
  return <div className="new-session-composer">
    <div className="new-session-chips"><Menu.Root><Menu.Trigger className="new-session-chip" disabled={busy || !!pending} aria-label="Выбрать Workspace"><FolderOpen size={16} strokeWidth={1} /><span>{available.find(p => p.id === shown.projectId)?.title || 'Выбрать Workspace'}</span></Menu.Trigger><Menu.Portal><Menu.Positioner side="top" align="start" sideOffset={8} collisionPadding={12} className="floating-positioner"><Menu.Popup className="workspace-view-menu" aria-label="Workspace"><Menu.RadioGroup value={draft.projectId} onValueChange={projectId => change({ projectId })}>{available.map(p => <Menu.RadioItem value={p.id} key={p.id} className="workspace-menu-item" title={[p.dir,p.host].filter(Boolean).join(' · ')}><FolderOpen size={14} strokeWidth={1} /><span>{p.title}</span><Menu.RadioItemIndicator><Check size={14} strokeWidth={1} /></Menu.RadioItemIndicator></Menu.RadioItem>)}</Menu.RadioGroup></Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root><AgentPresetPicker chipRef={presetChip} presets={presets.list} value={presetId} disabled={locked} onOpen={() => setPresetDialog('chip')} /></div>
    <AgentPresetDialog open={!!presetDialog && !locked} presets={presets.list} value={presetId} defaultId={presets.defaultId} finalFocus={presetDialogFocus} onClose={() => setPresetDialog(null)} onConfirm={presetId => { change({ presetId, presetConfirmed: true }); setPresetDialog(null); }} />
    <div ref={anchor} className="composer-input-anchor"><MascotPicker value={mascot} disabled={locked} onChange={mascot => change({ mascot })} /><MessageInput bar={{ start: <ModelPicker onReadyChange={setModelReady} agentId="" running={false} busy={busy || !!pending} revision={0} onSaved={() => {}} onBusyChange={() => {}} draft={{ model: shown.model, effort: shown.effort, onChange: (model, effort) => change({ model, effort }) }} /> }} leading={<ComposerAddButton open={menuOpen} disabled={locked} onClick={() => setMenuOpen(open => !open)} />} commandsEnabled commandMenuOpen={menuOpen} onCommandMenuClose={() => setMenuOpen(false)} onFile={() => picker.current?.click()} attachments={shownFiles.length > 0 ? <PendingAttachments files={shownFiles} disabled={locked} onRemove={index => { if (!locked) { setFiles(files.filter((_, i) => i !== index)); change({}); } }} /> : undefined} onFiles={addFiles} hasAttachments={shownFiles.length > 0} value={shown.text} placeholder="How can I help you today?" disabled={busy || !!pending} allowEmptySubmit sendDisabled={!modelReady || (!pending && !selected)} onChange={text => change({ text })} onSend={() => { void send(); }} /></div>
    {dragging && anchor.current?.closest('.chat-panel') && createPortal(<div className="chat-file-drop-overlay" aria-hidden="true">Отпустите файлы, чтобы прикрепить</div>, anchor.current.closest('.chat-panel')!)}
    <input ref={picker} type="file" multiple hidden disabled={!!pending} onChange={event => { addFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
    <div className="composer-footer new-session-footer"><div className="composer-metrics-row"><span className="new-session-draft-label">{shown.title?.trim() || 'New Session'}</span><span className="composer-metrics-context new-session-context" data-level="unknown"><Circle size={14} strokeWidth={2} aria-hidden="true" /><span>—</span><span className="sr-only">Контекст ещё не создан</span></span></div></div>
    {!available.length && <p className="transcript-notice">Добавьте Workspace в навигации, чтобы начать разговор.</p>}
    {error && <p className="connection-error" role="alert">{error} {pending && 'Первое сообщение ожидает подтверждения; повтор использует тот же ключ и не создаёт второй чат.'}</p>}
    {missingFiles && <p className="connection-error" role="alert">После перезагрузки файлы недоступны. Повтор заблокирован, чтобы не отправить только текст. Проверьте созданный чат в навигации.</p>}
    {pending && !busy && !missingFiles && <button className="new-session-retry" onClick={() => { void send(); }}>Повторить отправку</button>}
  </div>;
}
