import { describe, expect, it } from 'vitest';
import {
  FRAME_HEADER_BYTES, MAX_FRAME_BYTES, VOICE_PROCESSOR, createPcmFramer, createResampler, encodeFrame, floatToPcm16,
  frameBounds, voiceCaptureSupport, voiceWorkletSource,
} from '../lib/voiceCapture';

const tone = (rate: number, hz: number, seconds: number, amp = 0.5) =>
  Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => amp * Math.sin(2 * Math.PI * hz * i / rate));
const rms = (x: ArrayLike<number>, from = 0, to = x.length) => {
  let s = 0; for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, to - from));
};
const concat = (parts: Float32Array[]) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
/** Resample `input` in chunks of the given sizes (cycled), then flush. */
const resample = (input: Float32Array, inRate: number, outRate: number, chunks: number[]) => {
  const r = createResampler(inRate, outRate);
  const parts: Float32Array[] = [];
  for (let at = 0, k = 0; at < input.length; k++) {
    const size = chunks[k % chunks.length];
    parts.push(r.process(input.subarray(at, at + size)));
    at += size;
  }
  parts.push(r.flush());
  return concat(parts);
};
/** Correlation with a reference sine at `hz`, giving amplitude regardless of phase. */
const amplitudeAt = (x: Float32Array, rate: number, hz: number, from: number, to: number) => {
  let c = 0, s = 0;
  for (let i = from; i < to; i++) { c += x[i] * Math.cos(2 * Math.PI * hz * i / rate); s += x[i] * Math.sin(2 * Math.PI * hz * i / rate); }
  return 2 * Math.hypot(c, s) / (to - from);
};

describe('voice capture support preflight', () => {
  const full = { isSecureContext: true, mediaDevices: { getUserMedia() {} }, AudioContext: class { audioWorklet = {}; }, AudioWorkletNode: class {}, WebSocket: class {} };
  // `audioWorklet` must be visible on the prototype, as in browsers.
  Object.defineProperty(full.AudioContext.prototype, 'audioWorklet', { get() { return {}; } });

  it('reports an insecure context before anything else', () => {
    expect(voiceCaptureSupport({ ...full, isSecureContext: false })).toEqual({ ok: false, reason: 'insecure', message: 'Microphone requires HTTPS or localhost.' });
    expect(voiceCaptureSupport({})).toMatchObject({ reason: 'insecure' });
  });
  it('reports missing getUserMedia, AudioWorklet or WebSocket as unsupported', () => {
    expect(voiceCaptureSupport({ ...full, mediaDevices: undefined })).toMatchObject({ reason: 'unsupported', message: 'Browser does not support audio capture.' });
    expect(voiceCaptureSupport({ ...full, AudioWorkletNode: undefined })).toMatchObject({ reason: 'unsupported' });
    expect(voiceCaptureSupport({ ...full, AudioContext: class {} })).toMatchObject({ reason: 'unsupported' });
    expect(voiceCaptureSupport({ ...full, WebSocket: undefined })).toMatchObject({ reason: 'unsupported' });
    expect(voiceCaptureSupport(full)).toEqual({ ok: true });
  });
});

describe('frame bounds and encoding', () => {
  it('matches the server 20–100 ms and 16 KiB limits', () => {
    expect(frameBounds(24000)).toEqual({ min: 480, max: 2400, target: 960 });
    expect(frameBounds(16000)).toEqual({ min: 320, max: 1600, target: 640 });
    // At high rates 100 ms would exceed one 16 KiB message: the byte ceiling wins.
    const high = frameBounds(96000);
    expect(high.max).toBe((MAX_FRAME_BYTES - FRAME_HEADER_BYTES) / 2);
    expect(FRAME_HEADER_BYTES + high.max * 2).toBeLessThanOrEqual(MAX_FRAME_BYTES);
    expect(high.target).toBeLessThanOrEqual(high.max);
    for (const bad of [0, 7999, 24000.5, NaN, 400000]) expect(() => frameBounds(bad)).toThrow(RangeError);
  });

  it('prefixes a uint32 LE sequence before PCM16 LE samples', () => {
    const frame = new DataView(encodeFrame(0x01020304, Int16Array.from([1, -2, 32767, -32768])));
    expect(frame.byteLength).toBe(12);
    expect(frame.getUint32(0, true)).toBe(0x01020304);
    expect([2, 4, 6, 8].map(o => frame.getInt16(2 + o, true))).toEqual([1, -2, 32767, -32768]);
    expect(new Uint8Array(frame.buffer, 0, 4)).toEqual(Uint8Array.from([4, 3, 2, 1]));
    expect(() => encodeFrame(-1, new Int16Array(1))).toThrow(RangeError);
  });

  it('converts floats to PCM16 with clamping and full range', () => {
    expect(Array.from(floatToPcm16(Float32Array.from([0, 1, -1, 2, -2, 0.5, -0.5, NaN])))).toEqual([0, 32767, -32768, 32767, -32768, 16384, -16384, 0]);
  });

  it('frames a continuous stream into exact sizes and pads only the final remainder', () => {
    const framer = createPcmFramer(960, 480);
    const seen: Int16Array[] = [];
    let next = 0;
    for (const size of [128, 1000, 7, 2000, 365]) {
      seen.push(...framer.push(Int16Array.from({ length: size }, () => next++ % 30000)));
    }
    expect(seen.map(f => f.length)).toEqual([960, 960, 960]);
    expect(Array.from(seen.flatMap(f => Array.from(f)))).toEqual(Array.from({ length: 2880 }, (_, i) => i % 30000));
    const tail = framer.flush()!;
    expect(tail.length).toBe(620); // 3500 - 2880 pending samples, already above the 480 minimum
    expect(tail.at(-1)).toBe(3499);
    expect(framer.flush()).toBeNull();
    const short = createPcmFramer(960, 480);
    short.push(Int16Array.from([7, 8, 9]));
    expect(Array.from(short.flush()!.slice(0, 4))).toEqual([7, 8, 9, 0]);
  });
});

