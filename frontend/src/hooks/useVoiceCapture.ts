import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isVoiceErrorId, type VoiceDestination } from '../lib/voice';
import {
  VOICE_PROCESSOR, VOICE_SESSION_MS, VOICE_SOCKET_PATH, encodeFrame, frameBounds, voiceCaptureSupport, voiceWorkletSource,
  type VoiceSupport,
} from '../lib/voiceCapture';

export type VoiceCaptureState = 'idle' | 'connecting' | 'listening' | 'finalizing' | 'muted' | 'error';
export type VoiceErrorCode =
  | 'unauthorized' | 'readOnly' | 'superseded' | 'unconfigured' | 'routeUnavailable' | 'providerAuth' | 'provider'
  | 'timeout' | 'backpressure' | 'protocol' | 'permission' | 'microphone' | 'connection';
export type VoiceCaptureError = { code: VoiceErrorCode; message: string; errorId?: string };
/** Phrase events stay with their originating generation, including while its panel is parked. */
export type VoicePhraseEvent =
  | { type: 'phrase'; generation: number; id: string; order: number; revision: number; text: string; final: boolean }
  | { type: 'phraseFailed'; generation: number; id: string; order: number; reason: string };
export type VoiceSessionInfo = { sessionId: string; route: string; destination: VoiceDestination; sampleRate: number; persistent?: boolean };
/** One page-local dedicated-start claim. The relay remains the authority across tabs. */
export type PanelStart = { connect(send: () => void): void; accepted(): void; release(): void };

export type UseVoiceCaptureOptions = {
  agentId: string;
  /** A read-only or archived chat never captures; becoming read-only cancels an active session. */
  readOnly?: boolean;
  onPhrase?: (event: VoicePhraseEvent) => void;
  /** Order competing dedicated starts by user intent, not by microphone or socket setup latency. */
  panelStart?: (agentId: string) => PanelStart;
};

export type VoiceCapture = {
  /** Synchronous capability preflight; when not ok, `start` does nothing and no microphone or socket is touched. */
  support: VoiceSupport;
  state: VoiceCaptureState;
  error: VoiceCaptureError | null;
  /** Server-limit countdown, shared by listening and connected mute. */
  remainingMs: number | null;
  session: VoiceSessionInfo | null;
  generation: number;
  start: (mode?: 'inline' | 'panel') => Promise<void>;
  elapsedMs: number | null;
  /** Nonterminal boundary; only available on a negotiated panel run. */
  settle: () => Promise<boolean>;
  /** Mute also latches while permission or negotiation is pending. */
  setMuted: (muted: boolean) => void;
  /** Stop audio and resolve true once every committed phrase is final; false on failure or when nothing ran. */
  finish: () => Promise<boolean>;
  /** Drop the session and every later event immediately. */
  cancel: () => void;
};

const FLUSH_TIMEOUT_MS = 1_000;
/** After the microphone is granted (the permission prompt itself is never timed): audio graph, socket and `ready`. */
const START_TIMEOUT_MS = 15_000;
const FINISH_TIMEOUT_MS = 15_000;
const MAX_CLIENT_BUFFER = 1024 * 1024;
const MESSAGES: Record<string, string> = {
  unauthorized: 'Voice access was refused.',
  readOnly: 'This chat can no longer be edited.',
  superseded: 'Dictation moved to another tab.',
  unconfigured: 'No voice model is configured.',
  routeUnavailable: 'The selected voice route is unavailable.',
  providerAuth: 'The voice provider rejected the connection credentials.',
  provider: 'The voice provider failed.',
  timeout: 'Voice recognition timed out.',
  backpressure: 'Voice audio arrived faster than it could be transcribed.',
  protocol: 'The voice session received invalid input.',
  connection: 'The voice connection was lost.',
  startTimeout: 'Voice capture did not start in time.',
  audioStart: 'Audio capture could not be started.',
  audioStopped: 'The microphone stopped unexpectedly.',
};
const SERVER_CODES = new Set(['unauthorized', 'readOnly', 'superseded', 'unconfigured', 'routeUnavailable', 'providerAuth', 'provider', 'timeout', 'backpressure', 'protocol']);

