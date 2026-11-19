import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VoiceDestination } from '../lib/voice';
import {
  VOICE_PROCESSOR, VOICE_SESSION_MS, VOICE_SOCKET_PATH, encodeFrame, frameBounds, voiceCaptureSupport, voiceWorkletSource,
  type VoiceSupport,
} from '../lib/voiceCapture';

export type VoiceCaptureState = 'idle' | 'connecting' | 'listening' | 'finalizing' | 'paused' | 'error';
export type VoiceErrorCode =
  | 'unauthorized' | 'readOnly' | 'superseded' | 'unconfigured' | 'routeUnavailable' | 'providerAuth' | 'provider'
  | 'timeout' | 'backpressure' | 'protocol' | 'permission' | 'microphone' | 'connection';
export type VoiceCaptureError = { code: VoiceErrorCode; message: string };
/** Phrase events of the session that produced them; never delivered after cancel, navigation or a newer start. */
export type VoicePhraseEvent =
  | { type: 'phrase'; generation: number; id: string; order: number; revision: number; text: string; final: boolean }
  | { type: 'phraseFailed'; generation: number; id: string; order: number; reason: string };
export type VoiceSessionInfo = { sessionId: string; route: string; destination: VoiceDestination; sampleRate: number };

export type UseVoiceCaptureOptions = {
  agentId: string;
  /** A read-only or archived chat never captures; becoming read-only cancels an active session. */
  readOnly?: boolean;
  onPhrase?: (event: VoicePhraseEvent) => void;
};