describe('continuous resampler', () => {
  it('produces the expected length for 48 kHz, 44.1 kHz and 16 kHz inputs to 24 kHz', () => {
    for (const rate of [48000, 44100, 16000, 24000]) {
      const out = resample(tone(rate, 440, 1), rate, 24000, [128]);
      expect(Math.abs(out.length - 24000)).toBeLessThanOrEqual(1);
    }
  });

  it('is independent of chunk boundaries (no clicks or drift between worklet blocks)', () => {
    const input = tone(44100, 1000, 0.5);
    const whole = resample(input, 44100, 24000, [input.length]);
    const blocks = resample(input, 44100, 24000, [128, 7, 333, 1, 2048]);
    expect(blocks.length).toBe(whole.length);
    let max = 0; for (let i = 0; i < whole.length; i++) max = Math.max(max, Math.abs(whole[i] - blocks[i]));
    expect(max).toBeLessThan(1e-6);
  });

  it('preserves an in-band tone in amplitude and frequency', () => {
    for (const rate of [48000, 44100]) {
      const out = resample(tone(rate, 1000, 1), rate, 24000, [128]);
      // Ignore filter edges.
      expect(amplitudeAt(out, 24000, 1000, 2400, 21600)).toBeGreaterThan(0.49);
      expect(amplitudeAt(out, 24000, 1000, 2400, 21600)).toBeLessThan(0.51);
      expect(amplitudeAt(out, 24000, 1100, 2400, 21600)).toBeLessThan(0.01);
    }
  });

  it('suppresses content above the output Nyquist instead of aliasing it', () => {
    // 18 kHz at 48 kHz would alias to 6 kHz at 24 kHz without a low-pass filter.
    const out = resample(tone(48000, 18000, 1), 48000, 24000, [128]);
    expect(rms(out, 2400, 21600)).toBeLessThan(0.005);
    expect(amplitudeAt(out, 24000, 6000, 2400, 21600)).toBeLessThan(0.005);
  });

  it('upsamples 16 kHz without losing the tone', () => {
    const out = resample(tone(16000, 1000, 1), 16000, 24000, [128]);
    expect(amplitudeAt(out, 24000, 1000, 2400, 21600)).toBeGreaterThan(0.49);
  });

  it('keeps silence silent and DC level', () => {
    const silent = resample(new Float32Array(48000), 48000, 24000, [128]);
    expect(rms(silent)).toBe(0);
    const dc = resample(new Float32Array(48000).fill(0.25), 48000, 24000, [128]);
    expect(Math.abs(dc[12000] - 0.25)).toBeLessThan(1e-4);
  });
});