type Boundary = { id: number; epoch: number; sent: boolean; deadline: number; end: (ok: boolean) => void };
type Run = {
  owner: string;
  mode: 'inline' | 'panel';
  startClaim?: PanelStart;
  startSent?: boolean;
  persistent: boolean;
  lastBoundary: number;
  throughOrder: number;
  boundary?: Boundary;
  generation: number;
  stream?: MediaStream;
  context?: AudioContext;
  source?: MediaStreamAudioSourceNode;
  node?: AudioWorkletNode;
  socket?: WebSocket;
  /** Blob URL of the worklet module, revoked as soon as it is loaded or the attempt ends. */
  url?: string;
  /** Bounds the start after the microphone grant until `ready`. */
  startTimer?: ReturnType<typeof setTimeout>;
  ready: boolean;
  sending: boolean;
  muted: boolean;
  epoch: number;
  /** Render-clock cutoff for each listening epoch until the worklet drains and acknowledges it. */
  muteCuts: Map<number, number>;
  phraseFailed?: boolean;
  sequence: number;
  timers: ReturnType<typeof setTimeout>[];
  ticker?: ReturnType<typeof setInterval>;
  finishDone?: (ok: boolean) => void;
  flushed?: () => void;
  released: boolean;
};

function browserEnv() {
  if (typeof window === 'undefined') return {};
  const w = window as unknown as Record<string, unknown>;
  return {
    isSecureContext: window.isSecureContext,
    mediaDevices: typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined,
    AudioContext: w.AudioContext ?? w.webkitAudioContext,
    AudioWorkletNode: w.AudioWorkletNode,
    WebSocket: w.WebSocket,
  };
}

