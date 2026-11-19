import { describe, expect, test } from "bun:test";
import { concatFrames, pcmChunk } from "./contract/contractRecorder.entry";
import { createSessionFixture, tone } from "./contract/sessionFixture.entry";

// Server-side segmentation is the only place phrase boundaries are decided, so it is tested here on synthetic audio
// with exact byte offsets rather than through a provider. Every assertion is about audio the provider actually
// received: the boundary offsets come from the recorder's call log, so "no byte lost and none repeated" is checked
// against the concatenated appends, not against an internal buffer.

const RATE = 24000;
const BYTES_PER_WINDOW = (RATE * 20) / 1000 * 2; // 960 bytes of PCM16 per 20 ms window

/** Feed frames in order and return the recorder's view of what the provider received. */
async function feed(session: types.voice.VoiceSession, frames: Uint8Array[]): Promise<void> {
    for (const frame of frames) await session.append(frame);
}

function finalPhrases(events: types.voice.SessionEvent[]) {
    return events.filter(event => event.type === "phrase").filter(event => event.final);
}

describe("server-side energy vad", () => {
    test("a pause after speech commits one phrase, and a second phrase after silence commits another", async () => {
        const { ctx, route, recorder } = await createSessionFixture({ providerId: "vad-voice" });
        recorder.autoFinal = (order: number) => `phrase ${order}`;
        const events: types.voice.SessionEvent[] = [];
        const session = await ctx.fns.voice.session.open({ route, onEvent: (event: types.voice.SessionEvent) => events.push(event) });
        const pcm = tone(RATE);
        await feed(session, [
            pcm.speech(10),   // 200 ms of speech
            pcm.silence(30),  // 600 ms of silence: past the ~500 ms threshold
            pcm.speech(10),
            pcm.silence(30),
        ]);
        expect(recorder.commits).toEqual([0, 1]);
        const result = await session.finish();
        expect(result.ok).toBe(true);
        const finals = finalPhrases(events);
        expect(finals.map(entry => entry.order)).toEqual([0, 1]);
        expect(finals.map(entry => entry.text)).toEqual(["phrase 0", "phrase 1"]);
    });

    test("silence alone is never committed, and finish does not fabricate a phrase", async () => {
        const { ctx, route, recorder } = await createSessionFixture({ providerId: "vad-quiet" });
        const events: types.voice.SessionEvent[] = [];
        const session = await ctx.fns.voice.session.open({ route, onEvent: (event: types.voice.SessionEvent) => events.push(event) });
        const pcm = tone(RATE);
        // Two full seconds of digital silence: no speech, so nothing may be transcribed or committed.
        await feed(session, [pcm.silence(100)]);
        const result = await session.finish();
        expect(result.ok).toBe(true);
        expect(recorder.commits).toEqual([]);
        expect(recorder.appended).toEqual([]);
        expect(events.filter(event => event.type === "phrase")).toEqual([]);
        expect(events.at(-1)?.type).toBe("completed");
    });

    test("a 20 s monologue splits at the quietest window of the last half second and loses no audio", async () => {
        const { ctx, route, recorder } = await createSessionFixture({ providerId: "vad-long" });
        recorder.autoFinal = (order: number) => `chunk ${order}`;
        const events: types.voice.SessionEvent[] = [];
        const session = await ctx.fns.voice.session.open({ route, onEvent: (event: types.voice.SessionEvent) => events.push(event) });
        // 20 s of continuous speech: 1000 windows. The forced commit looks at the last 25 windows (500 ms); window
        // 725 is deliberately quieter than its neighbours, so a correct split lands there rather than mid-word.
        const quietWindow = 725;
        const frames: Uint8Array[] = [];
        for (let window = 0; window < 1000; window++) {
            frames.push(pcmChunk({ sampleRate: RATE, windows: 1, amplitude: window === quietWindow ? 0.05 : 0.5 }));
        }
        await feed(session, frames);
        const result = await session.finish();
        expect(result.ok).toBe(true);
        // 20 s of continuous speech must be split at least once (force commit at 15 s).
        expect(recorder.commits.length).toBeGreaterThanOrEqual(1);
        expect(recorder.commits).toEqual(recorder.commits.slice().sort((a, b) => a - b));

        // Every byte the user spoke reached the provider exactly once, in order.
        const forwarded = concatFrames(recorder.appended);
        const expected = concatFrames(frames);
        expect(forwarded.byteLength).toBeGreaterThan(0);
        expect(forwarded.byteLength).toBeLessThanOrEqual(expected.byteLength);
        expect(Buffer.from(forwarded).equals(Buffer.from(expected.slice(0, forwarded.byteLength)))).toBe(true);

        // The first boundary sits on the quiet window: the split is placed after it, so it ends the first phrase.
        const boundaries = recorder.boundaries();
        expect(boundaries.length).toBe(recorder.commits.length);
        expect(boundaries[0]).toBe((quietWindow + 1) * BYTES_PER_WINDOW);
        // The boundary is window-aligned, so no window of speech was cut in half.
        expect(boundaries[0]! % BYTES_PER_WINDOW).toBe(0);
        const finals = finalPhrases(events);
        expect(new Set(finals.map(entry => entry.id)).size).toBe(finals.length);
    });

    test("noise-only input at speech energy is treated as speech, so a word is not dropped", async () => {
        const { ctx, route, recorder } = await createSessionFixture({ providerId: "vad-loud" });
        recorder.autoFinal = () => "kept";
        const session = await ctx.fns.voice.session.open({ route, onEvent: () => {} });
        const pcm = tone(RATE);
        // Borders on but does not reach zero: a phrase boundary must still be found after it.
        await feed(session, [pcm.shaped(5, 0.3), pcm.shaped(5, 0.02), pcm.speech(5), pcm.silence(30)]);
        expect(recorder.commits.length).toBe(1);
        await session.cancel();
    });

    test("audio held back for the forced split is forwarded rather than dropped", async () => {
        const { ctx, route, recorder } = await createSessionFixture({ providerId: "vad-hold" });
        recorder.autoFinal = () => "held";
        const session = await ctx.fns.voice.session.open({ route, onEvent: () => {} });
        const pcm = tone(RATE);
        // 3 s of speech: the hold-back is released as it fills, so nothing is lost while the phrase is open.
        const frames = [pcm.speech(150)];
        await feed(session, frames);
        const result = await session.finish();
        expect(result.ok).toBe(true);
        // The flush completed the delivery: exactly the audio that was pushed, no more and no less.
        expect(concatFrames(recorder.appended).byteLength).toBe(concatFrames(frames).byteLength);
        expect(recorder.commits).toEqual([0]);
    });

    test("a provider with its own turn detection receives no pause or forced commits, only the finish commit", async () => {
        const { ctx, route, recorder } = await createSessionFixture({ providerId: "vad-server", turnDetection: "server" });
        const events: types.voice.SessionEvent[] = [];
        const session = await ctx.fns.voice.session.open({ route, onEvent: (event: types.voice.SessionEvent) => events.push(event) });
        expect(session.route.model.capabilities.turnDetection).toBe("server");
        const pcm = tone(RATE);
        const first = pcm.speech(10);
        const pause = pcm.silence(30);
        // A real pause and more than 15 s of speech; neither should trigger a commit from core.
        await feed(session, [first, pause, ...Array.from({ length: 16 }, () => pcm.speech(50))]);
        expect(recorder.commits).toEqual([]);
        expect(await session.commit()).toBeUndefined();
        // A delayed provider boundary covers only the first phrase, even though more audio has been sent.
        recorder.emit({ type: "committed", turnId: "upstream-first", endByte: first.byteLength });
        recorder.emit({ type: "final", turnId: "upstream-first", text: "provider turn one" });
        recorder.autoFinal = () => "finish turn";
        expect(await session.finish()).toEqual({ ok: true });
        expect(await session.finish()).toEqual({ ok: false });
        expect(recorder.commits).toEqual([1]);
        const finals = finalPhrases(events);
        expect(finals.map(entry => entry.order)).toEqual([0, 1]);
        expect(finals.map(entry => entry.text)).toEqual(["provider turn one", "finish turn"]);
        expect(events.filter(event => event.type === "completed")).toHaveLength(1);
    });

    for (const input of ["empty", "silence", "settled-turn"] as const) {
        test(`provider turn detection does not commit on finish: ${input}`, async () => {
            const { ctx, route, recorder } = await createSessionFixture({ providerId: "vad-server-quiet", turnDetection: "server" });
            const session = await ctx.fns.voice.session.open({ route, onEvent: () => {} });
            const pcm = tone(RATE);
            const speech = pcm.speech(10);
            const silence = pcm.silence(30);
            if (input === "settled-turn") await session.append(speech);
            if (input !== "empty") await session.append(silence);
            if (input === "settled-turn") {
                recorder.emit({ type: "committed", turnId: "done", endByte: speech.byteLength });
                recorder.emit({ type: "final", turnId: "done", text: "already committed" });
            }
            expect(await session.finish()).toEqual({ ok: true });
            expect(recorder.commits).toEqual([]);
        });
    }

    test("finish observes a provider boundary from an append still in flight", async () => {
        const speech = tone(RATE).speech(1).slice(0, 400);
        const frame = concatFrames([speech, new Uint8Array(BYTES_PER_WINDOW - speech.byteLength)]);
        const { promise: allowed, resolve } = Promise.withResolvers<void>();
        const { ctx, route, recorder } = await createSessionFixture({
            providerId: "vad-server-queued-boundary",
            turnDetection: "server",
            wrapOpen: async (stream, sink) => ({
                ...stream,
                append: async pcm => {
                    await stream.append(pcm);
                    await allowed;
                    sink.emit({ type: "committed", turnId: "tail", endByte: speech.byteLength });
                    sink.emit({ type: "final", turnId: "tail", text: "already committed" });
                },
            }),
        });
        const events: types.voice.SessionEvent[] = [];
        const session: types.voice.VoiceSession = await ctx.fns.voice.session.open({
            route, onEvent: (event: types.voice.SessionEvent) => events.push(event),
        });
        const push = session.append(frame);
        const finish = session.finish();
        resolve();
        await push;
        expect(await finish).toEqual({ ok: true });
        expect(recorder.commits).toEqual([]);
        expect(events.map(event => event.type)).toEqual(["phrase", "completed"]);
    });

    test("continuous speech keeps splitting at every forced interval, and every boundary is window-aligned", async () => {
        const { ctx, route, recorder } = await createSessionFixture({ providerId: "vad-endless" });
        recorder.autoFinal = (order: number) => `chunk ${order}`;
        const events: types.voice.SessionEvent[] = [];
        const session = await ctx.fns.voice.session.open({ route, onEvent: (event: types.voice.SessionEvent) => events.push(event) });
        // 40 s of unbroken speech: the forced interval (15 s) fires twice, then finish commits the remainder.
        const frames: Uint8Array[] = [];
        for (let window = 0; window < 2000; window++) {
            frames.push(pcmChunk({ sampleRate: RATE, windows: 1, amplitude: 0.5 }));
        }
        await feed(session, frames);
        expect(await session.finish()).toEqual({ ok: true });
        expect(recorder.commits).toEqual([0, 1, 2]);
        const boundaries = recorder.boundaries();
        expect(boundaries).toHaveLength(3);
        expect(boundaries).toEqual(boundaries.slice().sort((a, b) => a - b));
        for (const offset of boundaries) expect(offset % BYTES_PER_WINDOW).toBe(0);
        // The two forced splits are one forced interval apart, minus at most the half-second lookback the split is
        // allowed to reach back into when no window is quieter than another.
        const forced = (15000 / 20) * BYTES_PER_WINDOW;
        const lookback = (500 / 20) * BYTES_PER_WINDOW;
        const gap = boundaries[1]! - boundaries[0]!;
        expect(gap).toBeLessThanOrEqual(forced);
        expect(gap).toBeGreaterThanOrEqual(forced - lookback);
        expect(boundaries[2]).toBe(2000 * BYTES_PER_WINDOW);
        // Unbroken speech is forwarded whole: the hold-back is released, never dropped.
        expect(Buffer.from(concatFrames(recorder.appended)).equals(Buffer.from(concatFrames(frames)))).toBe(true);
        const finals = finalPhrases(events);
        expect(finals.map(entry => entry.order)).toEqual([0, 1, 2]);
    });

    for (const speech of [true, false]) {
        test(`finish classifies an isolated sub-window PCM sample as ${speech ? "speech" : "silence"}`, async () => {
            const { ctx, route, recorder } = await createSessionFixture({ providerId: "vad-single-sample" });
            recorder.autoFinal = () => "short";
            const session = await ctx.fns.voice.session.open({ route, onEvent: () => {} });
            const sample = new Uint8Array([0, speech ? 0x40 : 0]);
            // Split the sample over two pushes: finish must classify the joined little-endian sample.
            await feed(session, [sample.subarray(0, 1), sample.subarray(1)]);
            expect(recorder.appended).toEqual([]);
            expect(await session.finish()).toEqual({ ok: true });
            expect(recorder.appended).toEqual(speech ? [sample] : []);
            expect(recorder.commits).toEqual(speech ? [0] : []);
        });
    }

    test("a partial window smaller than one energy window is still forwarded on finish", async () => {
        const { ctx, route, recorder } = await createSessionFixture({ providerId: "vad-partial" });
        recorder.autoFinal = () => "tail";
        const session = await ctx.fns.voice.session.open({ route, onEvent: () => {} });
        const pcm = tone(RATE);
        const whole = pcm.speech(10);
        // A fragment shorter than one 20 ms window, appended last.
        const fragment = pcm.speech(1).slice(0, 137);
        await feed(session, [whole, fragment]);
        const result = await session.finish();
        expect(result.ok).toBe(true);
        expect(concatFrames(recorder.appended).byteLength).toBe(whole.byteLength + fragment.byteLength);
        expect(recorder.commits).toEqual([0]);
    });
});

