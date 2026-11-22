import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceCapture, type VoicePhraseEvent } from '../hooks/useVoiceCapture';
import { FakeAudioContext, FakeSocket, FakeStream, contexts, nodes, sockets, streams, getUserMedia, flush, ready, install, resetMedia, restoreMedia } from './fixtures/voiceMedia';

/** Start capture through ready, returning the live socket and worklet node. */
async function listen(result: { current: ReturnType<typeof useVoiceCapture> }) {
  await act(async () => { void result.current.start(); await flush(); });
  const socket = sockets.at(-1)!;
  act(() => socket.open());
  act(() => socket.receive(ready));
  return { socket, node: nodes.at(-1)! };
}

beforeEach(resetMedia);
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); restoreMedia(); });

describe('negotiated panel capture', () => {
  async function panel(negotiated = true) {
    install(); vi.useFakeTimers();
    const onPhrase = vi.fn();
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'A', onPhrase }));
    await act(async () => { await result.current.start('panel'); });
    const [socket] = sockets;
    act(() => { socket.open(); socket.receive(negotiated ? { ...ready, mode: 'panel', settle: true } : ready); });
    expect(socket.controls()[0]).toMatchObject({ agentId: 'A', mode: 'panel' });
    return { result, socket, node: nodes[0], onPhrase };
  }

  it('latches departure before permission and never encodes a marked sample from setup or parked input', async () => {
    install(); vi.useFakeTimers();
    const stream = new FakeStream(); let grant!: (stream: FakeStream) => void;
    getUserMedia.mockImplementationOnce(() => new Promise(resolve => { grant = resolve; }));
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'A' }));
    act(() => { void result.current.start('panel'); result.current.setMuted(true); });
    await act(async () => { grant(stream); await flush(); });
    expect(stream.tracks[0].enabled).toBe(false);
    act(() => { sockets[0].open(); sockets[0].receive({ ...ready, mode: 'panel', settle: true }); vi.advanceTimersByTime(310_000); });
    expect(result.current.state).toBe('muted'); expect(result.current.elapsedMs).toBe(310_000); expect(result.current.remainingMs).toBeNull();
    nodes[0].feed(200);
    expect(sockets[0].frames().length).toBeGreaterThan(2);
    sockets[0].frames().forEach((f, i) => { expect(f.getUint32(0, true)).toBe(i); expect(new Int16Array(f.buffer, 4).every(v => v === 0)).toBe(true); });
  });

  it('puts the marked tail on the wire before settle and filters revisions through the inclusive cutoff', async () => {
    const { result, socket, node, onPhrase } = await panel();
    node.feed(17); let settled!: Promise<boolean>;
    act(() => { settled = result.current.settle(); });
    expect(socket.controls().at(-1)).toEqual({ type: 'settle', id: 1 });
    const tail = socket.sent.at(-2) as ArrayBuffer;
    expect(new Int16Array(tail, 4).some(v => v !== 0)).toBe(true);
    act(() => socket.receive({ type: 'settled', id: 1, ok: true, throughOrder: 4 }));
    await expect(settled).resolves.toBe(true);
    for (const order of [3, 4, 5]) socket.receive({ type: 'phrase', id: 'p' + order, order, revision: 2, final: true, text: 'test' });
    expect(onPhrase.mock.calls.map(([p]) => p.order)).toEqual([5]);
    expect(socket.readyState).toBe(1); expect(result.current.state).toBe('muted');
  });

  it('times out from the request, rejects stale cuts and replies, and never restarts the deadline', async () => {
    const { result, socket, node } = await panel();
    const deliver = node.port.onmessage!;
    node.port.onmessage = null;
    let first!: Promise<boolean>, second!: Promise<boolean>, third!: Promise<boolean>;
    act(() => { first = result.current.settle(); vi.advanceTimersByTime(15_000); });
    await expect(first).resolves.toBe(false);
    act(() => { second = result.current.settle(); deliver({ data: { type: 'gated', epoch: 1 } } as MessageEvent); });
    expect(socket.controls().map(m => m.type)).toEqual(['start']);
    act(() => { vi.advanceTimersByTime(14_999); deliver({ data: { type: 'gated', epoch: 2 } } as MessageEvent); vi.advanceTimersByTime(1); });
    await expect(second).resolves.toBe(false);
    node.port.onmessage = deliver;
    act(() => { third = result.current.settle(); socket.receive({ type: 'settled', id: 1, ok: true, throughOrder: -1 }); });
    let done = false; void third.then(() => { done = true; }); await flush(); expect(done).toBe(false);
    act(() => socket.receive({ type: 'settled', id: 2, ok: true, throughOrder: -1 }));
    await expect(third).resolves.toBe(true);
  });

  it('uses the finite lifecycle when ready omits capability; no unsupported control reaches the socket', async () => {
    const { result, socket } = await panel(false);
    expect(result.current.session?.persistent).toBe(false); expect(result.current.elapsedMs).toBeNull(); expect(result.current.remainingMs).toBe(300_000);
    await expect(result.current.settle()).resolves.toBe(false);
    expect(socket.controls().map(m => m.type)).toEqual(['start']);
  });
});