describe('AudioWorklet module', () => {
  /** Evaluate the real worklet source with the AudioWorkletGlobalScope surface it uses. */
  function loadProcessor(sampleRate: number) {
    let Processor: new () => { port: { onmessage: ((e: { data: unknown }) => void) | null; postMessage: (m: unknown) => void }; process: (i: Float32Array[][]) => boolean } = null!;
    const posted: { type: string; pcm?: ArrayBuffer }[] = [];
    class AudioWorkletProcessor { port = { onmessage: null, postMessage: (m: { type: string; pcm?: ArrayBuffer }) => posted.push(m) }; }
    const registerProcessor = (name: string, ctor: typeof Processor) => { expect(name).toBe(VOICE_PROCESSOR); Processor = ctor; };
    new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', 'currentTime', voiceWorkletSource())(AudioWorkletProcessor, registerProcessor, sampleRate, 0);
    return { processor: new Processor(), posted };
  }

  it('stays silent until configured, then emits fixed PCM16 frames of the announced rate', () => {
    const { processor, posted } = loadProcessor(48000);
    const input = tone(48000, 1000, 1);
    const block = (i: number) => [[input.subarray(i * 128, i * 128 + 128)]];
    expect(processor.process(block(0))).toBe(true);
    expect(posted).toEqual([]);
    processor.port.onmessage!({ data: { type: 'configure', sampleRate: 24000, frameSamples: 960, minSamples: 480 } });
    for (let i = 0; i < 375; i++) processor.process(block(i)); // exactly 1 s of 48 kHz
    processor.port.onmessage!({ data: { type: 'flush' } });
    expect(posted.at(-1)).toEqual({ type: 'flushed' });
    const frames = posted.filter(m => m.type === 'frame').map(m => new Int16Array(m.pcm!));
    expect(frames.slice(0, -1).every(f => f.length === 960)).toBe(true);
    expect(frames.at(-1)!.length).toBeGreaterThanOrEqual(480);
    expect(frames.at(-1)!.length).toBeLessThanOrEqual(960);
    const total = frames.reduce((n, f) => n + f.length, 0);
    expect(total).toBeGreaterThanOrEqual(24000);
    const pcm = Float32Array.from(frames.flatMap(f => Array.from(f)), v => v / 32768);
    expect(amplitudeAt(pcm, 24000, 1000, 2400, 21600)).toBeGreaterThan(0.49);
  });

  it('drains pre-mute samples, ignores even nonzero muted input, and clocks silence with no input', () => {
    const { processor, posted } = loadProcessor(48000);
    const command = (data: object) => processor.port.onmessage!({ data });
    const block = (value: number) => [[new Float32Array(128).fill(value)]];
    command({ type: 'configure', sampleRate: 24000, frameSamples: 960, minSamples: 480 });
    for (let i = 0; i < 4; i++) processor.process(block(0.25));
    expect(posted).toHaveLength(0);
    command({ type: 'gate', muted: true, epoch: 1, cut: 1 });
    const frames = () => posted.filter(m => m.pcm).map(m => new Int16Array(m.pcm!));
    expect(frames()[0]).toHaveLength(480);
    expect(frames()[0].some(v => v > 7000)).toBe(true);
    for (let i = 0; i < 40; i++) processor.process(i < 20 ? block(-1) : [[]]);
    command({ type: 'gate', muted: false, epoch: 2, cut: 1 });
    const silence = frames().slice(1);
    expect(silence.length).toBeGreaterThanOrEqual(3);
    expect(silence.every(f => f.every(v => v === 0))).toBe(true);
    for (let i = 0; i < 20; i++) processor.process(block(0.1));
    const fresh = frames().at(-1)!;
    expect(fresh[300]).toBeGreaterThan(3000);
    expect(fresh.every(v => Math.abs(v) < 4000)).toBe(true);
  });

  it('zeros the entire pending tail when a render quantum overtakes a delayed mute command', () => {
    const { processor, posted } = loadProcessor(48000);
    const command = (data: object) => processor.port.onmessage!({ data });
    command({ type: 'configure', sampleRate: 24000, frameSamples: 960, minSamples: 480 });
    processor.process([[new Float32Array(128).fill(-1)]]);
    command({ type: 'gate', muted: true, epoch: 1, cut: 0 });
    const tail = posted.find(m => m.pcm);
    expect(tail).toBeDefined();
    expect(new Int16Array(tail!.pcm!).every(v => v === 0)).toBe(true);
  });

  it('mixes stereo to mono and stops after stop', () => {
    const { processor, posted } = loadProcessor(24000);
    processor.port.onmessage!({ data: { type: 'configure', sampleRate: 24000, frameSamples: 480, minSamples: 480 } });
    const left = new Float32Array(128).fill(0.5), right = new Float32Array(128).fill(-0.5);
    for (let i = 0; i < 20; i++) processor.process([[left, right]]);
    const frames = posted.filter(m => m.type === 'frame').map(m => new Int16Array(m.pcm!));
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every(f => f.every(v => v === 0))).toBe(true);
    processor.port.onmessage!({ data: { type: 'stop' } });
    expect(processor.process([[left]])).toBe(false);
  });
});