describe("session thresholds", () => {
    test("an out-of-range config is clamped instead of rejected", async () => {
        const { ctx } = await createSessionFixture({ providerId: "vad-limits" });
        const limits = ctx.fns.voice.session.limits({
            config: { frameMs: 5000, silenceMs: 1, forceCommitMs: 1, finishTimeoutMs: -1, cancelTimeoutMs: 1e12, speechRms: 99 },
        });
        expect(limits.frameMs).toBe(100);
        expect(limits.silenceMs).toBe(200);
        expect(limits.forceCommitMs).toBe(300);
        expect(limits.finishTimeoutMs).toBe(100);
        expect(limits.cancelTimeoutMs).toBe(120000);
        expect(limits.speechRms).toBe(0.5);
        // The buffered-audio ceiling is fixed so a stalled provider cannot grow memory without bound.
        expect(limits.maxBufferedBytes).toBe(1048576);
    });

    test("the defaults match the documented ~500 ms silence and 15 s forced commit", async () => {
        const { ctx } = await createSessionFixture({ providerId: "vad-defaults" });
        const limits = ctx.fns.voice.session.limits({});
        expect(limits.silenceMs).toBe(500);
        expect(limits.forceCommitMs).toBe(15000);
        expect(limits.finishTimeoutMs).toBe(10000);
        expect(limits.frameMs).toBe(20);
    });
});
