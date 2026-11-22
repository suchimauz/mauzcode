import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ComposerCoordinator, LiveComposer, useComposerNavigation } from '../components/mauzcode/LiveComposer';
import { useChatSelection } from '../hooks/useChatSelection';
import { FRAME_HEADER_BYTES } from '../lib/voiceCapture';
import { FakeStream, flush, getUserMedia, install, nodes, ready, resetMedia, restoreMedia, sockets, streams } from './fixtures/voiceMedia';

vi.mock('../sdk/live', () => ({ subscribeLive: () => () => {} }));
const accepted = vi.fn();
const post = vi.fn();
const before = location.href;
const panelReady = { ...ready, mode: 'panel', settle: true };
const region = () => screen.queryByRole('region', { name: 'Голосовой режим' });

function Chats() {
  const { selected, select } = useChatSelection();
  const leave = useComposerNavigation();
  return <><button onClick={() => { leave(); select('B'); }}>Chat B</button>
    <output data-testid="selected">{selected}</output><LiveComposer key={selected} agentId={selected} running={false} onAccepted={accepted} /></>;
}
async function openPanel() {
  const entry = await screen.findByRole('button', { name: 'Голосовой режим' });
  await waitFor(() => expect(entry).not.toHaveAttribute('aria-disabled'));
  fireEvent.click(entry);
}
async function startPendingA() {
  let grant!: (stream: FakeStream) => void;
  getUserMedia.mockImplementationOnce(() => new Promise<FakeStream>(resolve => { grant = resolve; }));
  render(<ComposerCoordinator><Chats /></ComposerCoordinator>);
  await openPanel();
  expect(getUserMedia).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('Chat B'));
  expect(screen.getByTestId('selected')).toHaveTextContent('B');
  expect(region()).toBeNull();
  return grant;
}
async function backToA() {
  await act(async () => { history.back(); });
  await waitFor(() => expect(screen.getByTestId('selected')).toHaveTextContent('A'));
}

beforeEach(() => {
  history.replaceState(null, '', '/?agent=A');
  resetMedia(); install(); accepted.mockClear(); post.mockClear();
  const route = { route: 'fixture/local:test', destination: { kind: 'host', label: 'Test' }, modelId: 'test', label: 'Test' };
  vi.stubGlobal('fetch', vi.fn(async (path: string, init: RequestInit = {}) => {
    if (init.method === 'POST') post(path);
    return Response.json(path.startsWith('/voice/api') ? { csrfToken: '', routes: [route], providers: [], connections: [], defaultRoute: { route: route.route }, chat: { ...route, status: 'ready', source: 'default', model: { id: 'test', label: 'Test' } } } : { version: 1, enabled: false, items: [], todos: null, triggers: [], models: [], budget: null });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); restoreMedia(); sessionStorage.clear(); history.replaceState(null, '', before); });

it('latches navigation mute through late permission, Back before ready, and delayed ready on the original stream', async () => {
  const grant = await startPendingA();
  const stream = new FakeStream();
  await act(async () => { grant(stream); await flush(); });
  expect(stream.tracks[0].enabled).toBe(false);
  expect(sockets).toHaveLength(1);
  await backToA();
  const ws = sockets[0];
  act(() => { ws.open(); ws.receive(panelReady); nodes[0].feed(200); });
  expect(region()).toHaveAttribute('data-state', 'muted');
  expect(ws.frames().length).toBeGreaterThan(0);
  expect(ws.frames().every(frame => new Uint8Array(frame.buffer, FRAME_HEADER_BYTES).every(byte => byte === 0))).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Включить микрофон' }));
  act(() => nodes[0].feed(200));
  expect(stream.tracks[0].enabled).toBe(true);
  expect(ws.frames().some(frame => new Uint8Array(frame.buffer, FRAME_HEADER_BYTES).some(byte => byte !== 0))).toBe(true);
  expect(sockets).toHaveLength(1); expect(getUserMedia).toHaveBeenCalledTimes(1);
  expect(post).not.toHaveBeenCalled();
});

it('discards an older late permission after B was accepted without opening a socket or touching B', async () => {
  const grant = await startPendingA();
  await openPanel();
  await waitFor(() => expect(sockets).toHaveLength(1));
  const ws = sockets[0];
  act(() => { ws.open(); ws.receive(panelReady); });
  expect(region()).toHaveAttribute('data-state', 'listening');
  const stale = new FakeStream();
  await act(async () => { grant(stale); await flush(); });
  expect(stale.tracks[0].stopped).toBe(true);
  expect(streams[0].tracks[0].enabled).toBe(true);
  expect(ws.readyState).toBe(1); expect(sockets).toHaveLength(1);
  await backToA();
  expect(region()).toBeNull();
  expect(streams[0].tracks[0].enabled).toBe(false);
  expect(post).not.toHaveBeenCalled(); expect(accepted).not.toHaveBeenCalled();
});

it.each(['ready', 'refused', 'failed-after-claim'] as const)('does not let late A claim over an in-flight B start (%s)', async outcome => {
  const grant = await startPendingA();
  await openPanel();
  await waitFor(() => expect(sockets).toHaveLength(1));
  const b = sockets[0];
  act(() => b.open());
  expect(b.controls()).toContainEqual(expect.objectContaining({ type: 'start', agentId: 'B' }));
  const late = new FakeStream();
  await act(async () => { grant(late); await flush(); });
  expect(late.tracks[0].enabled).toBe(false);
  const a = sockets[1];
  act(() => a.open());
  // A's socket opened last. Sending its start now would invert user intent at the relay.
  expect(a.controls()).not.toContainEqual(expect.objectContaining({ type: 'start' }));
  if (outcome !== 'refused') {
    act(() => b.receive(outcome === 'ready' ? panelReady : { type: 'error', code: 'provider', claimed: true, message: 'Unavailable' }));
    expect(late.tracks[0].stopped).toBe(true);
    expect(a.controls()).not.toContainEqual(expect.objectContaining({ type: 'start' }));
    expect(b.readyState).toBe(outcome === 'ready' ? 1 : 3);
  } else {
    act(() => b.receive({ type: 'error', code: 'unauthorized', message: 'Refused' }));
    expect(a.controls()).toContainEqual(expect.objectContaining({ type: 'start', agentId: 'A' }));
    act(() => a.receive(panelReady));
    await backToA();
    expect(region()).toHaveAttribute('data-state', 'muted');
    expect(late.tracks[0].stopped).toBe(false);
  }
  expect(post).not.toHaveBeenCalled();
});
