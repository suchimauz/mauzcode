import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VoicePanel as VoiceSettings } from '../components/settings/VoicePanel';
import { ComposerCoordinator, LiveComposer } from '../components/mauzcode/LiveComposer';
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

async function mount(mode: 'inline' | 'panel', { files = true, running = false, text = '', persistent = false } = {}) {
  if (text) sessionStorage.setItem('mauzcode-ui-draft:a', JSON.stringify({ text, key: 'seed' }));
  const accepted = vi.fn();
  const view = render(<LiveComposer agentId="a" running={running} onAccepted={accepted} />);
  const entry = await screen.findByRole('button', { name: modeName[mode] });
  await waitFor(() => expect(entry).not.toHaveAttribute('aria-disabled'));
  const file = new File(['fixture'], 'notes.txt', { type: 'text/plain' });
  if (files) await userEvent.upload(screen.getByLabelText('Добавить файлы'), file);
  await userEvent.click(entry);
  const ws = sockets[0];
  act(() => { ws.open(); ws.receive(persistent ? { ...ready, mode: 'panel', settle: true } : ready); nodes[0].feed(130); });
  return { target: mode === 'panel' ? region() : editor(), entry, ws, accepted, view, file };
}

it.each([
  ['inline', true], ['inline', false], ['panel', true], ['panel', false],
] as const)('%s renders the provider failure with a reference only if saved (%s)', async (mode, saved) => {
  const { ws } = await mount(mode, { files: false });
  act(() => ws.receive({ type: 'error', code: 'provider', message: 'Provider unavailable.', ...(saved && { errorId: 'deadbeef1234abcd' }) }));
  const surface = screen.getByRole('alert');
  expect(surface).toBeVisible();
  expect(surface).toHaveTextContent('Provider unavailable.');
  if (saved) expect(surface).toHaveTextContent('ID: deadbeef1234abcd');
  else expect(surface).not.toHaveTextContent('ID:');
});

