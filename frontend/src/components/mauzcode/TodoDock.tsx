import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Circle, CircleCheck, CircleDot, ListChecks } from 'lucide-react';
import { getTodos, type TodoList, type TodoStatus } from '../../lib/todos';
import { subscribeLive } from '../../sdk/live';
import { Dock, DockBadge, DockHeader } from './ComposerDock';
import './todo-dock.css';

const statusLabel: Record<TodoStatus, string> = { pending: 'Ожидает', active: 'В работе', done: 'Готово' };
const plural = (count: number) => count % 10 === 1 && count % 100 !== 11 ? 'задача' : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? 'задачи' : 'задач';

function Marker({ status }: { status: TodoStatus }) {
  const Icon = status === 'done' ? CircleCheck : status === 'active' ? CircleDot : Circle;
  return <Icon size={14} className="dock-row-marker todo-marker" data-status={status} aria-hidden="true" />;
}

/** Read-only dock with the open agent's own todos; refreshed only by live `todos`/`all` hints and resync. */
export function TodoDock({ agentId }: { agentId: string }) {
  const [todos, setTodos] = useState<TodoList | null>(null);
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const controller = useRef<AbortController | null>(null);
  const read = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    try { const value = await getTodos(agentId, current.signal); if (!current.signal.aborted) setTodos(value.todos); }
    catch { /* A failed read keeps the last known list and never breaks the composer. */ }
  }, [agentId]);
  useEffect(() => {
    void read();
    const stop = subscribeLive({
      name: `todo-dock:${agentId}`, types: ['ui.metaSection'],
      onEvent: event => {
        const data = event as { agentId?: string; section?: string };
        // `team` describes the agent's children, never its own todos.
        if (data.agentId === agentId && (data.section === 'todos' || data.section === 'all')) void read();
      },
      resync: () => { void read(); },
      onError: () => { /* Live updates are optional for this read-only view. */ },
    });
    return () => { stop(); controller.current?.abort(); };
  }, [agentId, read]);
  const tasks = todos?.tasks ?? [];
  const done = tasks.filter(task => task.status === 'done').length;
  if (!tasks.length || done === tasks.length) return null;
  const active = tasks.filter(task => task.status === 'active');
  const summary = active.length > 1 ? `В работе ${active.length} ${plural(active.length)}` : (active[0]?.title ?? tasks.find(task => task.status === 'pending')?.title ?? '');
  return <Dock className="todo-dock" label="Задачи агента" expanded={expanded}>
    <DockHeader icon={<ListChecks size={16} />} expanded={expanded} controls={listId} onToggle={() => setExpanded(value => !value)}
      meta={<>{todos?.paused && <DockBadge>Пауза</DockBadge>}<span aria-label={`Выполнено ${done} из ${tasks.length}`}>{done}/{tasks.length}</span></>}>
      {summary}
    </DockHeader>
    {expanded && <div id={listId} className="dock-body todo-body">
      {todos?.title && <p className="todo-title">{todos.title}</p>}
      <ol className="dock-list">{tasks.map(task => <li key={task.id} className="dock-row todo-row" data-status={task.status}>
        <Marker status={task.status} />
        <span className="sr-only">{statusLabel[task.status]}: </span>
        {task.instructions
          ? <details className="dock-row-text todo-details"><summary className="todo-text">{task.title}</summary><p className="dock-row-secondary">{task.instructions}</p></details>
          : <span className="dock-row-text todo-text">{task.title}</span>}
      </li>)}</ol>
    </div>}
  </Dock>;
}