function microphoneError(error: unknown): VoiceCaptureError {
  const name = (error as { name?: unknown } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return { code: 'permission', message: 'Microphone access was denied.' };
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return { code: 'microphone', message: 'No microphone was found.' };
  return { code: 'microphone', message: 'The microphone could not be started.' };
}

/**
 * One capture controller per chat composer: microphone → AudioWorklet (mono, resampled, PCM16 frames) → one
 * `/voice/session` WebSocket per generation. Nothing happens on mount; only `start` request the microphone.
 */
export function useVoiceCapture({ agentId, readOnly = false, onPhrase, panelStart }: UseVoiceCaptureOptions): VoiceCapture {
  const support = useMemo(() => voiceCaptureSupport(browserEnv()), []);
  const [state, setState] = useState<VoiceCaptureState>('idle');
  const [error, setError] = useState<VoiceCaptureError | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [session, setSession] = useState<VoiceSessionInfo | null>(null);
  const [generation, setGeneration] = useState(0);
  const generationRef = useRef(0);
  const run = useRef<Run | null>(null);
  const mounted = useRef(true);
  const phrase = useRef(onPhrase); phrase.current = onPhrase;
  const target = useRef({ agentId, readOnly, panelStart }); target.current = { agentId, readOnly, panelStart };

  const current = (r: Run) => mounted.current && run.current === r && !r.released;

  /** Stop audio input: tracks, graph and worklet. The socket may stay open to finalize. */
  const releaseAudio = (r: Run) => {
    r.sending = false;
    if (r.node) {
      r.node.port.onmessage = null; r.node.onprocessorerror = null;
      try { r.node.port.postMessage({ type: 'stop' }); } catch { /* closed */ }
      try { r.node.disconnect(); } catch { /* detached */ }
    }
    try { r.source?.disconnect(); } catch { /* detached */ }
    r.stream?.getTracks().forEach(track => { track.onended = null; try { track.stop(); } catch { /* already stopped */ } });
    try { if (r.context && r.context.state !== 'closed') void r.context.close().catch(() => undefined); } catch { /* closed */ }
    r.node = undefined; r.source = undefined; r.stream = undefined; r.context = undefined;
    r.flushed?.(); r.flushed = undefined;
  };

  const revokeUrl = (r: Run) => {
    if (!r.url) return;
    try { URL.revokeObjectURL(r.url); } catch { /* already revoked */ }
    r.url = undefined;
  };

  /** Release everything this run owns; idempotent. `cancel` tells the server to drop the session. */
  const release = (r: Run, cancel: boolean, ok = false) => {
    if (r.released) return;
    r.released = true;
    r.boundary?.end(false);
    releaseAudio(r);
    revokeUrl(r);
    r.timers.forEach(clearTimeout); r.timers = []; r.startTimer = undefined;
    clearInterval(r.ticker);
    const ws = r.socket;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try {
        if (cancel && r.startSent && ws.readyState === 1) ws.send(JSON.stringify({ type: 'cancel' }));
        if (ws.readyState === 1 || ws.readyState === 0) ws.close(1000);
      } catch { /* already closed */ }
    }
    r.socket = undefined;
    r.startClaim?.release(); r.startClaim = undefined;
    if (run.current === r) run.current = null;
    const settle = r.finishDone; r.finishDone = undefined;
    settle?.(ok);
  };

  const fail = (r: Run, failure: VoiceCaptureError) => {
    if (!current(r)) return;
    release(r, true);
    setError(failure); setState('error'); setRemainingMs(null); setSession(null);
  };

  const sendFrame = (r: Run, pcm: ArrayBuffer) => {
    const ws = r.socket;
    if (!r.sending || !current(r) || !ws || ws.readyState !== 1) return;
    if (ws.bufferedAmount > MAX_CLIENT_BUFFER) return fail(r, { code: 'backpressure', message: MESSAGES.backpressure });
    try { ws.send(encodeFrame(r.sequence++, new Int16Array(pcm))); }
    catch { fail(r, { code: 'connection', message: MESSAGES.connection }); }
  };

  const onServer = (r: Run, data: unknown) => {
    if (!current(r) || typeof data !== 'string') return;
    let message: Record<string, unknown>;
    try { message = JSON.parse(data) as Record<string, unknown>; } catch { return fail(r, { code: 'protocol', message: MESSAGES.protocol }); }
    if (!message || typeof message !== 'object') return;
    switch (message.type) {
      case 'ready': {
        if (!r.startSent || r.ready || !r.node) return;
        const sampleRate = Number(message.sampleRate);
        let bounds: ReturnType<typeof frameBounds>;
        try { bounds = frameBounds(sampleRate); } catch { return fail(r, { code: 'protocol', message: MESSAGES.protocol }); }
        r.ready = true; r.sending = true;
        r.startClaim?.accepted();
        clearTimeout(r.startTimer); r.startTimer = undefined;
        r.node.port.postMessage({ type: 'configure', muted: r.muted, sampleRate, frameSamples: bounds.target, minSamples: bounds.min });
        r.persistent = r.mode === 'panel' && message.mode === 'panel' && message.settle === true;
        const started = Date.now();
        setElapsed(0); setRemainingMs(r.persistent ? null : VOICE_SESSION_MS);
        r.ticker = setInterval(() => {
          if (!current(r)) return;
          const ms = Math.max(0, Date.now() - started);
          if (r.persistent) setElapsed(ms); else setRemainingMs(Math.max(0, VOICE_SESSION_MS - ms));
        }, 1000);
        setSession({ sessionId: String(message.sessionId ?? ''), route: String(message.route ?? ''), destination: message.destination as VoiceDestination, sampleRate, persistent: r.persistent });
        setState(r.muted ? 'muted' : 'listening');
        return;
      }
      case 'settled': {
        const b = r.boundary;
        if (!b?.sent || message.id !== b.id) return;
        if (typeof message.ok !== 'boolean' || typeof message.throughOrder !== 'number' || !Number.isSafeInteger(message.throughOrder) || message.throughOrder < -1) return fail(r, { code: 'protocol', message: MESSAGES.protocol });
        const ok = message.ok && !r.phraseFailed && performance.now() < b.deadline;
        if (ok) r.throughOrder = Math.max(r.throughOrder, message.throughOrder);
        b.end(ok);
        return;
      }
      case 'phrase':
        if (typeof message.order === 'number' && message.order <= r.throughOrder) return;
        if (typeof message.id === 'string' && typeof message.text === 'string' && typeof message.order === 'number' && typeof message.revision === 'number') {
          phrase.current?.({ type: 'phrase', generation: r.generation, id: message.id, order: message.order, revision: message.revision, text: message.text, final: message.final === true });
        }
        return;
      case 'phraseFailed':
        if (typeof message.order === 'number' && message.order <= r.throughOrder) return;
        if (typeof message.id === 'string' && typeof message.order === 'number') {
          // A transport-level completed event also follows failed items. Never authorize a partial
          // submission, and keep a visible interim if this failure arrived while finishing.
          r.phraseFailed = true;
          if (r.finishDone) return fail(r, { code: 'provider', message: MESSAGES.provider });
          phrase.current?.({ type: 'phraseFailed', generation: r.generation, id: message.id, order: message.order, reason: String(message.reason ?? '') });
        }
        return;
      case 'completed': {
        if (r.phraseFailed) return fail(r, { code: 'provider', message: MESSAGES.provider });
        const settle = r.finishDone;
        release(r, false, true);
        if (!settle) { setState('idle'); setRemainingMs(null); setSession(null); }
        return;
      }
      case 'error': {
        // A start may have replaced the old lease before its own provider setup failed.
        if (!r.ready && r.startSent && message.claimed === true) r.startClaim?.accepted();
        const code = typeof message.code === 'string' && SERVER_CODES.has(message.code) ? message.code as VoiceErrorCode : 'provider';
        const errorId = isVoiceErrorId(message.errorId) ? message.errorId : undefined;
        return fail(r, { code, message: typeof message.message === 'string' && message.message ? message.message : MESSAGES[code], ...(errorId && { errorId }) });
      }
    }
  };

  const begin = useCallback(async (mode: 'inline' | 'panel') => {
    if (!support.ok || target.current.readOnly || !target.current.agentId) return;
    if (run.current) return;
    const g = ++generationRef.current;
    const r: Run = { owner: target.current.agentId, mode, persistent: false, lastBoundary: 0, throughOrder: -1, generation: g, ready: false, sending: false, sequence: 0, muted: false, epoch: 0, muteCuts: new Map(), timers: [], released: false };
    if (mode === 'panel') r.startClaim = target.current.panelStart?.(r.owner);
    run.current = r;
    setGeneration(g); setError(null); setSession(null); setRemainingMs(null); setState('connecting');
    let stream: MediaStream;
    try {
      // The permission prompt is the user's decision and is never timed.
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (err) {
      if (current(r)) { release(r, false); setError(microphoneError(err)); setState('error'); }
      return;
    }
    // A permission prompt may resolve after cancel, navigation or a newer start: never keep that microphone.
    if (!current(r)) { stream.getTracks().forEach(track => { try { track.stop(); } catch { /* stopped */ } }); return; }
    r.stream = stream;
    if (r.muted) stream.getTracks().forEach(track => { track.enabled = false; });
    // From here every step is bounded: a hung addModule/resume, a socket stuck in CONNECTING or a missing `ready`
    // ends the attempt and releases microphone, graph, worklet URL and socket.
    r.startTimer = setTimeout(() => fail(r, { code: 'timeout', message: MESSAGES.startTimeout }), START_TIMEOUT_MS);
    r.timers.push(r.startTimer);
    let stage: 'audio' | 'socket' = 'audio';
    try {
      stream.getTracks().forEach(track => { track.onended = () => fail(r, { code: 'microphone', message: MESSAGES.audioStopped }); });
      r.url = URL.createObjectURL(new Blob([voiceWorkletSource()], { type: 'text/javascript' }));
      const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const Context = (w.AudioContext ?? w.webkitAudioContext)!;
      const context = new Context({ latencyHint: 'interactive' });
      r.context = context;
      await context.audioWorklet.addModule(r.url);
      if (!current(r)) return;
      revokeUrl(r);
      const node = new AudioWorkletNode(context, VOICE_PROCESSOR, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      r.node = node;
      node.onprocessorerror = () => fail(r, { code: 'microphone', message: MESSAGES.audioStart });
      const source = context.createMediaStreamSource(stream);
      r.source = source;
      node.port.onmessage = (event: MessageEvent) => {
        if (!current(r)) return;
        const data = event.data as { type?: string; pcm?: ArrayBuffer; epoch?: number; boundary?: boolean; inputEnd?: number };
        if (data?.type === 'frame' && data.pcm) {
          // Frames and gate ACKs arrive FIFO. A newer user toggle can overtake their delivery:
          // keep proven pre-mute audio up to each cut, but replace any ambiguous PCM with silence.
          // A boundary tail already went through the worklet's safe-cut check before it was posted.
          const cut = data.epoch === undefined ? undefined : r.muteCuts.get(data.epoch);
          const safe = data.boundary || (cut !== undefined && data.inputEnd !== undefined && data.inputEnd <= cut) ||
            (data.epoch === r.epoch && !r.muted);
          sendFrame(r, safe ? data.pcm : new ArrayBuffer(data.pcm.byteLength));
        } else if (data?.type === 'gated' && data.epoch !== undefined) {
          r.muteCuts.delete(data.epoch - 1);
          const b = r.boundary;
          if (b && !b.sent && data.epoch === b.epoch) {
            if (performance.now() >= b.deadline) return b.end(false);
            try { r.lastBoundary = b.id; b.sent = true; r.socket!.send(JSON.stringify({ type: 'settle', id: b.id })); }
            catch { return fail(r, { code: 'connection', message: MESSAGES.connection }); }
          }
          if (data.epoch === r.epoch && !r.muted && !r.finishDone) r.stream?.getTracks().forEach(track => { track.enabled = true; });
        } else if (data?.type === 'flushed') { r.flushed?.(); r.flushed = undefined; }
      };
      // The worklet outputs silence; it is connected only to keep the graph pulling input.
      source.connect(node); node.connect(context.destination);
      if (context.state === 'suspended') await context.resume();
      if (!current(r)) return;
      // A track can end while the graph was being built; its `ended` event may already be gone.
      if (stream.getTracks().some(track => track.readyState === 'ended')) return fail(r, { code: 'microphone', message: MESSAGES.audioStopped });
      stage = 'socket';
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${VOICE_SOCKET_PATH}`);
      r.socket = ws;
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        if (!current(r)) return;
        const send = () => {
          if (!current(r) || r.startSent) return;
          try { ws.send(JSON.stringify({ type: 'start', agentId: r.owner, generation: g, ...(mode === 'panel' && { mode }) })); r.startSent = true; }
          catch { fail(r, { code: 'connection', message: MESSAGES.connection }); }
        };
        if (r.startClaim) r.startClaim.connect(send); else send();
      };
      ws.onmessage = event => onServer(r, event.data);
      ws.onerror = () => fail(r, { code: 'connection', message: MESSAGES.connection });
      ws.onclose = () => fail(r, { code: 'connection', message: MESSAGES.connection });
    } catch {
      // Synchronous or async browser refusals (blob URL, AudioContext, addModule, node, resume, WebSocket).
      if (stage === 'socket') fail(r, { code: 'connection', message: MESSAGES.connection });
      else fail(r, { code: 'microphone', message: MESSAGES.audioStart });
    } finally {
      if (!current(r)) revokeUrl(r);
    }
  }, [support.ok]);

  function gate(r: Run, muted: boolean) {
    const cut = r.context?.currentTime ?? 0;
    r.muted = muted;
    // Keep tracks disabled until the *current* unmute is acknowledged on the render thread.
    if (muted) {
      r.muteCuts.set(r.epoch, cut);
      r.stream?.getTracks().forEach(track => { track.enabled = false; });
    }
    if (!r.ready || !r.node) return;
    try { r.node.port.postMessage({ type: 'gate', muted, epoch: ++r.epoch, cut }); }
    catch { return fail(r, { code: 'microphone', message: MESSAGES.audioStopped }); }
    setState(muted ? 'muted' : 'listening');
  }

  const setMuted = useCallback((muted: boolean) => {
    const r = run.current;
    if (!r || r.finishDone || r.boundary || r.muted === muted || (!muted && !r.ready)) return;
    gate(r, muted);
  }, []);

  const settle = useCallback((): Promise<boolean> => {
    const r = run.current;
    if (!r?.persistent || !r.node || !r.ready || r.finishDone || r.boundary) return Promise.resolve(false);
    return new Promise(resolve => {
      const deadline = performance.now() + FINISH_TIMEOUT_MS;
      // Consume a wire ID only when its cut is acknowledged and the request is sent.
      const id = r.lastBoundary + 1;
      const timer = setTimeout(() => b.end(false), FINISH_TIMEOUT_MS);
      const b: Boundary = { id, deadline, epoch: r.epoch + 1, sent: false, end(ok) {
        if (r.boundary !== b) return;
        r.boundary = undefined; clearTimeout(timer); resolve(ok);
      } };
      r.boundary = b;
      // Even when already muted, a fresh FIFO marker distinguishes this attempt from a timed-out cut.
      gate(r, true);
    });
  }, []);

  const finish = useCallback(async (): Promise<boolean> => {
    const r = run.current;
    if (!r || r.released) return false;
    r.boundary?.end(false);
    if (!r.ready) {
      // Nothing was streamed yet: there is nothing to finalize.
      release(r, true);
      setState('idle'); setRemainingMs(null); setSession(null);
      return true;
    }
    if (r.socket?.readyState !== 1) { fail(r, { code: 'connection', message: MESSAGES.connection }); return false; }
    if (r.finishDone) return new Promise(resolve => { const prior = r.finishDone!; r.finishDone = ok => { prior(ok); resolve(ok); }; });
    setState('finalizing');
    const done = new Promise<boolean>(resolve => { r.finishDone = resolve; });
    // Drain resampler/framer tails before telling the server to finish; the server ignores audio after finish.
    if (r.node) {
      await new Promise<void>(resolve => {
        r.flushed = resolve;
        r.timers.push(setTimeout(() => { if (r.flushed) fail(r, { code: 'timeout', message: MESSAGES.timeout }); }, FLUSH_TIMEOUT_MS));
        try { r.node!.port.postMessage({ type: 'flush' }); }
        catch { fail(r, { code: 'microphone', message: MESSAGES.audioStopped }); }
      });
    }
    releaseAudio(r);
    if (r.released) return done;
    clearInterval(r.ticker);
    r.timers.push(setTimeout(() => fail(r, { code: 'timeout', message: 'Voice finalization timed out.' }), FINISH_TIMEOUT_MS));
    try { r.socket?.send(JSON.stringify({ type: 'finish' })); } catch { fail(r, { code: 'connection', message: MESSAGES.connection }); }
    const ok = await done;
    if (ok && mounted.current && generationRef.current === r.generation) { setState('idle'); setRemainingMs(null); setSession(null); }
    return ok;
  }, []);

  const cancel = useCallback(() => {
    const r = run.current;
    generationRef.current++;
    if (r) release(r, true);
    if (mounted.current) { setState('idle'); setRemainingMs(null); setSession(null); setError(null); }
  }, []);

  const start = useCallback(async (mode: 'inline' | 'panel' = 'inline') => { if (!run.current) await begin(mode); }, [begin]);
  // Navigation, read-only transition and unmount release the microphone and drop later events.
  useEffect(() => {
    mounted.current = true;
    return () => {
      const r = run.current;
      generationRef.current++;
      if (r) release(r, true);
    };
  }, [agentId]);
  useEffect(() => { if (readOnly) cancel(); }, [readOnly, cancel]);
  useEffect(() => {
    // A previous agentId cleanup reset state only for the old run; show the new chat as idle.
    setState('idle'); setError(null); setRemainingMs(null); setSession(null);
  }, [agentId]);
  useEffect(() => {
    const leave = () => cancel();
    window.addEventListener('pagehide', leave);
    return () => { window.removeEventListener('pagehide', leave); mounted.current = false; };
  }, [cancel]);

  return { support, state, error, remainingMs, elapsedMs: session?.persistent ? elapsed : null, session, generation, start, setMuted, settle, finish, cancel };
}
