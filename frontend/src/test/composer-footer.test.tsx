import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComposerFooter } from '../components/mauzcode/ComposerFooter';
import { LiveComposer } from '../components/mauzcode/LiveComposer';
vi.mock('../lib/goal', async importOriginal => ({ ...await importOriginal<typeof import('../lib/goal')>(), getGoal: vi.fn().mockResolvedValue({ version: 1, enabled: false }) }));
vi.mock('../lib/todos', () => ({ getTodos: vi.fn().mockResolvedValue({ todos: null }) }));
vi.mock('../lib/triggers', async importOriginal => ({ ...await importOriginal<typeof import('../lib/triggers')>(), getArmedTriggers: vi.fn().mockResolvedValue({ agentId: '', counts: { at: 0, cron: 0, watch: 0 }, triggers: [] }) }));
vi.mock('../sdk/live', () => ({ subscribeLive: () => () => {} }));
vi.mock('../lib/queue', async importOriginal => ({ ...await importOriginal<typeof import('../lib/queue')>(), getQueue: vi.fn().mockResolvedValue({ items: [] }) }));
const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });
it('shows real context percentage and delegates the plus button to the shared menu', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ budget: { estimatedTokens: 8000, contextWindow: 200000 } })));
  const toggle = vi.fn();
  const ui = render(<ComposerFooter agentId="fixture" busy={false} running={false} revision={0} onMenuToggle={toggle} menuOpen={false} />);
  expect(await screen.findByText('4%')).toBeInTheDocument();
  const plus = screen.getByRole('button', { name: 'Добавить' });
  expect(plus).toHaveAttribute('aria-haspopup', 'listbox');
  expect(plus).toHaveAttribute('aria-expanded', 'false');
  plus.focus(); await userEvent.keyboard('{Enter}');
  expect(toggle).toHaveBeenCalledOnce();
  ui.rerender(<ComposerFooter agentId="fixture" busy={false} running={false} revision={0} onMenuToggle={toggle} menuOpen />);
  expect(plus).toHaveAttribute('aria-expanded', 'true');
  expect(screen.queryByRole('menu')).toBeNull();
});
it('shows unavailable context honestly and disables plus while busy', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ budget: null })));
  const toggle = vi.fn();
  render(<ComposerFooter agentId="fixture" busy running revision={0} onMenuToggle={toggle} />);
  expect(screen.getByRole('button', { name: /Оценка контекста недоступна/ })).toHaveTextContent('—');
  expect(screen.getByRole('button', { name: 'Добавить' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));
  expect(toggle).not.toHaveBeenCalled();
});
it('sends a file-only turn and preserves the same request key on retry', async () => {
  let count = 0; const bodies: RequestInit[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url.includes('/ui-lab-api/models')) return json({ models: [] });
    if (url.startsWith('/voice/api')) return json({ error: 'Only owners can manage voice dictation' }, 403);
    if (url.endsWith('/context')) return json({ budget: null });
    bodies.push(init); if (count++ === 0) throw new Error('Offline'); return json({ ok: true });
  }));
  const accepted = vi.fn(); render(<LiveComposer agentId="files" running={false} onAccepted={accepted} />);
  await userEvent.upload(screen.getByLabelText('Добавить файлы'), new File(['hello'], 'hello.txt', { type: 'text/plain' }));
  await userEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
  await waitFor(() => expect(accepted).toHaveBeenCalledOnce());
  expect((bodies[0].body as FormData).get('files')).toBeInstanceOf(File);
  expect(new Headers(bodies[0].headers).get('Idempotency-Key')).toBe(new Headers(bodies[1].headers).get('Idempotency-Key'));
});
it('editable chats show the voice route selector right after the context meter; read-only chats do not', async () => {
  const getUserMedia = vi.fn(); Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  const socket = vi.fn(); vi.stubGlobal('WebSocket', socket);
  const fetcher = vi.fn(async (url: string) => {
    if (url.startsWith('/voice/api')) return json({ providers: [], connections: [], routes: [], defaultRoute: { route: '', fixed: false }, chat: { agentId: 'voice', route: '', source: 'none', status: 'unconfigured' }, csrfToken: 't' });
    if (url.includes('/ui-lab-api/models')) return json({ models: [] });
    return json({ budget: null });
  });
  vi.stubGlobal('fetch', fetcher);
  const ui = render(<LiveComposer agentId="voice" running={false} onAccepted={vi.fn()} />);
  const voice = await screen.findByRole('button', { name: /Маршрут голосового ввода\. Голосовой ввод не настроен/ });
  const meter = screen.getByRole('button', { name: /Оценка контекста недоступна/ });
  expect(meter.compareDocumentPosition(voice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  // The voice group (inline input, voice mode, route selector) is the meter's immediate next sibling.
  expect(meter.nextElementSibling).toBe(screen.getByRole('group', { name: 'Голос' }));
  expect(screen.getByRole('group', { name: 'Голос' }).lastElementChild).toBe(voice);
  ui.unmount(); fetcher.mockClear();
  render(<LiveComposer agentId="voice" running={false} readOnly onAccepted={vi.fn()} />);
  await screen.findByRole('button', { name: /Оценка контекста недоступна/ });
  expect(screen.queryByRole('button', { name: /Маршрут голосового ввода/ })).toBeNull();
  expect(screen.queryByRole('group', { name: 'Голос' })).toBeNull();
  expect(fetcher.mock.calls.some(([url]) => String(url).startsWith('/voice/api'))).toBe(false);
  expect(getUserMedia).not.toHaveBeenCalled(); expect(socket).not.toHaveBeenCalled();
});