export type VoiceCapture = {
  /** Synchronous capability preflight; when not ok, `start` does nothing and no microphone or socket is touched. */
  support: VoiceSupport;
  state: VoiceCaptureState;
  error: VoiceCaptureError | null;
  /** Server-limit countdown of the current session in ms, or null outside a listening session. */
  remainingMs: number | null;
  session: VoiceSessionInfo | null;
  generation: number;
  start: () => Promise<void>;
  /** Stop audio, finalize pending phrases, release the microphone and stay paused. */
  pause: () => Promise<boolean>;
  resume: () => Promise<void>;
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

type Run = {
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
  sequence: number;
  timers: ReturnType<typeof setTimeout>[];
  ticker?: ReturnType<typeof setInterval>;
  settle?: (ok: boolean) => void;
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
 * `/voice/session` WebSocket per generation. Nothing happens on mount; only `start`/`resume` request the microphone.
 */
export function useVoiceCapture({ agentId, readOnly = false, onPhrase }: UseVoiceCaptureOptions): VoiceCapture {
  const support = useMemo(() => voiceCaptureSupport(browserEnv()), []);
  const [state, setState] = useState<VoiceCaptureState>('idle');
  const [error, setError] = useState<VoiceCaptureError | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [session, setSession] = useState<VoiceSessionInfo | null>(null);
  const [generation, setGeneration] = useState(0);
  const generationRef = useRef(0);
  const run = useRef<Run | null>(null);
  const mounted = useRef(true);
  const phrase = useRef(onPhrase); phrase.current = onPhrase;
  const target = useRef({ agentId, readOnly }); target.current = { agentId, readOnly };

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
    releaseAudio(r);
    revokeUrl(r);
    r.timers.forEach(clearTimeout); r.timers = []; r.startTimer = undefined;
    clearInterval(r.ticker);
    const ws = r.socket;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try {
        if (cancel && ws.readyState === 1) ws.send(JSON.stringify({ type: 'cancel' }));
        if (ws.readyState === 1 || ws.readyState === 0) ws.close(1000);
      } catch { /* already closed */ }
    }
    r.socket = undefined;
    if (run.current === r) run.current = null;
    const settle = r.settle; r.settle = undefined;
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
    ws.send(encodeFrame(r.sequence++, new Int16Array(pcm)));
  };

  const onServer = (r: Run, data: unknown) => {
    if (!current(r) || typeof data !== 'string') return;
    let message: Record<string, unknown>;
    try { message = JSON.parse(data) as Record<string, unknown>; } catch { return fail(r, { code: 'protocol', message: MESSAGES.protocol }); }
    if (!message || typeof message !== 'object') return;
    switch (message.type) {
      case 'ready': {
        if (r.ready || !r.node) return;
        const sampleRate = Number(message.sampleRate);
        let bounds: ReturnType<typeof frameBounds>;
        try { bounds = frameBounds(sampleRate); } catch { return fail(r, { code: 'protocol', message: MESSAGES.protocol }); }
        r.ready = true; r.sending = true;
        clearTimeout(r.startTimer); r.startTimer = undefined;
        r.node.port.postMessage({ type: 'configure', sampleRate, frameSamples: bounds.target, minSamples: bounds.min });
        const deadline = Date.now() + VOICE_SESSION_MS;
        setRemainingMs(VOICE_SESSION_MS);
        r.ticker = setInterval(() => { if (current(r)) setRemainingMs(Math.max(0, deadline - Date.now())); }, 1000);
        setSession({ sessionId: String(message.sessionId ?? ''), route: String(message.route ?? ''), destination: message.destination as VoiceDestination, sampleRate });
        setState('listening');
        return;
      }
      case 'phrase':
        if (typeof message.id === 'string' && typeof message.text === 'string' && typeof message.order === 'number' && typeof message.revision === 'number') {
          phrase.current?.({ type: 'phrase', generation: r.generation, id: message.id, order: message.order, revision: message.revision, text: message.text, final: message.final === true });
        }
        return;
      case 'phraseFailed':
        if (typeof message.id === 'string' && typeof message.order === 'number') {
          phrase.current?.({ type: 'phraseFailed', generation: r.generation, id: message.id, order: message.order, reason: String(message.reason ?? '') });
        }
        return;
      case 'completed': {
        const settle = r.settle;
        release(r, false, true);
        if (!settle) { setState('idle'); setRemainingMs(null); }
        return;
      }
      case 'error': {
        const code = typeof message.code === 'string' && SERVER_CODES.has(message.code) ? message.code as VoiceErrorCode : 'provider';
        return fail(r, { code, message: typeof message.message === 'string' && message.message ? message.message : MESSAGES[code] });
      }
    }
  };

  const begin = useCallback(async () => {
    if (!support.ok || target.current.readOnly || !target.current.agentId) return;
    if (run.current) return;
    const g = ++generationRef.current;
    const r: Run = { generation: g, ready: false, sending: false, sequence: 0, timers: [], released: false };
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
        const data = event.data as { type?: string; pcm?: ArrayBuffer };
        if (data?.type === 'frame' && data.pcm) sendFrame(r, data.pcm);
        else if (data?.type === 'flushed') { r.flushed?.(); r.flushed = undefined; }
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
        try { ws.send(JSON.stringify({ type: 'start', agentId: target.current.agentId, generation: g })); }
        catch { fail(r, { code: 'connection', message: MESSAGES.connection }); }
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

  const end = useCallback(async (after: 'idle' | 'paused'): Promise<boolean> => {
    const r = run.current;
    if (!r || r.released) return false;
    if (!r.ready || !r.socket || r.socket.readyState !== 1) {
      // Nothing was streamed yet: there is nothing to finalize.
      release(r, true);
      setState(after); setRemainingMs(null); setSession(null);
      return after === 'paused';
    }
    if (r.settle) return new Promise(resolve => { const prior = r.settle!; r.settle = ok => { prior(ok); resolve(ok); }; });
    setState('finalizing');
    const done = new Promise<boolean>(resolve => { r.settle = resolve; });
    // Drain resampler/framer tails before telling the server to finish; the server ignores audio after finish.
    if (r.node) {
      await new Promise<void>(resolve => {
        r.flushed = resolve;
        r.timers.push(setTimeout(resolve, FLUSH_TIMEOUT_MS));
        r.node!.port.postMessage({ type: 'flush' });
      });
    }
    releaseAudio(r);
    if (r.released) return done;
    clearInterval(r.ticker);
    r.timers.push(setTimeout(() => fail(r, { code: 'timeout', message: 'Voice finalization timed out.' }), FINISH_TIMEOUT_MS));
    try { r.socket?.send(JSON.stringify({ type: 'finish' })); } catch { fail(r, { code: 'connection', message: MESSAGES.connection }); }
    const ok = await done;
    if (ok && mounted.current && generationRef.current === r.generation) { setState(after); setRemainingMs(null); }
    return ok;
  }, []);

  const cancel = useCallback(() => {
    const r = run.current;
    generationRef.current++;
    if (r) release(r, true);
    if (mounted.current) { setState('idle'); setRemainingMs(null); setSession(null); setError(null); }
  }, []);

  const start = useCallback(async () => { if (!run.current) await begin(); }, [begin]);
  const resume = useCallback(async () => { if (!run.current) await begin(); }, [begin]);
  const pause = useCallback(() => end('paused'), [end]);
  const finish = useCallback(() => end('idle'), [end]);

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

  return { support, state, error, remainingMs, session, generation, start, pause, resume, finish, cancel };
}