describe('useVoiceCapture preflight', () => {
  it('insecure HTTP context: disabled with a reason, no microphone or socket even on start', async () => {
    install({ secure: false });
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a' }));
    expect(result.current.support).toEqual({ ok: false, reason: 'insecure', message: 'Microphone requires HTTPS or localhost.' });
    await act(async () => { await result.current.start(); });
    expect(result.current.state).toBe('idle');
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(sockets).toHaveLength(0);
    expect(contexts).toHaveLength(0);
  });

  it('missing AudioWorklet: unsupported, nothing requested', async () => {
    install({ worklet: false });
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a' }));
    expect(result.current.support).toMatchObject({ ok: false, reason: 'unsupported', message: 'Browser does not support audio capture.' });
    await act(async () => { await result.current.start(); });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(sockets).toHaveLength(0);
  });

  it('mounting a supported hook does not touch the microphone or open a socket', () => {
    install();
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a' }));
    expect(result.current.support).toEqual({ ok: true });
    expect(result.current.state).toBe('idle');
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(sockets).toHaveLength(0);
  });

  it('read-only chat never starts', async () => {
    install();
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a', readOnly: true }));
    await act(async () => { await result.current.start(); });
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});

describe('useVoiceCapture session', () => {
  it('permission denial is a recoverable error without socket or audio graph', async () => {
    install();
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a' }));
    await act(async () => { await result.current.start(); });
    expect(result.current.state).toBe('error');
    expect(result.current.error).toEqual({ code: 'permission', message: 'Microphone access was denied.' });
    expect(sockets).toHaveLength(0);
    expect(contexts).toHaveLength(0);
    // Recoverable: a later explicit start works.
    await listen(result);
    expect(result.current.state).toBe('listening');
    expect(result.current.error).toBeNull();
  });

  it('streams sequenced 40 ms PCM16 frames at the announced rate only after ready', async () => {
    install();
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a' }));
    await act(async () => { void result.current.start(); await flush(); });
    expect(getUserMedia).toHaveBeenCalledWith({ audio: expect.objectContaining({ echoCancellation: true, noiseSuppression: true }) });
    expect(result.current.state).toBe('connecting');
    const socket = sockets[0];
    expect(socket.url).toBe(`ws://${location.host}/voice/session`);
    expect(socket.binaryType).toBe('arraybuffer');
    nodes[0].feed(200); // audio before ready is never sent
    act(() => socket.open());
    expect(socket.controls()).toEqual([{ type: 'start', agentId: 'chat-a', generation: 1 }]);
    nodes[0].feed(200);
    expect(socket.frames()).toHaveLength(0);
    act(() => socket.receive(ready));
    expect(result.current.state).toBe('listening');
    expect(result.current.session).toMatchObject({ sessionId: 's1', sampleRate: 24000, destination: { kind: 'cloud', label: 'OpenAI' } });
    expect(result.current.remainingMs).toBe(5 * 60_000);
    nodes[0].feed(1000);
    const frames = socket.frames();
    expect(frames.length).toBeGreaterThanOrEqual(23);
    frames.forEach((frame, i) => {
      expect(frame.getUint32(0, true)).toBe(i);
      expect(frame.byteLength).toBe(4 + 960 * 2); // 40 ms of 24 kHz mono PCM16
    });
    const peak = Math.max(...frames.slice(5).flatMap(f => Array.from({ length: 960 }, (_, k) => Math.abs(f.getInt16(4 + 2 * k, true)))));
    expect(peak).toBeGreaterThan(0.29 * 32767);
    expect(peak).toBeLessThan(0.31 * 32767);
  });

  it('keeps the original deadline across toggles and retires a muted run on server timeout', async () => {
    install();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a' }));
    const { socket } = await listen(result);
    act(() => { vi.advanceTimersByTime(61_000); result.current.setMuted(true); });
    expect(result.current.remainingMs).toBe(239_000);
    act(() => { vi.advanceTimersByTime(60_000); result.current.setMuted(false); result.current.setMuted(true); });
    expect(result.current.remainingMs).toBe(179_000);
    expect(result.current.generation).toBe(1);
    expect(result.current.session?.sessionId).toBe('s1');
    act(() => { vi.advanceTimersByTime(179_000); });
    expect(result.current.remainingMs).toBe(0);
    act(() => socket.receive({ type: 'error', code: 'timeout' }));
    expect(result.current.state).toBe('error');
    expect(result.current.session).toBeNull();
    expect(streams[0].tracks[0].stopped).toBe(true);
    expect(sockets).toHaveLength(1);
    expect(socket.controls().map(c => c.type)).not.toContain('finish');
  });

  it('toggles on one run, drains speech, and releases only on terminal finish before a new start', async () => {
    install();
    const phrases: VoicePhraseEvent[] = [];
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a', onPhrase: e => phrases.push(e) }));
    const { socket, node } = await listen(result);
    node.feed(130); // leaves a partial frame in the worklet
    const track = streams[0].tracks[0];
    const stop = vi.spyOn(track, 'stop');
    const before = socket.frames().length;
    act(() => result.current.setMuted(true));
    expect(result.current.state).toBe('muted');
    expect(track.enabled).toBe(false);
    expect(socket.frames()).toHaveLength(before + 1);
    expect(new Int16Array(socket.frames().at(-1)!.buffer, 4).some(v => v !== 0)).toBe(true);
    node.feed(500);
    expect(socket.frames().slice(before + 1).every(f => new Int16Array(f.buffer, 4).every(v => v === 0))).toBe(true);
    act(() => result.current.setMuted(false));
    expect(track.enabled).toBe(true);
    act(() => result.current.setMuted(true));
    // A delayed worklet frame and stale unmute ACK cannot disclose samples or re-enable the device.
    node.port.onmessage!({ data: { type: 'gated', epoch: 2 } } as MessageEvent);
    node.port.onmessage!({ data: { type: 'frame', epoch: 0, pcm: new Int16Array(960).fill(-999).buffer } } as MessageEvent);
    expect(new Int16Array(socket.frames().at(-1)!.buffer, 4).every(v => v === 0)).toBe(true);
    expect(track.enabled).toBe(false);
    expect(socket.frames().every((f, i) => f.getUint32(0, true) === i)).toBe(true);
    expect(sockets).toHaveLength(1);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(socket.controls()).toHaveLength(1);
    node.feed(10);
    let done!: Promise<boolean>;
    act(() => { done = result.current.finish(); });
    await act(flush);
    expect(result.current.state).toBe('finalizing');
    const controls = socket.sent.map(m => typeof m === 'string' ? JSON.parse(m).type : 'frame');
    expect(controls.slice(-2)).toEqual(['frame', 'finish']); // flushed tail precedes finish
    const tail = socket.frames().at(-1)!;
    expect(tail.byteLength - 4).toBeGreaterThanOrEqual(480 * 2);
    expect(streams[0].tracks[0].stopped).toBe(true);
    expect(contexts[0].closed).toBe(true);
    expect(node.disconnected).toBe(true);
    const sentBefore = socket.sent.length;
    node.feed(500); // stopped worklet: no more audio
    expect(socket.sent.length).toBe(sentBefore);
    act(() => socket.receive({ type: 'phrase', id: 'p1', order: 0, revision: 2, text: 'hello world', final: true }));
    act(() => socket.receive({ type: 'completed' }));
    await act(async () => { expect(await done).toBe(true); });
    expect(result.current.state).toBe('idle');
    expect(stop).toHaveBeenCalledTimes(1);
    expect(result.current.remainingMs).toBeNull();
    expect(phrases).toEqual([{ type: 'phrase', generation: 1, id: 'p1', order: 0, revision: 2, text: 'hello world', final: true }]);
    expect(socket.readyState).toBe(3);

    await act(async () => { void result.current.start(); await flush(); });
    expect(sockets).toHaveLength(2);
    act(() => sockets[1].open());
    expect(sockets[1].controls()[0]).toEqual({ type: 'start', agentId: 'chat-a', generation: 2 });
    act(() => sockets[1].receive(ready));
    nodes[1].feed(100);
    expect(sockets[1].frames()[0].getUint32(0, true)).toBe(0); // sequence restarts per generation
  });

  it('keeps a proven pre-mute frame and tail when a rapid unmute overtakes delayed worklet callbacks', async () => {
    install();
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a' }));
    const { socket, node } = await listen(result);
    const deliver = node.port.onmessage!;
    const queue: MessageEvent[] = [];
    node.port.onmessage = event => queue.push(event);
    node.feed(53); // one complete speech frame and a partial tail, both known to precede mute
    act(() => result.current.setMuted(true));
    node.feed(160); // the fixture still presents nonzero input to the muted processor
    act(() => result.current.setMuted(false));
    expect(streams[0].tracks[0].enabled).toBe(false);
    expect(socket.frames()).toHaveLength(0);
    queue.forEach(deliver); node.port.onmessage = deliver;
    expect(streams[0].tracks[0].enabled).toBe(true);
    const pcm = socket.frames().map(f => new Int16Array(f.buffer, 4));
    expect(pcm.length).toBeGreaterThan(2);
    expect(pcm.slice(0, 2).every(frame => frame.some(v => v > 5000))).toBe(true);
    expect(pcm.slice(2).every(frame => frame.every(v => v === 0))).toBe(true);
    node.feed(80);
    expect(new Int16Array(socket.frames().at(-1)!.buffer, 4).some(v => v > 5000)).toBe(true);
    expect(socket.frames().every((f, i) => f.getUint32(0, true) === i)).toBe(true);
    expect(socket.controls().map(c => c.type)).toEqual(['start']);
  });

  it('navigation releases tracks, cancels the session and ignores its late events', async () => {
    install();
    const phrases: VoicePhraseEvent[] = [];
    const { result, rerender } = renderHook(({ id }) => useVoiceCapture({ agentId: id, onPhrase: e => phrases.push(e) }), { initialProps: { id: 'chat-a' } });
    const { socket, node } = await listen(result);
    const handler = socket.onmessage;
    rerender({ id: 'chat-b' });
    expect(streams[0].tracks[0].stopped).toBe(true);
    expect(contexts[0].closed).toBe(true);
    expect(socket.controls().at(-1)).toEqual({ type: 'cancel' });
    expect(socket.readyState).toBe(3);
    expect(result.current.state).toBe('idle');
    // Even a captured handler cannot deliver an old generation's result.
    act(() => handler?.({ data: JSON.stringify({ type: 'phrase', id: 'late', order: 0, revision: 1, text: 'late', final: true }) }));
    node.feed(200);
    expect(phrases).toEqual([]);
    expect(socket.frames()).toHaveLength(0);
  });

  it('a microphone grant that resolves after navigation is stopped and never streamed', async () => {
    install();
    let grant!: (s: FakeStream) => void;
    getUserMedia.mockImplementationOnce(() => new Promise(resolve => { grant = resolve; }));
    const { result, rerender } = renderHook(({ id }) => useVoiceCapture({ agentId: id }), { initialProps: { id: 'chat-a' } });
    act(() => { void result.current.start(); });
    rerender({ id: 'chat-b' });
    const late = new FakeStream();
    await act(async () => { grant(late); await flush(); });
    expect(late.tracks[0].stopped).toBe(true);
    expect(contexts).toHaveLength(0);
    expect(sockets).toHaveLength(0);
    expect(result.current.state).toBe('idle');
  });

  it('cancel during a pending grant also drops it and a new start uses a new generation', async () => {
    install();
    let grant!: (s: FakeStream) => void;
    getUserMedia.mockImplementationOnce(() => new Promise(resolve => { grant = resolve; }));
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a' }));
    act(() => { void result.current.start(); });
    act(() => result.current.cancel());
    const late = new FakeStream();
    await act(async () => { grant(late); await flush(); });
    expect(late.tracks[0].stopped).toBe(true);
    expect(sockets).toHaveLength(0);
    await listen(result);
    // Generations: 1 (dropped start), 2 (cancel), 3 (new start).
    expect(sockets[0].controls()[0]).toMatchObject({ type: 'start', generation: 3 });
    expect(result.current.state).toBe('listening');
  });

  it('becoming read-only cancels capture and releases the microphone', async () => {
    install();
    const { result, rerender } = renderHook(({ readOnly }) => useVoiceCapture({ agentId: 'chat-a', readOnly }), { initialProps: { readOnly: false } });
    const { socket } = await listen(result);
    rerender({ readOnly: true });
    expect(streams[0].tracks[0].stopped).toBe(true);
    expect(socket.controls().at(-1)).toEqual({ type: 'cancel' });
    expect(result.current.state).toBe('idle');
    await act(async () => { await result.current.start(); });
    expect(sockets).toHaveLength(1);
  });

  it('server readOnly and superseded errors are surfaced and release capture', async () => {
    install();
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a' }));
    const { socket } = await listen(result);
    act(() => socket.receive({ type: 'error', code: 'superseded', message: 'Dictation moved to another tab.' }));
    expect(result.current.state).toBe('error');
    expect(result.current.error).toEqual({ code: 'superseded', message: 'Dictation moved to another tab.' });
    expect(streams[0].tracks[0].stopped).toBe(true);
    // Unknown codes are mapped into the closed set.
    const second = await listen(result);
    act(() => second.socket.receive({ type: 'error', code: 'vendor_x', message: '' }));
    expect(result.current.error?.code).toBe('provider');
  });

  it('socket loss while listening or finalizing fails visibly, stops tracks and finish resolves false', async () => {
    install();
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a' }));
    const { socket } = await listen(result);
    act(() => socket.drop());
    expect(result.current.state).toBe('error');
    expect(result.current.error?.code).toBe('connection');
    expect(streams[0].tracks[0].stopped).toBe(true);
    expect(contexts[0].closed).toBe(true);

    const next = await listen(result);
    let finished!: Promise<boolean>;
    act(() => { finished = result.current.finish(); });
    await act(flush);
    act(() => next.socket.drop());
    await act(async () => { expect(await finished).toBe(false); });
    expect(result.current.state).toBe('error');
  });

  it('finish times out on the client if the server never completes', async () => {
    install();
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a' }));
    await listen(result);
    vi.useFakeTimers();
    let finished!: Promise<boolean>;
    act(() => { finished = result.current.finish(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(16_000); });
    await act(async () => { expect(await finished).toBe(false); });
    expect(result.current.error?.code).toBe('timeout');
  });

  it('unmount releases everything and drops late messages', async () => {
    install();
    const phrases: VoicePhraseEvent[] = [];
    const { result, unmount } = renderHook(() => useVoiceCapture({ agentId: 'chat-a', onPhrase: e => phrases.push(e) }));
    const { socket } = await listen(result);
    const handler = socket.onmessage;
    unmount();
    expect(streams[0].tracks[0].stopped).toBe(true);
    expect(socket.readyState).toBe(3);
    handler?.({ data: JSON.stringify({ type: 'phrase', id: 'x', order: 0, revision: 1, text: 'x', final: true }) });
    expect(phrases).toEqual([]);
  });

  it('rejects an unusable announced sample rate with protocol', async () => {
    install();
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a' }));
    await act(async () => { void result.current.start(); await flush(); });
    act(() => sockets[0].open());
    act(() => sockets[0].receive({ ...ready, sampleRate: 12.5 }));
    expect(result.current.error?.code).toBe('protocol');
    expect(streams[0].tracks[0].stopped).toBe(true);
  });
});

describe('useVoiceCapture start hardening', () => {
  const live = () => streams.at(-1)!.tracks[0];
  /** Everything one attempt owned is released: microphone, graph, worklet URL and socket. */
  const expectReleased = (i = streams.length - 1) => {
    expect(streams[i].tracks[0].stopped).toBe(true);
    if (contexts[i]) expect(contexts[i].closed).toBe(true);
    const created = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls.length;
    expect((URL.revokeObjectURL as ReturnType<typeof vi.fn>).mock.calls.length).toBe(created);
  };
  /** A retry after the failure reaches listening with a fresh generation. */
  const expectRetry = async (result: { current: ReturnType<typeof useVoiceCapture> }) => {
    const before = streams.length;
    vi.useRealTimers();
    await listen(result);
    expect(streams).toHaveLength(before + 1);
    expect(result.current.state).toBe('listening');
    expect(result.current.error).toBeNull();
  };

  it('a synchronous blob URL refusal fails the attempt, stops the microphone and allows a retry', async () => {
    install();
    (URL.createObjectURL as ReturnType<typeof vi.fn>).mockImplementationOnce(() => { throw new Error('blocked'); });
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a' }));
    await act(async () => { await result.current.start(); });
    expect(result.current.state).toBe('error');
    expect(result.current.error).toEqual({ code: 'microphone', message: 'Audio capture could not be started.' });
    expect(streams[0].tracks[0].stopped).toBe(true);
    expect(contexts).toHaveLength(0);
    expect(sockets).toHaveLength(0);
    await expectRetry(result);
  });

  it('a throwing AudioContext constructor or rejected resume releases the microphone and URL', async () => {
    install();
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a' }));
    vi.stubGlobal('AudioContext', class { constructor() { throw new Error('no audio'); } });
    await act(async () => { await result.current.start(); });
    expect(result.current.error?.code).toBe('microphone');
    expectReleased();

    class Suspended extends FakeAudioContext { state = 'suspended' as const; async resume(): Promise<void> { throw new Error('autoplay'); } }
    vi.stubGlobal('AudioContext', Suspended);
    await act(async () => { await result.current.start(); });
    expect(result.current.error?.code).toBe('microphone');
    expectReleased();
    expect(nodes[0].disconnected).toBe(true);
    expect(sockets).toHaveLength(0);
    vi.stubGlobal('AudioContext', FakeAudioContext);
    await expectRetry(result);
  });

  it('a synchronous WebSocket refusal fails with connection and releases the audio graph', async () => {
    install();
    vi.stubGlobal('WebSocket', class { constructor() { throw new SyntaxError('bad url'); } });
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a' }));
    await act(async () => { await result.current.start(); });
    expect(result.current.state).toBe('error');
    expect(result.current.error).toEqual({ code: 'connection', message: 'The voice connection was lost.' });
    expectReleased();
    expect(nodes[0].disconnected).toBe(true);
    vi.stubGlobal('WebSocket', FakeSocket);
    await expectRetry(result);
  });

  it('the permission prompt itself is never timed', async () => {
    install();
    vi.useFakeTimers();
    let grant!: (s: FakeStream) => void;
    getUserMedia.mockImplementationOnce(() => new Promise(resolve => { grant = resolve; }));
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a' }));
    act(() => { void result.current.start(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(result.current.state).toBe('connecting');
    expect(result.current.error).toBeNull();
    const granted = new FakeStream(); streams.push(granted);
    await act(async () => { grant(granted); await flush(); });
    act(() => sockets[0].open());
    act(() => sockets[0].receive(ready));
    expect(result.current.state).toBe('listening');
    expect(granted.tracks[0].stopped).toBe(false);
  });

  it('a hung addModule times out after the grant, releases everything and ignores the late resolution', async () => {
    install();
    vi.useFakeTimers();
    let loaded!: () => void;
    class Hung extends FakeAudioContext {
      audioWorklet = { addModule: (url: string) => new Promise<void>(resolve => { this.modules.push(url); loaded = resolve; }) };
    }
    vi.stubGlobal('AudioContext', Hung);
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a' }));
    await act(async () => { void result.current.start(); await flush(); });
    expect(result.current.state).toBe('connecting');
    await act(async () => { await vi.advanceTimersByTimeAsync(14_999); });
    expect(result.current.state).toBe('connecting');
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(result.current.state).toBe('error');
    expect(result.current.error).toEqual({ code: 'timeout', message: 'Voice capture did not start in time.' });
    expectReleased();
    await act(async () => { loaded(); await flush(); });
    expect(nodes).toHaveLength(0);
    expect(sockets).toHaveLength(0);
    expect(result.current.state).toBe('error');
    vi.stubGlobal('AudioContext', FakeAudioContext);
    await expectRetry(result);
  });

  it('a socket stuck in CONNECTING times out and is closed; late open is ignored', async () => {
    install();
    vi.useFakeTimers();
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a' }));
    await act(async () => { void result.current.start(); await flush(); });
    const socket = sockets[0];
    const onopen = socket.onopen;
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(result.current.error?.code).toBe('timeout');
    expect(socket.readyState).toBe(3);
    expect(socket.onopen).toBeNull();
    expectReleased();
    socket.readyState = 1; onopen?.();
    expect(socket.sent).toEqual([]);
    await expectRetry(result);
  });

  it('an open socket that never announces ready times out with cancel; a late ready is dropped', async () => {
    install();
    vi.useFakeTimers();
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a' }));
    await act(async () => { void result.current.start(); await flush(); });
    const socket = sockets[0];
    act(() => socket.open());
    const onmessage = socket.onmessage;
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(result.current.error?.code).toBe('timeout');
    expect(socket.controls().map(m => m.type)).toEqual(['start', 'cancel']);
    expect(socket.readyState).toBe(3);
    expectReleased();
    act(() => onmessage?.({ data: JSON.stringify(ready) }));
    expect(result.current.state).toBe('error');
    expect(result.current.session).toBeNull();
    await expectRetry(result);
  });

  it('ready clears the start deadline: a long session is not failed by it', async () => {
    install();
    vi.useFakeTimers();
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a' }));
    await listen(result);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(result.current.state).toBe('listening');
    expect(result.current.error).toBeNull();
  });

  it('cancel while waiting for the worklet or for ready releases everything and stays idle', async () => {
    install();
    vi.useFakeTimers();
    let loaded!: () => void;
    class Hung extends FakeAudioContext {
      audioWorklet = { addModule: (url: string) => new Promise<void>(resolve => { this.modules.push(url); loaded = resolve; }) };
    }
    vi.stubGlobal('AudioContext', Hung);
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a' }));
    await act(async () => { void result.current.start(); await flush(); });
    act(() => result.current.cancel());
    expect(result.current.state).toBe('idle');
    expectReleased();
    await act(async () => { loaded(); await flush(); await vi.advanceTimersByTimeAsync(30_000); });
    expect(nodes).toHaveLength(0);
    expect(sockets).toHaveLength(0);
    expect(result.current.state).toBe('idle');
    expect(result.current.error).toBeNull();

    vi.stubGlobal('AudioContext', FakeAudioContext);
    await act(async () => { void result.current.start(); await flush(); });
    const socket = sockets[0];
    act(() => socket.open());
    act(() => result.current.cancel());
    expect(socket.controls().map(m => m.type)).toEqual(['start', 'cancel']);
    expectReleased();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(result.current.state).toBe('idle');
    expect(result.current.error).toBeNull();
  });

  it('a worklet processorerror while listening fails visibly and releases microphone and socket', async () => {
    install();
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a' }));
    const { socket, node } = await listen(result);
    act(() => node.onprocessorerror?.());
    expect(result.current.state).toBe('error');
    expect(result.current.error).toEqual({ code: 'microphone', message: 'Audio capture could not be started.' });
    expect(node.disconnected).toBe(true);
    expect(socket.controls().at(-1)).toEqual({ type: 'cancel' });
    expect(socket.readyState).toBe(3);
    expectReleased();
    await expectRetry(result);
  });

  it('an unexpectedly ended microphone track stops the worklet and the session', async () => {
    install();
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a' }));
    const { socket, node } = await listen(result);
    act(() => live().end());
    expect(result.current.error).toEqual({ code: 'microphone', message: 'The microphone stopped unexpectedly.' });
    expect(node.disconnected).toBe(true);
    expect(socket.readyState).toBe(3);
    expectReleased();
    // A track that ended while the graph was still being built is caught before the socket opens.
    getUserMedia.mockImplementationOnce(async () => { const s = new FakeStream(); s.tracks[0].readyState = 'ended'; streams.push(s); return s; });
    await act(async () => { await result.current.start(); });
    expect(result.current.error?.code).toBe('microphone');
    expect(sockets).toHaveLength(1);
    expectReleased();
    await expectRetry(result);
  });

  it('a released track does not report its own stop as an unexpected end', async () => {
    install();
    const { result } = renderHook(() => useVoiceCapture({ agentId: 'chat-a' }));
    await listen(result);
    act(() => result.current.cancel());
    act(() => streams[0].tracks[0].onended?.());
    expect(streams[0].tracks[0].onended).toBeNull();
    expect(result.current.state).toBe('idle');
    expect(result.current.error).toBeNull();
  });
});
