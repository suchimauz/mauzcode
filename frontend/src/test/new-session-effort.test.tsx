import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { NewSessionComposer } from '../components/mauzcode/NewSessionComposer';
import type { NewSessionDraft } from '../lib/newSession';

vi.mock('../components/mauzcode/CrabMascot', () => ({ CrabMascot: () => null }));
vi.mock('../lib/newSession', async original => ({ ...await original<typeof import('../lib/newSession')>(), getNewSessionDefaults: vi.fn(async () => ({ version: 1, defaultModel: 'test/work:a', csrfToken: 'token' })), submitNewSession: vi.fn() }));
vi.mock('../lib/live', () => ({ loadLiveClient: async () => {} }));

const icon = null;
const models = [
  { provider: 'test', model: 'test/work:a', label: 'Alpha', groupLabel: 'work', icon, disabled: false },
  { provider: 'test', model: 'test/work:b', label: 'Beta', groupLabel: 'work', icon, disabled: false },
];
const projects = [{ id: 'p1', title: 'First', dir: '/first', host: null, chats: [] }];
const created = vi.fn();
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); sessionStorage.clear(); localStorage.clear(); });

function Draft({ initial }: { initial: NewSessionDraft }) {
  const [draft, setDraft] = useState(initial);
  return <NewSessionComposer draft={draft} onChange={setDraft} projects={projects} onCreated={created} onPending={() => {}} />;
}

/** Read-only new-session config: both models list low/high; nothing here can mutate an agent. */
function stubConfig() {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') throw new Error('unexpected mutation ' + url);
    const model = new URL(url, 'http://test').searchParams.get('model') || 'test/work:a';
    return new Response(JSON.stringify({ model, defaultModel: 'test/work:a', label: model, icon, models, groups: [], effort: { requested: 'auto', applied: 'medium', supported: ['low', 'high'], mode: 'openai-effort' } }), { headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

it('a draft model switch shows Default and submits auto with the new route, without agent writes; a manual level then wins', async () => {
  const { submitNewSession } = await import('../lib/newSession');
  vi.mocked(submitNewSession).mockResolvedValue({ agentId: 'zz', projectId: 'p1', status: 'created' });
  const fetcher = stubConfig();
  const view = render(<Draft initial={{ projectId: 'p1', model: 'test/work:a', effort: 'high', text: '', requestKey: 'k1' }} />);
  const trigger = await screen.findByRole('button', { name: /Выбрать модель: Alpha/ });
  await userEvent.click(trigger);
  expect(await screen.findByRole('menuitem', { name: 'Effort High' })).toBeVisible();
  await userEvent.click(screen.getByRole('menuitem', { name: /Model Alpha/ }));
  await userEvent.click(screen.getByRole('menuitemradio', { name: 'Beta' }));
  await userEvent.click(await screen.findByRole('button', { name: /Выбрать модель: Beta/ }));
  expect(await screen.findByRole('menuitem', { name: 'Effort Default' })).toBeVisible();
  await userEvent.keyboard('{Escape}');
  fireEvent.submit(screen.getByRole('form', { name: 'Ввод сообщения' }));
  await waitFor(() => expect(created).toHaveBeenCalledWith('zz'));
  expect(submitNewSession).toHaveBeenCalledWith(expect.objectContaining({ model: 'test/work:b', effort: 'auto' }), 'token');
  expect(fetcher.mock.calls.every(call => !(call as unknown as [string, RequestInit?])[1]?.method || (call as unknown as [string, RequestInit?])[1]?.method === 'GET')).toBe(true);
  view.unmount();

  vi.mocked(submitNewSession).mockClear(); created.mockClear();
  render(<Draft initial={{ projectId: 'p1', model: 'test/work:a', effort: 'high', text: '', requestKey: 'k2' }} />);
  await userEvent.click(await screen.findByRole('button', { name: /Выбрать модель: Alpha/ }));
  await userEvent.click(await screen.findByRole('menuitem', { name: /Model Alpha/ }));
  await userEvent.click(screen.getByRole('menuitemradio', { name: 'Beta' }));
  await userEvent.click(await screen.findByRole('button', { name: /Выбрать модель: Beta/ }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Effort Default' }));
  await userEvent.click(screen.getByRole('menuitemradio', { name: 'High' }));
  await waitFor(() => expect(screen.getByRole('button', { name: /Выбрать модель: Beta/ })).toBeEnabled());
  fireEvent.submit(screen.getByRole('form', { name: 'Ввод сообщения' }));
  await waitFor(() => expect(created).toHaveBeenCalledWith('zz'));
  expect(submitNewSession).toHaveBeenCalledWith(expect.objectContaining({ model: 'test/work:b', effort: 'high' }), 'token');
});

it('restoring a draft for the same available route keeps its explicit effort through submission', async () => {
  const { submitNewSession } = await import('../lib/newSession');
  vi.mocked(submitNewSession).mockResolvedValue({ agentId: 'yy', projectId: 'p1', status: 'created' });
  stubConfig();
  render(<Draft initial={{ projectId: 'p1', model: 'test/work:b', effort: 'high', text: '', requestKey: 'k3' }} />);
  await screen.findByRole('button', { name: /Выбрать модель: Beta/ });
  await waitFor(() => expect(screen.getByRole('button', { name: /Выбрать модель: Beta/ })).toBeEnabled());
  fireEvent.submit(screen.getByRole('form', { name: 'Ввод сообщения' }));
  await waitFor(() => expect(created).toHaveBeenCalledWith('yy'));
  expect(submitNewSession).toHaveBeenCalledWith(expect.objectContaining({ model: 'test/work:b', effort: 'high' }), 'token');
});
