import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectedPlanningPanel } from '../components/mauzcode/ConnectedPlanningPanel';
import { ComposerFooter } from '../components/mauzcode/ComposerFooter';
import { ComposerStatusRow } from '../components/mauzcode/ComposerStatusRow';
import { MessageInput } from '../components/mauzcode/MessageInput';
const json = (body: object) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const state = { version: 1, agentId: 'a', mode: 'plan', revision: 1, scope: 'session', advisory: true, runningPolicy: 'reject', csrfToken: 'token', proposal: null };
afterEach(() => vi.unstubAllGlobals());
function ui(running = false, readOnly = false) {
  return <ConnectedPlanningPanel agentId="a" running={running} readOnly={readOnly} onAccepted={vi.fn()}>{badge => <div className="composer-input-anchor"><ComposerStatusRow modes={badge} /><MessageInput value="" onChange={vi.fn()} onSend={vi.fn()} /><ComposerFooter agentId="a" running={running} busy={false} revision={0} /></div>}</ConnectedPlanningPanel>;
}
it('places active Plan in the status row above the input, with no review card or duplicate planning fetch; exits via commands', async () => {
  let exited = false;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/commands') return json({ version: 1, commands: [], csrfToken: 'token' });
    if (init?.method === 'POST') { exited = true; return json({ ok: true, status: 'completed' }); }
    if (url.endsWith('/planning')) return json({ ...state, mode: exited ? 'execute' : 'plan' });
    return json({ budget: null });
  });
  vi.stubGlobal('fetch', fetcher); render(ui());
  const badge = await screen.findByRole('button', { name: 'Plan — выйти из режима планирования' });
  const row = screen.getByRole('group', { name: 'Режимы чата' });
  expect(row).toContainElement(badge);
  expect(row.nextElementSibling).toBe(screen.getByRole('form', { name: 'Ввод сообщения' }));
  expect(document.querySelector('.composer-footer')).not.toContainElement(badge);
  expect(screen.queryByRole('heading', { name: 'Plan mode' })).toBeNull();
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/planning'))).toHaveLength(1);
  badge.focus(); await userEvent.keyboard('{Enter}');
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Plan — выйти из режима планирования' })).toBeNull());
  const posts = fetcher.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(posts).toHaveLength(1); expect(posts[0][0]).toBe('/agent/a/commands');
  expect(JSON.parse(posts[0][1]!.body as string)).toEqual({ text: '/plan off', requestId: expect.any(String) });
});
it.each([[true, false], [false, true]])('locks mode exit when running=%s readOnly=%s', async (running, readOnly) => {
  const fetcher = vi.fn(async (url: string) => json(url.endsWith('/planning') ? state : { budget: null }));
  vi.stubGlobal('fetch', fetcher); render(ui(running, readOnly));
  const badge = await screen.findByRole('button', { name: 'Plan — выйти из режима планирования' });
  expect(badge).toBeDisabled(); await userEvent.click(badge);
  expect(fetcher.mock.calls.every(([url]) => url !== '/commands')).toBe(true);
});
it('retains both real proposal review actions while the footer shows Plan', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => json(url.endsWith('/planning') ? { ...state, proposal: { id: 'p', inputId: 'i', plan: 'Real plan', status: 'pending', createdAt: 1 } } : { budget: null })));
  render(ui());
  expect(await screen.findByRole('button', { name: 'Начать реализацию' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Уточнить план' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Plan — выйти из режима планирования' })).toBeEnabled();
});
