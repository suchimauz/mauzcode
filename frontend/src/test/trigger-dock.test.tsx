import { afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TriggerDock } from '../components/mauzcode/TriggerDock';
import { getArmedTriggers, postTriggerAction, outcomeMessage, type ArmedTrigger, type ArmedTriggerSnapshot } from '../lib/triggers';

const live = vi.hoisted(() => ({ options: null as null | { onEvent: (event: unknown) => void; resync: (reason: string) => void }, stop: vi.fn() }));
vi.mock('../sdk/live', () => ({ subscribeLive: (options: typeof live.options) => { live.options = options; return live.stop; } }));
vi.mock('../lib/triggers', async original => ({ ...await original<typeof import('../lib/triggers')>(), getArmedTriggers: vi.fn(), postTriggerAction: vi.fn() }));
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); live.options = null; });

const row = (id: string, kind: ArmedTrigger['kind'], extra: Partial<ArmedTrigger> = {}): ArmedTrigger => ({ id, kind, status: 'active', purpose: `Purpose ${id}`, nextAt: 1_800_000_000_000, ...extra });
const snap = (agentId: string, triggers: ArmedTrigger[]): ArmedTriggerSnapshot => ({ agentId, triggers, counts: { at: triggers.filter(t => t.kind === 'at').length, cron: triggers.filter(t => t.kind === 'cron').length, watch: triggers.filter(t => t.kind === 'watch').length } });
const hint = (agentId: string, section: string) => act(async () => { live.options!.onEvent({ type: 'ui.metaSection', agentId, section }); await new Promise(resolve => setTimeout(resolve, 150)); });

