/**
 * Browser-side audio pipeline for live dictation over `/voice/session`.
 *
 * Wire contract (see `src/$ws_voice_session.ts`): text JSON `start`/`finish`/`cancel`; binary frames are a
 * zero-based uint32 LE sequence followed by 20–100 ms of mono PCM16 LE at the `ready.sampleRate`, at most
 * 16 KiB per message. `createResampler`, `floatToPcm16` and `createPcmFramer` are self-contained on purpose:
 * `voiceWorkletSource` serializes them into the AudioWorklet module, so they must not reference anything
 * outside their own bodies (other than standard globals).
 */

export const VOICE_SOCKET_PATH = '/voice/session';
export const VOICE_PROCESSOR = 'mauzcode-voice-capture';
/** Server ceilings: one binary message and its sequence header. */
export const MAX_FRAME_BYTES = 16 * 1024;
export const FRAME_HEADER_BYTES = 4;
/** Server-enforced session length; the client only displays the remaining time. */
export const VOICE_SESSION_MS = 5 * 60_000;

export type VoiceSupport =
  | { ok: true }
  | { ok: false; reason: 'insecure' | 'unsupported'; message: string };

/** The browser surface capture needs; `isSecureContext` is checked first so HTTP never touches the others. */
export type VoiceSupportEnv = {
  isSecureContext?: boolean;
  mediaDevices?: { getUserMedia?: unknown } | null;
  AudioContext?: unknown;
  AudioWorkletNode?: unknown;
  WebSocket?: unknown;
};

/** Side-effect free capability preflight: reads properties only, never requests the microphone or opens a socket. */
export function voiceCaptureSupport(env: VoiceSupportEnv): VoiceSupport {
  if (env.isSecureContext !== true) return { ok: false, reason: 'insecure', message: 'Microphone requires HTTPS or localhost.' };
  const prototype: unknown = typeof env.AudioContext === 'function' ? (env.AudioContext as { prototype?: unknown }).prototype : undefined;
  if (typeof env.mediaDevices?.getUserMedia !== 'function' || typeof env.AudioWorkletNode !== 'function' ||
    typeof env.WebSocket !== 'function' || typeof prototype !== 'object' || !prototype || !('audioWorklet' in prototype)) {
    return { ok: false, reason: 'unsupported', message: 'Browser does not support audio capture.' };
  }
  return { ok: true };
}

/** Frame sizes in samples accepted by the server for one rate; `target` is 40 ms. */
export function frameBounds(sampleRate: number): { min: number; max: number; target: number } {
  if (!Number.isSafeInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new RangeError('Unsupported voice sample rate');
  const min = Math.ceil(sampleRate * 0.02);
  const max = Math.min(Math.floor(sampleRate * 0.1), Math.floor((MAX_FRAME_BYTES - FRAME_HEADER_BYTES) / 2));
  if (min > max) throw new RangeError('Unsupported voice sample rate');
  return { min, max, target: Math.min(max, Math.max(min, Math.round(sampleRate * 0.04))) };
}

/** One binary message: uint32 LE sequence, then PCM16 LE samples. */
export function encodeFrame(sequence: number, pcm: Int16Array): ArrayBuffer {
  if (!Number.isInteger(sequence) || sequence < 0 || sequence > 0xffffffff) throw new RangeError('Voice frame sequence out of range');
  const buffer = new ArrayBuffer(FRAME_HEADER_BYTES + pcm.length * 2);
  const view = new DataView(buffer);
  view.setUint32(0, sequence, true);
  for (let i = 0; i < pcm.length; i++) view.setInt16(FRAME_HEADER_BYTES + i * 2, pcm[i], true);
  return buffer;
}

/** Clamp to [-1, 1] and round to the full asymmetric PCM16 range. */
export function floatToPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    const s = v !== v ? 0 : v > 1 ? 1 : v < -1 ? -1 : v;
    out[i] = Math.round(s < 0 ? s * 32768 : s * 32767);
  }
  return out;
}

/**
 * Continuous band-limited resampler (Blackman-windowed sinc, per-output normalized weights).
 * State carries across `process` calls, so chunk boundaries add no clicks or drift: output k is always taken at
 * input time `k * inRate / outRate`. When downsampling the cutoff follows the output Nyquist to suppress aliasing.
 * `flush` emits the tail held back for the filter's look-ahead; the resampler is then reset.
 */
