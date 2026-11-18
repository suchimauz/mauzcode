import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Circle, CircleCheck, CircleDot, ListChecks } from 'lucide-react';
import { getTodos, type TodoList, type TodoStatus } from '../../lib/todos';
import { subscribeLive } from '../../sdk/live';
import './queue-dock.css';
import './todo-dock.css';

const statusLabel: Record<TodoStatus, string> = { pending: 'Ожидает', active: 'В работе', done: 'Готово' };
const plural = (count: number) => count % 10 === 1 && count % 100 !== 11 ? 'задача' : [2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? 'задачи' : 'задач';

function Marker({ status }: { status: TodoStatus }) {
  const Icon = status === 'done' ? CircleCheck : status === 'active' ? CircleDot : Circle;
  return <Icon size={14} className="todo-marker" data-status={status} aria-hidden="true" />;
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
  return <section className="queue-dock todo-dock" aria-label="Задачи агента">
    <button type="button" className="queue-header todo-header" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(value => !value)}>
      <ListChecks size={16} className="queue-lead" aria-hidden="true" />
      {expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
      <span className="todo-summary">{summary}</span>
      {todos?.paused && <span className="todo-paused">Пауза</span>}
      <span className="todo-progress" aria-label={`Выполнено ${done} из ${tasks.length}`}>{done}/{tasks.length}</span>
    </button>
    {expanded && <div id={listId} className="todo-body">
      {todos?.title && <p className="todo-title">{todos.title}</p>}
      <ol className="queue-list todo-list">{tasks.map(task => <li key={task.id} className="queue-row todo-row" data-status={task.status}>
        <Marker status={task.status} />
        <span className="sr-only">{statusLabel[task.status]}: </span>
        {task.instructions
          ? <details className="todo-details"><summary className="todo-text">{task.title}</summary><p>{task.instructions}</p></details>
          : <span className="todo-text">{task.title}</span>}
      </li>)}</ol>
    </div>}
  </section>;
}
