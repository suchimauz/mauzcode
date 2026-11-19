import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VoicePanel as VoiceSettings } from '../components/settings/VoicePanel';
import { LiveComposer } from '../components/mauzcode/LiveComposer';
import { flush, getUserMedia, install, nodes, ready, resetMedia, restoreMedia, sockets, streams } from './fixtures/voiceMedia';

// Real composer, capture, worklet and ordinary send/queue clients. Only browser media, sockets,
// live subscriptions and fetch are local doubles. No external service, account, or chat is used.
vi.mock('../sdk/live', () => ({ subscribeLive: () => () => {} }));
const json = (body: object) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const post = vi.fn<(path: string, init: RequestInit) => Promise<Response>>();
const modeName = { panel: 'Голосовой режим', inline: 'Голосовой ввод в поле сообщения' };
const region = () => screen.getByRole('region', { name: modeName.panel });
const editor = () => screen.getByRole('textbox', { name: 'Сообщение агенту', hidden: true });
const key = (target: Element, key: string) => fireEvent.keyDown(target, { key });
const phrase = (text: string, final: boolean) => ({ type: 'phrase', id: 'p', order: 0, revision: final ? 2 : 1, final, text });
const route = { route: 'fixture/local:test', destination: { kind: 'host', label: 'Test fixture' }, modelId: 'test', label: 'Test' };

