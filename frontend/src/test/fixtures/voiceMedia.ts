import { vi } from 'vitest';
import { voiceWorkletSource } from '../../lib/voiceCapture';

/* Synthetic browser surface: tracks, AudioContext + AudioWorklet (running the real worklet source), WebSocket. */

class FakeTrack {
  enabled = true;
  stopped = false;
  readyState: 'live' | 'ended' = 'live';
  onended: (() => void) | null = null;
  stop() { this.stopped = true; this.readyState = 'ended'; }
  /** The device went away (unplugged, revoked): the browser ends the track and fires `ended`. */
  end() { this.readyState = 'ended'; this.onended?.(); }
}
class FakeStream { tracks = [new FakeTrack()]; getTracks() { return this.tracks; } }

type Processor = { port: { onmessage: ((e: { data: unknown }) => void) | null; postMessage: (m: unknown) => void }; process: (i: Float32Array[][]) => boolean };
let contexts: FakeAudioContext[] = [];
let nodes: FakeNode[] = [];
let sockets: FakeSocket[] = [];
let streams: FakeStream[] = [];

class FakeAudioContext {
  sampleRate = 48000;
  currentTime = 0;
  state: 'running' | 'suspended' | 'closed' = 'running';
  destination = {};
  processor?: typeof Object;
  closed = false;
  modules: string[] = [];
  audioWorklet = {
    addModule: async (url: string) => {
      this.modules.push(url);
      // Run the exact module source the hook serialized, as AudioWorkletGlobalScope would.
      new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', 'clock', voiceWorkletSource().replace(/\bcurrentTime\b/g, 'clock.currentTime'))(
        class { port = { onmessage: null, postMessage: () => undefined }; },
        (_name: string, ctor: typeof Object) => { this.processor = ctor; },
        this.sampleRate, this,
      );
    },
  };
  constructor() { contexts.push(this); }
  createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() }; }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; this.closed = true; }
}
Object.defineProperty(FakeAudioContext.prototype, 'audioWorklet', { configurable: true, get() { return undefined; } });

class FakeNode {
  processor: Processor;
  disconnected = false;
  onprocessorerror: (() => void) | null = null;
  port: { onmessage: ((e: MessageEvent) => void) | null; postMessage: (m: unknown) => void };
  constructor(private context: FakeAudioContext) {
    this.processor = new (context.processor as unknown as new () => Processor)();
    // Bridge both ends of the MessagePort synchronously.
    this.processor.port.postMessage = (m: unknown) => this.port.onmessage?.({ data: m } as MessageEvent);
    this.port = { onmessage: null, postMessage: (m: unknown) => this.processor.port.onmessage?.({ data: m }) };
    nodes.push(this);
  }
  connect() {}
  disconnect() { this.disconnected = true; }
  /** Feed `ms` of a 1 kHz tone through `process` in 128-sample render quanta. */
  feed(ms: number, rate = 48000) {
    for (let i = 0; i < Math.round(rate * ms / 1000 / 128); i++) {
      this.processor.process([[Float32Array.from({ length: 128 }, (_, k) => 0.3 * Math.sin(2 * Math.PI * 1000 * (i * 128 + k) / rate))]]);
      this.context.currentTime += 128 / rate;
    }
  }
}

class FakeSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  readyState = 0;
  binaryType = 'blob';
  bufferedAmount = 0;
  sent: (string | ArrayBuffer)[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) { sockets.push(this); }
  send(data: string | ArrayBuffer) { if (this.readyState !== 1) throw new Error('not open'); this.sent.push(data); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.(); }
  receive(message: object) { this.onmessage?.({ data: JSON.stringify(message) }); }
  drop() { this.readyState = 3; this.onclose?.(); }
  controls() { return this.sent.filter((m): m is string => typeof m === 'string').map(m => JSON.parse(m) as { type: string }); }
  frames() { return this.sent.filter((m): m is ArrayBuffer => typeof m !== 'string').map(b => new DataView(b)); }
}

let getUserMedia: ReturnType<typeof vi.fn>;
const original = { isSecureContext: window.isSecureContext, mediaDevices: navigator.mediaDevices };
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const ready = { type: 'ready', sessionId: 's1', route: 'openai-realtime/work:gpt-live-transcribe', destination: { kind: 'cloud', label: 'OpenAI' }, sampleRate: 24000 };

function install({ secure = true, worklet = true } = {}) {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: secure });
  getUserMedia = vi.fn(async () => { const s = new FakeStream(); streams.push(s); return s; });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('AudioWorkletNode', worklet ? FakeNode : undefined);
  vi.stubGlobal('WebSocket', FakeSocket);
  URL.createObjectURL = vi.fn(() => 'blob:voice-worklet');
  URL.revokeObjectURL = vi.fn();
}

export { FakeAudioContext, FakeSocket, FakeStream, contexts, nodes, sockets, streams, getUserMedia, flush, ready, install };
export function resetMedia() { contexts = []; nodes = []; sockets = []; streams = []; }
export function restoreMedia() {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: original.isSecureContext });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: original.mediaDevices });
}