it('occupies no space without armed triggers', async () => {
  vi.mocked(getArmedTriggers).mockResolvedValue(snap('a', []));
  const { container } = render(<TriggerDock agentId="a" />);
  await waitFor(() => expect(getArmedTriggers).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
});

it('shows only positive kind counts in wake, cron, watch order and expands by keyboard', async () => {
  vi.mocked(getArmedTriggers).mockResolvedValue(snap('a', [
    row('w1', 'watch', { status: 'checking', nextAt: 1 }), row('a1', 'at', { nextAt: 2 }), row('c1', 'cron', { nextAt: 3, cronExpression: '0 9 * * *', timezone: 'Europe/Lisbon' }),
    row('a2', 'at', { nextAt: 4 }), row('w2', 'watch', { nextAt: 5, mode: 'edge' }), row('w3', 'watch', { nextAt: 6 }),
  ]));
  render(<TriggerDock agentId="a" />);
  const header = await screen.findByRole('button', { name: 'Триггеры — Разовый: 2, Расписание: 1, Условие: 3' });
  expect([...header.querySelectorAll('.dock-badge')].map(node => node.textContent)).toEqual(['Разовый2', 'Расписание1', 'Условие3']);
  expect(header).toHaveAttribute('aria-expanded', 'false');
  header.focus(); fireEvent.keyDown(header, { key: 'Enter' }); fireEvent.click(header);
  expect(header).toHaveAttribute('aria-expanded', 'true');
  const items = screen.getAllByRole('listitem');
  expect(items.map(item => item.getAttribute('data-kind'))).toEqual(['watch', 'at', 'cron', 'at', 'watch', 'watch']);
  expect(within(items[0]!).getByText(/проверяется сейчас/)).toBeInTheDocument();
  expect(within(items[2]!).getByText(/0 9 \* \* \* · Europe\/Lisbon/)).toBeInTheDocument();
  expect(within(items[4]!).getByText(/следующая проверка/)).toBeInTheDocument();
  expect(within(items[0]!).getByRole('button', { name: /Проверить сейчас/ })).toBeDisabled();
  expect(within(items[1]!).getByRole('button', { name: /Запустить сейчас/ })).toBeEnabled();
});

it('only watches remain: single group; final removal hides the panel', async () => {
  vi.mocked(getArmedTriggers).mockResolvedValue(snap('a', [row('w1', 'watch')]));
  const { container } = render(<TriggerDock agentId="a" />);
  expect(await screen.findByRole('button', { name: 'Триггеры — Условие: 1' })).toBeInTheDocument();
  vi.mocked(getArmedTriggers).mockResolvedValue(snap('a', []));
  await hint('a', 'automation');
  expect(container).toBeEmptyDOMElement();
});

it('refreshes on automation/wake/all hints and resync, never for other agents; a failed read keeps rows', async () => {
  vi.mocked(getArmedTriggers).mockResolvedValue(snap('a', [row('a1', 'at')]));
  render(<TriggerDock agentId="a" />);
  await screen.findByRole('button', { name: /Разовый: 1/ });
  await hint('b', 'automation'); await hint('a', 'todos');
  expect(getArmedTriggers).toHaveBeenCalledTimes(1);
  vi.mocked(getArmedTriggers).mockResolvedValue(snap('a', [row('a1', 'at'), row('a2', 'at')]));
  await hint('a', 'automation');
  expect(await screen.findByRole('button', { name: /Разовый: 2/ })).toBeInTheDocument();
  vi.mocked(getArmedTriggers).mockRejectedValue(new Error('offline'));
  await act(async () => { live.options!.resync('reconnect'); });
  expect(await screen.findByRole('button', { name: /Разовый: 2, данные могут быть устаревшими/ })).toBeInTheDocument();
});

it('discards a late response for a previous chat', async () => {
  let resolveOld!: (value: ArmedTriggerSnapshot) => void;
  vi.mocked(getArmedTriggers).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  const view = render(<TriggerDock agentId="a" />);
  vi.mocked(getArmedTriggers).mockResolvedValue(snap('b', [row('b1', 'cron')]));
  view.rerender(<TriggerDock agentId="b" />);
  expect(await screen.findByRole('button', { name: /Расписание: 1/ })).toBeInTheDocument();
  await act(async () => { resolveOld(snap('a', [row('a1', 'at'), row('a2', 'at')])); });
  expect(screen.queryByRole('button', { name: /Разовый/ })).toBeNull();
});

it('row actions report plain outcomes, reuse the key after a lost response and refresh', async () => {
  vi.mocked(getArmedTriggers).mockResolvedValue(snap('a', [row('a1', 'at'), row('w1', 'watch')]));
  render(<TriggerDock agentId="a" />);
  fireEvent.click(await screen.findByRole('button', { name: /Триггеры/ }));
  vi.mocked(postTriggerAction).mockRejectedValueOnce(new Error('Сеть недоступна.'));
  fireEvent.click(screen.getByRole('button', { name: 'Запустить сейчас: Purpose a1' }));
  expect(await screen.findByText(/Сеть недоступна\. Повтор не выполнит его дважды/)).toBeInTheDocument();
  vi.mocked(postTriggerAction).mockResolvedValueOnce({ ok: true, action: 'run', triggerId: 'a1', requestId: 'x', outcome: 'deferred_paused', kind: 'at' });
  fireEvent.click(screen.getByRole('button', { name: 'Запустить сейчас: Purpose a1' }));
  expect(await screen.findByText('Запланировано, выполнится после возобновления агента.')).toBeInTheDocument();
  const keys = vi.mocked(postTriggerAction).mock.calls.map(call => call[3]);
  expect(keys[0]).toBe(keys[1]);
  vi.mocked(postTriggerAction).mockResolvedValueOnce({ ok: true, action: 'run', triggerId: 'w1', requestId: 'y', outcome: 'scheduled', kind: 'watch' });
  fireEvent.click(screen.getByRole('button', { name: 'Проверить сейчас: Purpose w1' }));
  expect(await screen.findByText(/Проверка запланирована/)).toBeInTheDocument();
  expect(vi.mocked(postTriggerAction).mock.calls[2]![3]).not.toBe(keys[0]);
  vi.mocked(postTriggerAction).mockResolvedValueOnce({ ok: false, action: 'cancel', triggerId: 'a1', requestId: 'z', outcome: 'not_active', kind: 'at' });
  fireEvent.click(screen.getByRole('button', { name: 'Отменить триггер: Purpose a1' }));
  expect(await screen.findByText('Триггер уже не активен — ничего не изменено.')).toBeInTheDocument();
  expect(getArmedTriggers).toHaveBeenCalledTimes(5);
});

it('never describes scheduling as a firing', () => {
  for (const outcome of ['scheduled', 'deferred_paused', 'already_checking', 'not_active', 'cancelled', 'planning'] as const) {
    expect(outcomeMessage({ outcome, kind: 'at' })).not.toMatch(/сработал|выполнен[ао]?\b/i);
  }
});