export function createResampler(inRate: number, outRate: number, taps = 16) {
  if (!(inRate > 0) || !(outRate > 0) || !isFinite(inRate) || !isFinite(outRate)) throw new RangeError('Invalid resampler rates');
  const fc = Math.min(1, outRate / inRate) * 0.92;
  const half = Math.ceil(taps / fc);
  let buffer = new Float32Array(0);
  let offset = 0; // absolute index of buffer[0], minus the leading `half` zeros
  let produced = 0;
  let consumed = 0;
  const reset = () => { buffer = new Float32Array(half); offset = -half; produced = 0; consumed = 0; };
  reset();
  const kernel = (x: number) => {
    if (x <= -half || x >= half) return 0;
    const w = 0.42 + 0.5 * Math.cos(Math.PI * x / half) + 0.08 * Math.cos(2 * Math.PI * x / half);
    if (x === 0) return w;
    const a = Math.PI * fc * x;
    return w * Math.sin(a) / a;
  };
  // Rational ratios revisit the same fractional phases; cache their normalized weights (bounded).
  const phases = new Map<number, { taps: Float64Array; weight: number }>();
  const weights = (frac: number) => {
    let entry = phases.get(frac);
    if (!entry) {
      const tapsAt = new Float64Array(2 * half);
      let weight = 0;
      for (let j = 0; j < 2 * half; j++) { tapsAt[j] = kernel(frac + half - 1 - j); weight += tapsAt[j]; }
      entry = { taps: tapsAt, weight };
      if (phases.size < 1024) phases.set(frac, entry);
    }
    return entry;
  };
  const run = (input: Float32Array, final: boolean): Float32Array => {
    const end = consumed; // real samples before any flush padding
    const joined = new Float32Array(buffer.length + input.length);
    joined.set(buffer); joined.set(input, buffer.length);
    buffer = joined;
    if (!final) consumed += input.length;
    const out: number[] = [];
    for (;;) {
      const t = produced * inRate / outRate; // absolute input time
      if (final ? t >= end : t + half >= offset + buffer.length) break;
      const base = Math.floor(t);
      const { taps: tapsAt, weight } = weights(t - base);
      let sum = 0;
      for (let j = 0, n = base - half + 1; j < 2 * half; j++, n++) {
        const i = n - offset;
        if (i >= 0 && i < buffer.length) sum += buffer[i] * tapsAt[j];
      }
      out.push(weight ? sum / weight : 0);
      produced++;
    }
    const keep = Math.floor(produced * inRate / outRate) - half + 1 - offset;
    if (keep > 0) { buffer = buffer.slice(keep); offset += keep; }
    return Float32Array.from(out);
  };
  return {
    process: (input: Float32Array) => run(input, false),
    flush: () => {
      const tail = run(new Float32Array(half + 1), true);
      reset();
      return tail;
    },
  };
}

/**
 * Split a continuous PCM16 stream into fixed `frameSamples` frames. `flush` returns the remainder padded with
 * silence to at least `minSamples`, or null when nothing is pending.
 */
export function createPcmFramer(frameSamples: number, minSamples: number) {
  if (!(frameSamples >= minSamples) || !(minSamples > 0)) throw new RangeError('Invalid frame size');
  let pending = new Int16Array(frameSamples);
  let fill = 0;
  return {
    push(samples: Int16Array): Int16Array[] {
      const frames: Int16Array[] = [];
      let at = 0;
      while (at < samples.length) {
        const take = Math.min(frameSamples - fill, samples.length - at);
        pending.set(samples.subarray(at, at + take), fill);
        fill += take; at += take;
        if (fill === frameSamples) { frames.push(pending); pending = new Int16Array(frameSamples); fill = 0; }
      }
      return frames;
    },
    flush(): Int16Array | null {
      if (!fill) return null;
      const frame = new Int16Array(Math.max(fill, minSamples));
      frame.set(pending.subarray(0, fill));
      pending = new Int16Array(frameSamples); fill = 0;
      return frame;
    },
  };
}

/**
 * Source of the AudioWorklet module. The processor mixes inputs to mono, resamples to the announced rate and posts
 * whole PCM16 frames tagged with the local toggle epoch. A gate drains or silences the pending tail before the
 * microphone track can be enabled again. Muted render quanta supply zeros even without an input channel. `flush`
 * drains the terminal tail and answers `flushed`; `stop` ends processing.
 */
export function voiceWorkletSource(): string {
  return `const createResampler = ${createResampler.toString()};
const floatToPcm16 = ${floatToPcm16.toString()};
const createPcmFramer = ${createPcmFramer.toString()};
class VoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.resampler = null; this.framer = null; this.stopped = false; this.muted = false; this.epoch = 0; this.inputEnd = 0;
    this.port.onmessage = event => {
      const m = event.data || {};
      if (m.type === 'configure') {
        this.resampler = createResampler(sampleRate, m.sampleRate);
        this.framer = createPcmFramer(m.frameSamples, m.minSamples);
      } else if (m.type === 'gate' && this.resampler && m.epoch > this.epoch) {
        // A render quantum may have overtaken the main-thread mute. Discard an ambiguous
        // partial buffer rather than draining microphone samples beyond the requested cut.
        const safe = this.muted || this.inputEnd <= m.cut;
        this.epoch = m.epoch;
        this.drain(safe, true);
        this.muted = m.muted;
        this.port.postMessage({ type: 'gated', epoch: this.epoch });
      } else if (m.type === 'flush') {
        this.drain(true, false);
        this.resampler = null; this.framer = null;
        this.port.postMessage({ type: 'flushed' });
      } else if (m.type === 'stop') {
        this.stopped = true; this.resampler = null; this.framer = null;
      }
    };
  }
  drain(safe, boundary) {
    if (!this.resampler || !this.framer) return;
    for (const frame of this.framer.push(floatToPcm16(this.resampler.flush()))) {
      if (!safe) frame.fill(0);
      this.post(frame, boundary);
    }
    const last = this.framer.flush();
    if (last) { if (!safe) last.fill(0); this.post(last, boundary); }
  }
  post(frame, boundary = false) {
    this.port.postMessage({ type: 'frame', epoch: this.epoch, inputEnd: this.inputEnd, boundary, pcm: frame.buffer }, [frame.buffer]);
  }
  process(inputs, outputs) {
    if (this.stopped) return false;
    if (!this.resampler || !this.framer) return true;
    const channels = inputs[0];
    const length = this.muted ? (outputs?.[0]?.[0]?.length ?? 128) : channels?.[0]?.length;
    if (!length) return true;
    const mono = new Float32Array(length);
    if (!this.muted) {
      this.inputEnd = currentTime + length / sampleRate;
      for (const channel of channels) for (let i = 0; i < length; i++) mono[i] += channel[i] / channels.length;
    }
    for (const frame of this.framer.push(floatToPcm16(this.resampler.process(mono)))) this.post(frame);
    return true;
  }
}
registerProcessor(${JSON.stringify(VOICE_PROCESSOR)}, VoiceCaptureProcessor);
`;
}