it('follows a fake session reference through Settings → Voice → Errors and a missing lookup', async () => {
  const { ws, view } = await mount('inline', { files: false });
  const record = { id: 'deadbeef1234abcd', createdAt: '2026-04-25T12:00:00.000Z', provider: 'fixture', model: 'test', stage: 'streaming', cause: 'unknown', reason: 'socketClosed', detail: '1006' };
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
  expect(row).toHaveTextContent('Reason: socketClosed · Detail: 1006');
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

it.each([['panel', false], ['panel', true], ['inline', false]] as const)('%s (muted: %s): double Enter waits for the last words and locks controls through acknowledgement', async (mode, muted) => {
  const { target, ws, entry, accepted, file, view } = await mount(mode, { text: 'Typed' });
  const late = ws.onmessage!;
  let ack!: () => void;
  post.mockImplementationOnce(() => new Promise(resolve => { ack = () => resolve(json({ ok: true })); }));
  act(() => ws.receive(phrase('first', false)));
  if (muted) {
    key(region(), ' ');
    expect(region()).toHaveAttribute('data-state', 'muted');
    expect(streams[0].tracks[0]).toMatchObject({ enabled: false, stopped: false });
    expect(ws.controls().map(e => e.type)).toEqual(['start']);
  }
  key(target, 'Enter'); key(target, 'Enter');
  if (mode === 'panel') {
    key(region(), 'Escape'); key(region(), ' ');
    expect(within(region()).getByRole('button', { name: 'Удалить последнее слово' })).toBeDisabled();
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
  if (mode === 'panel') expect(within(region()).getByRole('status')).not.toHaveTextContent('Сообщение отправлено');
  await act(async () => { ack(); await flush(); });
  await waitFor(() => expect(accepted).toHaveBeenCalledOnce());
  act(() => late({ data: JSON.stringify(phrase('stale', true)) }));
  expect(editor().textContent).toBe('');
  expect(screen.queryByText('notes.txt')).toBeNull();
  expect(getUserMedia).toHaveBeenCalledTimes(1);
  if (mode === 'panel') {
    expect(region()).toHaveAttribute('data-state', 'idle');
    expect(within(region()).getByRole('button', { name: 'Начать запись' })).toBeEnabled();
    await waitFor(() => expect(within(region()).getByRole('status')).toHaveTextContent('Сообщение отправлено'));
    expect(ws.readyState).toBe(3); expect(sockets).toHaveLength(1);
  }
});

it('inline: a click before the first transcript still finishes speech, even in a running chat', async () => {
  const { ws } = await mount('inline', { files: false, running: true });
  await userEvent.click(screen.getByRole('button', { name: 'В очередь' }));
  expect(post).not.toHaveBeenCalled();
  await act(async () => { ws.receive(phrase('only phrase', true)); ws.receive({ type: 'completed' }); });
  expect(submission(0)).toMatchObject({ path: '/agent/a/queue', text: 'only phrase', files: [] });
});

it.each([['inline', false], ['panel', false], ['panel', true]] as const)('%s (muted: %s): a failed finish retains the draft and files; only a deliberate next action sends', async (mode, muted) => {
  const { target, ws, file, accepted } = await mount(mode);
  act(() => ws.receive(phrase('review me', false)));
  if (muted) { key(target, ' '); expect(region()).toHaveAttribute('data-state', 'muted'); }
  key(target, 'Enter'); await act(flush);
  await act(async () => {
    if (mode === 'panel' && !muted) { ws.receive({ type: 'phraseFailed', id: 'p', order: 0, reason: 'provider' }); ws.receive({ type: 'completed' }); }
    else ws.drop();
  });
  expect(post).not.toHaveBeenCalled(); expect(accepted).not.toHaveBeenCalled();
  expect(editor()).toHaveTextContent('review me'); expect(screen.getByText('notes.txt')).toBeVisible();
  expect(streams[0].tracks[0].stopped).toBe(true);
  expect(await screen.findByText(/Ничего не отправлено/)).toBeVisible();
  fireEvent.keyDown(target, { key: 'Enter', repeat: true });
  await act(flush); expect(post).not.toHaveBeenCalled();
  if (mode === 'inline') { const el = editor(); el.textContent = 'corrected'; fireEvent.input(el); }
  key(screen.queryByRole('region', { name: modeName.panel }) ?? editor(), 'Enter'); await waitFor(() => expect(accepted).toHaveBeenCalledOnce());
  expect(submission(0)).toMatchObject({ text: mode === 'inline' ? 'corrected' : 'review me', files: [file] });
  expect(ws.readyState).toBe(3); expect(sockets).toHaveLength(1);
  expect(getUserMedia).toHaveBeenCalledOnce();
});

it.each([[true, true], [true, false], [false, true], [false, false]])('uncertain request (running %s, negotiated %s) preserves endpoint, key, final text and files', async (running, persistent) => {
  const { ws, accepted, view, file } = await mount('panel', { running, persistent });
  post.mockRejectedValueOnce(new Error('Lost acknowledgement'));
  await userEvent.click(within(region()).getByRole('button', { name: /Отправить/ }));
  await act(async () => { ws.receive(phrase('final', true)); ws.receive(persistent ? { type: 'settled', id: 1, ok: true, throughOrder: 0 } : { type: 'completed' }); });
  expect(await screen.findByText(/Lost acknowledgement/)).toBeVisible(); expect(accepted).not.toHaveBeenCalled();
  const original = submission(0);
  expect(original).toMatchObject({ path: running ? '/agent/a/queue' : '/agent/a', text: 'final', files: [file] });
  view.rerender(<LiveComposer agentId="a" running={!running} onAccepted={accepted} />);
  key(region(), 'Enter'); if (persistent) await act(async () => ws.receive({ type: 'settled', id: 2, ok: true, throughOrder: 0 })); await waitFor(() => expect(accepted).toHaveBeenCalledOnce());
  expect(post).toHaveBeenCalledTimes(2); expect(submission(1)).toEqual(original);
  expect(ws.controls().filter(c => c.type === 'finish')).toHaveLength(persistent ? 0 : 1);
  expect(region()).toHaveAttribute('data-state', persistent ? 'muted' : 'idle'); expect(getUserMedia).toHaveBeenCalledOnce();
});

it.each([['inline', 'navigate'], ['inline', 'readOnly'], ['panel', 'navigate'], ['panel', 'readOnly']] as const)('%s: %s discards stale events and sends to neither chat', async (mode, transition) => {
  const { target, ws, accepted, view } = await mount(mode, { text: 'draft' });
  const late = ws.onmessage!;
  // Leave the dedicated panel muted; the inline run already has a pending send.
  key(target, mode === 'panel' ? ' ' : 'Enter'); await act(flush);
  if (mode === 'panel') expect(region()).toHaveAttribute('data-state', 'muted');
  view.rerender(<LiveComposer agentId={transition === 'navigate' ? 'b' : 'a'} readOnly={transition === 'readOnly'} running={false} onAccepted={accepted} />);
  await act(async () => { late({ data: JSON.stringify(phrase('wrong chat', true)) }); late({ data: JSON.stringify({ type: 'completed' }) }); });
  expect(post).not.toHaveBeenCalled(); expect(accepted).not.toHaveBeenCalled();
  expect(editor()).not.toHaveTextContent('wrong chat'); expect(streams[0].tracks[0].stopped).toBe(true);
  expect(ws.readyState).toBe(3); expect(sockets).toHaveLength(1);
});

it.each(['inline', 'panel'] as const)('%s: send joins an inline stop or explicitly finishes a connected mute', async mode => {
  const { entry, target, ws, accepted } = await mount(mode, { files: false });
  if (mode === 'panel') key(region(), ' '); else await userEvent.click(entry);
  await act(flush);
  expect(post).not.toHaveBeenCalled();
  expect(ws.controls().map(c => c.type)).toEqual(mode === 'panel' ? ['start'] : ['start', 'finish']);
  key(target, 'Enter'); key(target, 'Enter'); await act(flush);
  await act(async () => { ws.receive(phrase('last words', true)); ws.receive({ type: 'completed' }); });
  await waitFor(() => expect(accepted).toHaveBeenCalledOnce());
  expect(ws.controls().map(c => c.type)).toEqual(['start', 'finish']);
  expect(submission(0)).toMatchObject({ path: '/agent/a', text: 'last words' });
});

it('finalizing silence with no draft or attachments does not create a request', async () => {
  const { ws, accepted } = await mount('panel', { files: false });
  key(region(), 'Enter'); await act(flush);
  await act(async () => ws.receive({ type: 'completed' }));
  expect(region()).toHaveAttribute('data-state', 'idle'); expect(post).not.toHaveBeenCalled(); expect(accepted).not.toHaveBeenCalled();
});


it.each([false, true])('negotiated Send settles once and opens a clean ledger on the same muted connection (initial mute %s)', async muted => {
  const { ws, accepted, file } = await mount('panel', { persistent: true, text: 'draft' });
  if (muted) key(region(), ' ');
  key(region(), 'Enter'); key(region(), 'Enter'); await act(flush);
  expect(ws.controls().map(m => m.type)).toEqual(['start', 'settle']);
  await act(async () => { ws.receive(phrase('final', true)); ws.receive({ type: 'settled', id: 1, throughOrder: 0, ok: true }); await flush(); });
  await waitFor(() => expect(accepted).toHaveBeenCalledOnce());
  expect(submission(0)).toMatchObject({ text: 'draft final', files: [file] });
  expect(region()).toHaveAttribute('data-state', 'muted');
  key(region(), ' '); act(() => { ws.receive(phrase('stale', true)); ws.receive({ ...phrase('next', true), order: 1, id: 'next' }); });
  expect(editor()).toHaveTextContent(/^next$/); expect(sockets).toHaveLength(1);
});

it('worklet deadline preserves the muted draft and files, unlocks Send, ignores the stale cut on retry', async () => {
  const { ws } = await mount('panel', { persistent: true, text: 'draft' });
  vi.useFakeTimers();
  try {
    const deliver = nodes[0].port.onmessage!; nodes[0].port.onmessage = null;
    key(region(), 'Enter'); await act(async () => { vi.advanceTimersByTime(15_000); await flush(); });
    expect(region()).toHaveAttribute('data-state', 'muted'); expect(editor()).toHaveTextContent('draft'); expect(screen.getByText('notes.txt')).toBeVisible();
    expect(within(region()).getByRole('button', { name: 'Отправить' })).toBeEnabled();
    key(region(), 'Enter'); act(() => deliver({ data: { type: 'gated', epoch: 1 } } as MessageEvent));
    expect(ws.controls().map(m => m.type)).toEqual(['start']); expect(post).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(15_000); await flush(); });
  } finally { vi.useRealTimers(); }
});


function workspace() {
  const accepted = vi.fn();
  const tree = (id: string | null, denied?: string) => <ComposerCoordinator denied={agent => agent === denied}><section className="chat-panel">{id && <LiveComposer key={id} agentId={id} onAccepted={accepted} running={false} />}</section></ComposerCoordinator>;
  const view = render(tree('a')); const select = (id: string | null, denied?: string) => view.rerender(tree(id, denied));
  const start = async (mode: keyof typeof modeName, readyNow = true) => {
    const entry = await screen.findByRole('button', { name: modeName[mode] });
    await waitFor(() => expect(entry).not.toHaveAttribute('aria-disabled')); await userEvent.click(entry);
    const ws = sockets.at(-1)!;
    if (readyNow) act(() => { ws.open(); ws.receive(mode === 'panel' ? { ...ready, mode, settle: true } : ready); });
    return ws;
  };
  return { select, start, accepted };
}

it('keyed outlet: A parks across loading; inline B stops, a rejected B never evicts A, accepted B supersedes only A', async () => {
  const { select, start } = workspace(); const a = await start('panel');
  act(() => window.dispatchEvent(new PopStateEvent('popstate'))); expect(region()).toHaveAttribute('data-state', 'muted');
  select(null); select('b'); act(() => a.receive(phrase('only A', true))); expect(editor()).not.toHaveTextContent('only A');
  const file = new File(['B'], 'only-b.txt'); fireEvent.drop(document.querySelector('.chat-panel')!, { dataTransfer: { types: ['Files'], files: [file] } });
  const inline = await start('inline'); select('a'); expect(inline.readyState).toBe(3);
  expect(region()).toHaveAttribute('data-state', 'muted'); expect(editor()).toHaveTextContent('only A'); expect(screen.queryByText('only-b.txt')).toBeNull();
  select('b'); expect(screen.getByText('only-b.txt')).toBeVisible(); const rejected = await start('panel', false);
  act(() => { rejected.open(); rejected.receive({ type: 'error', code: 'unauthorized', message: 'Refused' }); });
  expect(screen.getByRole('alert')).toHaveTextContent('Refused'); select('a'); expect(region()).toHaveAttribute('data-state', 'muted'); expect(a.readyState).toBe(1);
  select('b'); const b = await start('panel'); expect(a.readyState).toBe(3); expect(b.readyState).toBe(1); select('a');
  expect(screen.getByRole('alert')).toHaveTextContent('другой чат'); expect(editor()).toHaveTextContent('only A');
  select('b'); expect(screen.queryByRole('alert')).toBeNull(); expect(region()).toHaveAttribute('data-state', 'muted');
});

it.each(['denied', 'disconnect'])('parked %s returns only the owner to the editor; no automatic restart', async cause => {
  const { select, start } = workspace(); const ws = await start('panel'); act(() => ws.receive(phrase('keep', true))); select('b', cause === 'denied' ? 'a' : undefined);
  if (cause === 'disconnect') act(() => ws.receive({ type: 'error', code: 'provider', message: 'Transport failed', errorId: 'deadbeef1234abcd' }));
  expect(screen.queryByRole('alert')).toBeNull(); select('a', cause === 'denied' ? 'a' : undefined);
  expect(screen.getByRole('alert')).toHaveTextContent(cause === 'denied' ? 'нет доступа' : 'deadbeef1234abcd'); expect(editor()).toHaveTextContent('keep');
  expect(screen.queryByRole('region', { name: modeName.panel })).toBeNull(); expect(sockets).toHaveLength(1); expect(streams[0].tracks[0].stopped).toBe(true);
});

it('an acknowledged parked send clears only A and leaves its healthy connection muted', async () => {
  const { select, start, accepted } = workspace(); let ack!: () => void;
  post.mockImplementationOnce(() => new Promise(resolve => { ack = () => resolve(json({ ok: true })); }));
  const ws = await start('panel'); key(region(), 'Enter'); select('b');
  await act(async () => { ws.receive(phrase('from A', true)); ws.receive({ type: 'settled', id: 1, ok: true, throughOrder: 0 }); await flush(); });
  await waitFor(() => expect(post).toHaveBeenCalledOnce()); expect(submission(0)).toMatchObject({ path: '/agent/a', text: 'from A' });
  const el = editor(); el.textContent = 'B draft'; fireEvent.input(el); await act(async () => { ack(); await flush(); });
  expect(accepted).toHaveBeenCalledOnce(); expect(editor()).toHaveTextContent('B draft'); select('a'); expect(region()).toHaveAttribute('data-state', 'muted'); expect(editor().textContent).toBe('');
});


it.each([false, true])('elapsed time survives navigation beyond five minutes without warnings (touch: %s)', async coarse => {
  const matchMedia = window.matchMedia;
  window.matchMedia = ((query: string) => ({ ...matchMedia(query), matches: coarse && query === '(pointer: coarse)' })) as typeof window.matchMedia;
  try {
    const { start, select } = workspace(); const ws = await start('panel', false);
    vi.useFakeTimers(); act(() => { ws.open(); ws.receive({ ...ready, mode: 'panel', settle: true }); vi.advanceTimersByTime(290_000); });
    select('b'); act(() => vi.advanceTimersByTime(21_000)); select('a');
    expect(region()).toHaveAttribute('data-state', 'muted'); expect(within(region()).getByText('5:11')).toBeVisible();
    expect(within(region()).getByRole('status')).not.toHaveTextContent(/осталось/i);
    const toggle = within(region()).getByRole('button', { name: 'Включить микрофон' });
    if (coarse) fireEvent.click(toggle); else key(region(), ' ');
    expect(region()).toHaveAttribute('data-state', 'listening'); expect(sockets).toHaveLength(1);
  } finally { vi.useRealTimers(); window.matchMedia = matchMedia; }
});


it('pagehide tears down the parked owner, not just the current chat', async () => {
  const { select, start } = workspace(); const a = await start('panel'); act(() => a.receive(phrase('saved', true))); select('b');
  act(() => window.dispatchEvent(new Event('pagehide'))); select('a');
  expect(a.readyState).toBe(3); expect(streams[0].tracks[0].stopped).toBe(true); expect(screen.queryByRole('region', { name: modeName.panel })).toBeNull();
  expect(editor()).toHaveTextContent('saved'); expect(getUserMedia).toHaveBeenCalledOnce();
});
