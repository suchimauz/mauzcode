import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUp, Check, Pencil, Trash2, X } from 'lucide-react';
import type { QueueItem } from '../../lib/queue';
import type { useMessageQueue } from '../../hooks/useMessageQueue';
import { Dock, DockHeader, DockNotice } from './ComposerDock';
import './queue-dock.css';
import { QueueGlyph } from './QueueGlyph';
import { IconButton } from '../ui/IconButton';
import { useAutoGrow } from '../../hooks/useAutoGrow';

type Props = { queue: ReturnType<typeof useMessageQueue>; running: boolean; disabled?: boolean };
/** Durable next-turn messages, with text-only editing and explicit steer controls. */
export function QueueDock({ queue, running, disabled }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<QueueItem | null>(null);
  const [text, setText] = useState('');
  const editButton = useRef<HTMLButtonElement | null>(null);
  const listId = useId();
  const rows = [...queue.items, ...(queue.sending ? [queue.sending] : [])];
  const forced = !!editing || !!queue.processing ;
  const open = rows.length <= 1 || expanded || forced;
  useEffect(() => {
    if (!rows.length) setExpanded(false);
    if (editing && (disabled || !queue.items.some(item => item.id === editing.id))) setEditing(null);
  }, [rows.length, queue.items, disabled, editing]);
  const editorInput = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(editorInput, editing ? text : '');
  const close = () => { setEditing(null); editButton.current?.focus(); };
  const save = async () => { if (editing && text.trim() && await queue.perform([editing], 'edit', text.trim())) close(); };
  if (!rows.length && !queue.error) return null;
  const several = rows.length > 1;
  const sendingNote = !open && queue.sending ? <span role="status">Отправка…</span> : null;
  return <Dock className="queue-dock" label="Очередь сообщений" aria-busy={!!queue.processing} expanded={several && open}>
    {rows.length > 0 && (several
      ? <DockHeader icon={<QueueGlyph />} expanded={open} controls={listId} disabled={forced} onToggle={() => setExpanded(!expanded)} actions={sendingNote}>В очереди: {rows.length}</DockHeader>
      : <DockHeader icon={<QueueGlyph />}>В очереди: {rows.length}</DockHeader>)}
    {open && <ul id={listId} className="dock-body dock-list">{rows.map(item => {
      const pending = item === queue.sending;
      const active = editing?.id === item.id;
      const busy = disabled || pending || !!queue.processing;
      return <li className="dock-row queue-row" key={item.id}>
        {active ? <><textarea ref={editorInput} autoFocus rows={1} className="dock-input queue-editor" aria-label="Текст сообщения в очереди" value={text} disabled={busy} onChange={event => setText(event.target.value)} onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape') { event.preventDefault(); close(); }
          if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void save(); }
        }} /><div className="dock-row-actions"><IconButton size="compact" label="Сохранить сообщение" tooltip="Сохранить · Enter" disabled={busy || !text.trim()} onClick={() => void save()}><Check size={16} /></IconButton><IconButton size="compact" label="Отменить редактирование" tooltip="Отменить · Escape" disabled={busy} onClick={close}><X size={16} /></IconButton></div></> : <>
          {!!item.files.length && <span className="queue-files">{item.files.map((file, index) => <span className="queue-file" key={index} title={`${file.name} (${file.size} B)`}><span className="queue-file-name">{file.name}</span><span className="queue-file-size">{file.size < 1024 ? `${file.size} B` : file.size < 1048576 ? `${Math.round(file.size / 1024)} KB` : `${(file.size / 1048576).toFixed(1)} MB`}</span></span>)}</span>}
          <span className="dock-row-text queue-preview" title={item.text}>{item.text.replace(/\s+/g, ' ') || (item.files.length ? 'Вложения' : '')}</span>
          {(pending || queue.processing === item.id) && <span className="dock-meta" role="status">{pending ? 'Отправка…' : 'Обработка…'}</span>}
          <div className="dock-row-actions">
            <IconButton size="compact" label="Редактировать сообщение" tooltip={item.files.length ? 'Редактирование вложений недоступно' : 'Редактировать'} disabled={busy || !!item.files.length} onClick={event => { editButton.current = event.currentTarget; setEditing(item); setText(item.text); }}><Pencil size={16} /></IconButton>
            <IconButton size="compact" label="Удалить из очереди" tooltip="Удалить" disabled={busy} onClick={() => void queue.perform([item], 'remove')}><Trash2 size={16} /></IconButton>
            <IconButton size="compact" label="Направить агенту сейчас" tooltip="Направить агенту сейчас" disabled={busy || !running || queue.waitingForInput} onClick={() => void queue.perform([item], 'steer')}><ArrowUp size={16} /></IconButton>
          </div>
        </>}
      </li>;
    })}</ul>}
    {queue.error && <DockNotice tone="error" action={{ label: 'Обновить очередь', onClick: () => void queue.refresh() }}>{queue.error}</DockNotice>}
  </Dock>;
}
