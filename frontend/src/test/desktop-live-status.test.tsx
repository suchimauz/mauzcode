import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LiveStatus } from '../lib/live';
import { LiveComposer } from '../components/mauzcode/LiveComposer';
import { DesktopLiveStatus } from '../components/mauzcode/DesktopLiveStatus';
vi.mock('../lib/goal', async importOriginal => ({ ...await importOriginal<typeof import('../lib/goal')>(), getGoal: vi.fn().mockResolvedValue({ version: 1, enabled: false }) }));
vi.mock('../lib/todos', () => ({ getTodos: vi.fn().mockResolvedValue({ todos: null }) }));
vi.mock('../lib/triggers', async importOriginal => ({ ...await importOriginal<typeof import('../lib/triggers')>(), getArmedTriggers: vi.fn().mockResolvedValue({ agentId: '', counts: { at: 0, cron: 0, watch: 0 }, triggers: [] }) }));
vi.mock('../sdk/live', () => ({ subscribeLive: () => () => {} }));
vi.mock('../lib/queue', async importOriginal => ({ ...await importOriginal<typeof import('../lib/queue')>(), getQueue: vi.fn().mockResolvedValue({ items: [] }) }));

const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let listeners: Array<(status: LiveStatus) => void>;
let status: LiveStatus;
const change = (next: LiveStatus) => act(() => { status = next; listeners.forEach(listener => listener(next)); });
const desktopWindow = window as Window & { mauzcodeDesktopLive?: unknown };
beforeEach(() => {
  listeners = []; status = 'connected';
  window.mauzcodeLive = { subscribe: () => () => {}, getStatus: () => status, onStatus: listener => { listeners.push(listener); return () => { listeners = listeners.filter(l => l !== listener); }; } };
});
afterEach(() => { delete window.mauzcodeLive; delete desktopWindow.mauzcodeDesktopLive; vi.unstubAllGlobals(); sessionStorage.clear(); });

it('desktop: announces loss and recovery of the open chat without touching its draft, focus or submissions', async () => {
  desktopWindow.mauzcodeDesktopLive = { status: vi.fn(), onRetry: vi.fn() };
  const fetcher = vi.fn((url: string, _init?: RequestInit) => url.includes('/ui-lab-api/models') ? Promise.resolve(json({ models: [] })) : url.startsWith('/voice/api') ? Promise.resolve(json({ error: 'Only owners' }, 403)) : url.endsWith('/context') ? Promise.resolve(json({ budget: null })) : Promise.resolve(json({ ok: true, messageIdx: 1 })));
  vi.stubGlobal('fetch', fetcher);
  render(<><DesktopLiveStatus restoredMs={50} graceMs={0} /><LiveComposer agentId="fixture" running={false} onAccepted={vi.fn()} /></>);
  const region = screen.getByRole('status', { name: '' });
  expect(region).toHaveAttribute('aria-live', 'polite'); expect(region).toBeEmptyDOMElement();
  const box = screen.getByRole('textbox');
  await userEvent.type(box, 'Черновик');
  const postsBefore = fetcher.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST').length;
  await vi.waitFor(() => expect(listeners).toHaveLength(1));
  change('disconnected');
  expect(region).toHaveTextContent('Связь потеряна, переподключаемся…');
  expect(region).toHaveTextContent('Черновик сохранён'); expect(region.querySelector('kbd')?.textContent).toMatch(/⌘R|Ctrl\+R/);
  change('connecting');
  expect(region).toHaveTextContent('Связь потеряна');
  change('connected');
  expect(region).toHaveTextContent('Связь восстановлена.');
  await vi.waitFor(() => expect(region).toBeEmptyDOMElement());
  expect(box).toHaveFocus(); expect(box).toHaveTextContent('Черновик');
  const posts = fetcher.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
  expect(posts).toHaveLength(postsBefore); expect(posts.filter(([url]) => String(url).startsWith('/agent/'))).toHaveLength(0);
});

it('browser: renders nothing and subscribes to no status', () => {
  const { container } = render(<DesktopLiveStatus />);
  expect(container).toBeEmptyDOMElement(); expect(listeners).toHaveLength(0);
});

it('desktop: a short planned reconnect (chat switch) is not announced as a lost connection', async () => {
  desktopWindow.mauzcodeDesktopLive = { status: vi.fn(), onRetry: vi.fn() };
  render(<DesktopLiveStatus graceMs={100} />);
  const region = screen.getByRole('status');
  await vi.waitFor(() => expect(listeners).toHaveLength(1));
  change('connecting');
  change('connected');
  await new Promise(resolve => setTimeout(resolve, 150));
  expect(region).toBeEmptyDOMElement();
  change('disconnected');
  await vi.waitFor(() => expect(region).toHaveTextContent('Связь потеряна'));
});
