import { afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TodoDock } from '../components/mauzcode/TodoDock';
import { getTodos, type TodoList } from '../lib/todos';

const live = vi.hoisted(() => ({ options: null as null | { onEvent: (event: unknown) => void; resync: (reason: string) => void }, stop: vi.fn() }));
vi.mock('../sdk/live', () => ({ subscribeLive: (options: typeof live.options) => { live.options = options; return live.stop; } }));
vi.mock('../lib/todos', async original => ({ ...await original<typeof import('../lib/todos')>(), getTodos: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); live.options = null; });

const list = (statuses: Array<'pending' | 'active' | 'done'>, extra: Partial<TodoList> = {}): { todos: TodoList } => ({ todos: {
  title: 'Работа', paused: false, ...extra,
  tasks: statuses.map((status, index) => ({ id: `t${index}`, title: index === 2 ? 'Write tests' : `Todo ${index}`, instructions: index === 2 ? 'Cover edge cases' : '', status })),
} });

it('is hidden without todos and when every todo is done', async () => {
  vi.mocked(getTodos).mockResolvedValue({ todos: null });
  const { container, unmount } = render(<TodoDock agentId="a" />);
  await waitFor(() => expect(getTodos).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement(); unmount();
  vi.mocked(getTodos).mockResolvedValue(list(['done', 'done']));
  const second = render(<TodoDock agentId="a" />);
  await waitFor(() => expect(getTodos).toHaveBeenCalledTimes(2));
  expect(second.container).toBeEmptyDOMElement();
});

it('shows the active todo with a counter and expands into the read-only list', async () => {
  vi.mocked(getTodos).mockResolvedValue(list(['done', 'done', 'active', 'pending', 'pending']));
  render(<TodoDock agentId="a" />);
  const header = await screen.findByRole('button', { name: /Write tests/ });
  expect(header).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByText('2/5')).toBeInTheDocument();
  fireEvent.click(header);
  expect(header).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getAllByRole('listitem')).toHaveLength(5);
  expect(screen.getByText('Cover edge cases')).toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(1);
  fireEvent.click(header);
  expect(screen.queryAllByRole('listitem')).toHaveLength(0);
});

it('counts several active todos and marks a paused list', async () => {
  vi.mocked(getTodos).mockResolvedValue(list(['active', 'active', 'pending'], { paused: true }));
  render(<TodoDock agentId="a" />);
  expect(await screen.findByText('В работе 2 задачи')).toBeInTheDocument();
  expect(screen.getByText('Пауза')).toBeInTheDocument();
});

it('refreshes on own todos/all hints and resync, never on team hints or other agents', async () => {
  vi.mocked(getTodos).mockResolvedValue(list(['active', 'pending']));
  render(<TodoDock agentId="a" />);
  await screen.findByText('0/2');
  expect(getTodos).toHaveBeenCalledTimes(1);
  vi.mocked(getTodos).mockResolvedValue(list(['done', 'active']));
  await act(async () => { live.options!.onEvent({ type: 'ui.metaSection', agentId: 'a', section: 'team' }); });
  await act(async () => { live.options!.onEvent({ type: 'ui.metaSection', agentId: 'b', section: 'todos' }); });
  expect(getTodos).toHaveBeenCalledTimes(1);
  await act(async () => { live.options!.onEvent({ type: 'ui.metaSection', agentId: 'a', section: 'todos' }); });
  expect(await screen.findByText('1/2')).toBeInTheDocument();
  await act(async () => { live.options!.onEvent({ type: 'ui.metaSection', agentId: 'a', section: 'all' }); });
  await act(async () => { live.options!.resync('reconnect'); });
  expect(getTodos).toHaveBeenCalledTimes(4);
});