beforeEach(() => {
  resetMedia(); install(); post.mockReset().mockImplementation(async () => json({ ok: true }));
  vi.stubGlobal('fetch', vi.fn(async (path: string, init: RequestInit = {}) => {
    if (init.method === 'POST') return post(path, init);
    if (path.startsWith('/voice/api')) return json({ csrfToken: '', routes: [route], providers: [], connections: [], defaultRoute: { route: route.route }, chat: { ...route, status: 'ready', source: 'default', model: { id: 'test', label: 'Test' } } });
    return json({ version: 1, enabled: false, items: [], todos: null, triggers: [], models: [], budget: null });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); restoreMedia(); sessionStorage.clear(); });

async function mount(mode: 'inline' | 'panel', { files = true, running = false, text = '' } = {}) {
  if (text) sessionStorage.setItem('mauzcode-ui-draft:a', JSON.stringify({ text, key: 'seed' }));
  const accepted = vi.fn();
  const view = render(<LiveComposer agentId="a" running={running} onAccepted={accepted} />);
  const entry = await screen.findByRole('button', { name: modeName[mode] });
  await waitFor(() => expect(entry).not.toHaveAttribute('aria-disabled'));
  const file = new File(['fixture'], 'notes.txt', { type: 'text/plain' });
  if (files) await userEvent.upload(screen.getByLabelText('Добавить файлы'), file);
  await userEvent.click(entry);
  const ws = sockets[0];
  act(() => { ws.open(); ws.receive(ready); nodes[0].feed(130); });
  return { target: mode === 'panel' ? region() : editor(), entry, ws, accepted, view, file };
}

it.each([
  ['inline', true], ['inline', false], ['panel', true], ['panel', false],
] as const)('%s renders the provider failure with a reference only if saved (%s)', async (mode, saved) => {
  const { ws } = await mount(mode, { files: false });
  act(() => ws.receive({ type: 'error', code: 'provider', message: 'Provider unavailable.', ...(saved && { errorId: 'deadbeef1234abcd' }) }));
  const surface = mode === 'inline' ? screen.getByRole('alert') : region().querySelector('.voice-panel-error');
  expect(surface).toBeVisible();
  expect(surface).toHaveTextContent('Provider unavailable.');
  if (saved) expect(surface).toHaveTextContent('ID: deadbeef1234abcd');
  else expect(surface).not.toHaveTextContent('ID:');
});

it('follows a fake session reference through Settings → Voice → Errors and a missing lookup', async () => {
  const { ws, view } = await mount('inline', { files: false });
  const record = { id: 'deadbeef1234abcd', createdAt: '2026-04-25T12:00:00.000Z', provider: 'fixture', model: 'test', stage: 'streaming', cause: 'unknown' };
  act(() => ws.receive({ type: 'error', code: 'provider', message: 'Provider unavailable.', errorId: record.id }));
  const visibleId = within(screen.getByRole('alert')).getByText(record.id).textContent!;
  view.unmount();
  const fetch = vi.fn(async (path: string) => {
    if (path === '/voice/api') return json({ csrfToken: '', routes: [], providers: [], connections: [], defaultRoute: { route: '', fixed: false } });
    if (path === '/api/voice/errors') return json({ errors: [record] });
    if (path === `/api/voice/errors/${record.id}`) return json({ error: record });
    return Response.json({ error: 'Not found' }, { status: 404 });
  });
  vi.stubGlobal('fetch', fetch);
  render(<VoiceSettings />);
  await userEvent.click(await screen.findByRole('button', { name: 'Errors' }));
  await screen.findByText('Recent errors');
  const input = screen.getByRole('textbox', { name: 'Error ID' });
  await userEvent.type(input, visibleId);
  await userEvent.click(screen.getByRole('button', { name: 'Look up' }));
  await screen.findByText('Matching error');
  const row = screen.getByRole('listitem');
  expect(row).toHaveTextContent(visibleId);
  expect(row.querySelector('time')).toHaveAttribute('datetime', record.createdAt);
  expect(row).toHaveTextContent('Provider: fixture · Model: test');
  expect(row).toHaveTextContent('Stage: streaming · Cause: unknown');
  await userEvent.clear(input); await userEvent.type(input, 'beefdead4321dcba');
  await userEvent.click(screen.getByRole('button', { name: 'Look up' }));
  expect(await screen.findByText('No matching error')).toBeVisible();
  expect(screen.queryByText(visibleId)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Show recent' }));
  expect(await screen.findByText(visibleId)).toBeVisible();
  expect(fetch.mock.calls.map(([path]) => path)).toEqual(['/voice/api', '/api/voice/errors', `/api/voice/errors/${visibleId}`, '/api/voice/errors/beefdead4321dcba', '/api/voice/errors']);
});

function submission(index: number) {
  const [path, init] = post.mock.calls[index];
  const body = init.body as FormData;
  const id = new Headers(init.headers).get('Idempotency-Key');
  expect(id).toBeTruthy(); expect(id).toBe(body.get('requestId'));
  return { path, text: body.get('text'), files: body.getAll('files'), id };
}

it.each(['panel', 'inline'] as const)('%s: double Enter waits for the last words and freezes all actions through acknowledgement', async mode => {
  const { target, ws, entry, accepted, file, view } = await mount(mode, { text: 'Typed' });
  const late = ws.onmessage!;
  let ack!: () => void;
  post.mockImplementationOnce(() => new Promise(resolve => { ack = () => resolve(json({ ok: true })); }));
  act(() => ws.receive(phrase('first', false)));
  key(target, 'Enter'); key(target, 'Enter');
  if (mode === 'panel') {
    key(region(), 'Escape'); key(region(), ' ');
    expect(within(region()).getByRole('button', { name: /Очистить/ })).toBeDisabled();
  }
  await userEvent.click(entry);
  await act(flush);
  expect(ws.controls().map(e => e.type)).toEqual(['start', 'finish']);
  expect(streams[0].tracks[0].stopped).toBe(true);
  expect(editor()).toHaveAttribute('aria-disabled', 'true');
  expect(post).not.toHaveBeenCalled();
  // The running flag may change WHILE the recognizer owes us the final result.
  view.rerender(<LiveComposer agentId="a" running={mode === 'inline'} onAccepted={accepted} />);
  await act(async () => { ws.receive(phrase('final words', true)); ws.receive({ type: 'completed' }); await flush(); });
  expect(post).toHaveBeenCalledTimes(1);
  expect(submission(0)).toMatchObject({ path: mode === 'inline' ? '/agent/a/queue' : '/agent/a', text: 'Typed final words', files: [file] });
  key(target, 'Enter'); fireEvent.click(screen.getByRole('button', { name: mode === 'panel' ? /^Отправить/ : 'В очередь' }));
  expect(post).toHaveBeenCalledTimes(1); expect(accepted).not.toHaveBeenCalled();
  await act(async () => { ack(); await flush(); });
  await waitFor(() => expect(accepted).toHaveBeenCalledOnce());
  act(() => late({ data: JSON.stringify(phrase('stale', true)) }));
  expect(editor().textContent).toBe('');
  expect(screen.queryByText('notes.txt')).toBeNull();
  expect(getUserMedia).toHaveBeenCalledTimes(1);
  if (mode === 'panel') expect(region()).toHaveAttribute('data-state', 'paused');
});

it('inline: a click before the first transcript still finishes speech, even in a running chat', async () => {
  const { ws } = await mount('inline', { files: false, running: true });
  await userEvent.click(screen.getByRole('button', { name: 'В очередь' }));
  expect(post).not.toHaveBeenCalled();
  await act(async () => { ws.receive(phrase('only phrase', true)); ws.receive({ type: 'completed' }); });
  expect(submission(0)).toMatchObject({ path: '/agent/a/queue', text: 'only phrase', files: [] });
});

it.each(['inline', 'panel'] as const)('%s: unconfirmed last phrase leaves the visible draft and files; only a deliberate next action sends', async mode => {
  const { target, ws, file, accepted } = await mount(mode);
  act(() => ws.receive(phrase('review me', false)));
  key(target, 'Enter'); await act(flush);
  await act(async () => {
    if (mode === 'panel') { ws.receive({ type: 'phraseFailed', id: 'p', order: 0, reason: 'provider' }); ws.receive({ type: 'completed' }); }
    else ws.drop();
  });
  expect(post).not.toHaveBeenCalled(); expect(accepted).not.toHaveBeenCalled();
  expect(editor()).toHaveTextContent('review me'); expect(screen.getByText('notes.txt')).toBeVisible();
  expect(streams[0].tracks[0].stopped).toBe(true);
  expect(await screen.findByText(/Ничего не отправлено/)).toBeVisible();
  fireEvent.keyDown(target, { key: 'Enter', repeat: true });
  await act(flush); expect(post).not.toHaveBeenCalled();
  if (mode === 'inline') { const el = editor(); el.textContent = 'corrected'; fireEvent.input(el); }
  key(target, 'Enter'); await waitFor(() => expect(accepted).toHaveBeenCalledOnce());
  expect(submission(0)).toMatchObject({ text: mode === 'inline' ? 'corrected' : 'review me', files: [file] });
  if (mode === 'panel') expect(region()).toHaveAttribute('data-state', 'paused');
  expect(getUserMedia).toHaveBeenCalledOnce();
});

it.each([true, false])('uncertain request (initially running: %s) keeps the endpoint, key, final text and files on retry', async running => {
  const { ws, accepted, view, file } = await mount('panel', { running });
  post.mockRejectedValueOnce(new Error('Lost acknowledgement'));
  await userEvent.click(within(region()).getByRole('button', { name: /Отправить/ }));
  await act(async () => { ws.receive(phrase('final', true)); ws.receive({ type: 'completed' }); });
  expect(await screen.findByText(/Lost acknowledgement/)).toBeVisible(); expect(accepted).not.toHaveBeenCalled();
  const original = submission(0);
  expect(original).toMatchObject({ path: running ? '/agent/a/queue' : '/agent/a', text: 'final', files: [file] });
  view.rerender(<LiveComposer agentId="a" running={!running} onAccepted={accepted} />);
  key(region(), 'Enter'); await waitFor(() => expect(accepted).toHaveBeenCalledOnce());
  expect(post).toHaveBeenCalledTimes(2); expect(submission(1)).toEqual(original);
  expect(ws.controls().filter(c => c.type === 'finish')).toHaveLength(1);
  expect(region()).toHaveAttribute('data-state', 'paused'); expect(getUserMedia).toHaveBeenCalledOnce();
});

it.each(['navigate', 'readOnly'] as const)('%s during finish discards stale continuation and does not send to either chat', async transition => {
  const { ws, accepted, view } = await mount('inline', { text: 'draft' });
  const late = ws.onmessage!;
  key(editor(), 'Enter'); await act(flush);
  view.rerender(<LiveComposer agentId={transition === 'navigate' ? 'b' : 'a'} readOnly={transition === 'readOnly'} running={false} onAccepted={accepted} />);
  await act(async () => { late({ data: JSON.stringify(phrase('wrong chat', true)) }); late({ data: JSON.stringify({ type: 'completed' }) }); });
  expect(post).not.toHaveBeenCalled(); expect(accepted).not.toHaveBeenCalled();
  expect(editor()).not.toHaveTextContent('wrong chat'); expect(streams[0].tracks[0].stopped).toBe(true);
});

it.each(['inline', 'panel'] as const)('%s: send joins a stop or pause that is already finalizing', async mode => {
  const { entry, target, ws, accepted } = await mount(mode, { files: false });
  if (mode === 'panel') key(region(), ' '); else await userEvent.click(entry);
  await act(flush);
  expect(post).not.toHaveBeenCalled();
  key(target, 'Enter'); key(target, 'Enter');
  await act(async () => { ws.receive(phrase('last words', true)); ws.receive({ type: 'completed' }); });
  await waitFor(() => expect(accepted).toHaveBeenCalledOnce());
  expect(ws.controls().map(c => c.type)).toEqual(['start', 'finish']);
  expect(submission(0)).toMatchObject({ path: '/agent/a', text: 'last words' });
});

it('finalizing silence with no draft or attachments does not create a request', async () => {
  const { ws, accepted } = await mount('panel', { files: false });
  key(region(), 'Enter'); await act(flush);
  await act(async () => ws.receive({ type: 'completed' }));
  expect(region()).toHaveAttribute('data-state', 'paused'); expect(post).not.toHaveBeenCalled(); expect(accepted).not.toHaveBeenCalled();
});
