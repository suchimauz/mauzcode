import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GoalDock } from '../components/mauzcode/GoalDock';
import { GoalRow } from '../components/mauzcode/GoalRow';
import type { GoalSnapshot } from '../lib/goal';

const initial: GoalSnapshot = { version: 1, enabled: true, csrfToken: 'test-token', owner: { runState: 'idle', runToken: null, stoppedAt: null }, goal: { goalId: 'one', revision: 3, objective: 'First', status: 'paused', tokenBudget: null, tokensUsed: 0, timeUsedSeconds: 0 } };
const props = { agentId: 'a', running: false, disabled: false, editor: null, onClose: vi.fn(), onAccepted: vi.fn() };
function api() {
  let current = initial;
  const post = vi.fn((url: string, body: Record<string, unknown>) => {
    if (url !== '/agent/a/persistent-goal') return Response.json({}, { status: 404 });
    current = { ...current, goal: body.action === 'clear' ? null : { ...initial.goal!, objective: String(body.objective) } };
    return Response.json({});
  });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => init.method === 'POST' ? post(url, JSON.parse(String(init.body))) : Response.json(current)));
  return { post, set: (next: GoalSnapshot) => { current = next; } };
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
const button = (name: string) => screen.getByRole('button', { name });
async function expand() { fireEvent.click(await screen.findByRole('button', { name: 'First' })); }
function open() { fireEvent.click(button('Удалить цель')); }

it('confirms the displayed revision once, keeps history and allows creating another goal', async () => {
  const { post } = api();
  const chat = (editor: {text: string} | null) => <><GoalRow event={{ idx: 1, ts: 1, type: 'goal', text: 'Older', goalStatus: 'paused' }} /><GoalDock {...props} editor={editor} /></>;
  const view = render(chat(null)); await expand(); open();
  expect(screen.getByRole('group', { name: /First/ })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Удалить цель' })).toBeNull();
  expect(button('Отмена')).toHaveFocus();
  fireEvent.keyDown(button('Отмена'), { key: 'Escape' });
  expect(button('Удалить цель')).toHaveFocus(); expect(post).not.toHaveBeenCalled();
  open(); const confirm = button('Подтвердить удаление'); fireEvent.click(confirm); fireEvent.click(confirm);
  await waitFor(() => expect(screen.queryByLabelText('Цель агента')).toBeNull());
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith('/agent/a/persistent-goal', { action: 'clear', expectedGoalId: 'one', expectedRevision: 3, expectedRunToken: null, csrfToken: 'test-token' });
  expect(screen.getByRole('button', { name: /Older/ })).toBeVisible();
  view.rerender(chat({ text: 'Next' })); fireEvent.click(button('Сохранить цель'));
  await screen.findByRole('button', { name: 'Next' });
});

it('preserves resume and edit actions for an idle paused goal', async () => {
  const { post } = api(); post.mockImplementation(() => Response.json({}));
  render(<GoalDock {...props} />); fireEvent.click(await screen.findByRole('button', { name: 'Продолжить цель' }));
  await waitFor(() => expect(button('Редактировать цель')).toBeEnabled());
  fireEvent.click(button('Редактировать цель')); fireEvent.change(screen.getByLabelText('Цель'), { target: { value: 'Edited' } });
  fireEvent.click(button('Сохранить цель')); await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  expect(post.mock.calls.map(([, body]) => body.action)).toEqual(['resume', 'edit']);
});

it('explains why removal is unavailable while running', async () => {
  const { post, set } = api(); set({ ...initial, owner: { ...initial.owner!, runState: 'running', runToken: 'busy' } });
  render(<GoalDock {...props} />); await expand(); expect(button('Удалить цель')).toBeDisabled();
  expect(screen.getByText(/когда агент не выполняет/)).toBeVisible(); expect(post).not.toHaveBeenCalled();
});

it.each(['revision', 'agent'])('invalidates confirmation on %s change', async kind => {
  const { post, set } = api(); const view = render(<GoalDock {...props} />); await expand(); open();
  if (kind === 'revision') { set({ ...initial, goal: { ...initial.goal!, revision: 4 } }); fireEvent(document, new Event('visibilitychange')); }
  else view.rerender(<GoalDock {...props} agentId="b" />);
  await waitFor(() => expect(screen.queryByRole('group')).toBeNull()); expect(post).not.toHaveBeenCalled();
});

it('reports rejection, refreshes and does not retry', async () => {
  const { post, set } = api(); post.mockImplementationOnce(() => { set({ ...initial, goal: { ...initial.goal!, objective: 'Updated', revision: 4 } }); return Response.json({ error: 'Conflict' }, { status: 409 }); });
  render(<GoalDock {...props} />); await expand(); open(); fireEvent.click(button('Подтвердить удаление'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Conflict'); await screen.findByRole('button', { name: 'Updated' });
  expect(screen.queryByRole('group')).toBeNull(); expect(post).toHaveBeenCalledTimes(1);
});
