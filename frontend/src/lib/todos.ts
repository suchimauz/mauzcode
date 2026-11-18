import { requestJson } from './mauzcode';

export type TodoStatus = 'pending' | 'active' | 'done';
export type Todo = { id: string; title: string; instructions: string; status: TodoStatus };
export type TodoList = { title: string; paused: boolean; tasks: Todo[] };
export type TodoSnapshot = { todos: TodoList | null };
/** Read-only projection of the agent's own todos; timing internals are never returned. */
export const getTodos = (agentId: string, signal?: AbortSignal) =>
  requestJson<TodoSnapshot>(`/agent/${encodeURIComponent(agentId)}/todos`, { signal });
