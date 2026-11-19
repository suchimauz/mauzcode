/**
 * Fake transport and deterministic audio generators for the provider contract suite.
 *
 * A provider never needs a network in a test: its `open` returns `createContractRecorder().stream(session)`, which
 * records every call and reports phrase events through the sink core handed it. That lets a test script revisions,
 * out-of-order finals, failures, usage or a provider that ignores its abort signal deterministically, while core
 * still runs its real ordering, revision, generation and deadline logic. Everything here is in-memory and
 * deterministic — no clock, no network, no file — so a segmentation test can assert an exact phrase boundary.
 */

/** One recorded provider call, in receive order. */
export type ContractCall =
    | { type: "append"; bytes: number }
    | { type: "commit"; order: number };

/**
 * Programming surface of the fake transport used by the shared provider contract suite.
 *
 * The call log is what makes a segmentation test exact: it records appends and commits in the order the provider
 * received them, so a test can compute the byte offset of every phrase boundary and assert the split landed on the
 * quiet window without losing or repeating a byte. Audio stays in memory for one test only and is never written to
 * disk, logged or added to agent history.
 */
export type ContractRecorder = {
    /** The stream core will use; every method records its call and resolves unless a test scripts otherwise. */
    stream: (session: types.voice.StreamSession) => types.voice.VoiceStream;
    /** Session sink core handed the provider, available after `open` resolved. */
    session: () => types.voice.StreamSession | undefined;
    /** Report one provider phrase event, exactly as a real adapter would. */
    emit: (event: types.voice.PhraseEvent) => void;
    /** Report one terminal provider failure; the default message deliberately looks like a credential leak. */
    fail: (code: types.voice.ErrorCode, message?: string) => void;
    /** Appends and commits in the exact order the provider received them. */
    log: ContractCall[];
    /** Audio frames appends received, in call order. */
    appended: Uint8Array[];
    /** Orders core committed, in call order. */
    commits: number[];
    /** How many times core asked the provider to finish. */
    finishes: number;
    /** How many times core released the provider stream. */
    cancels: number;
    /** Auto-answer every commit with `final` text, so a segmentation test need not script each phrase. */
    autoFinal: ((order: number) => string) | null;
    /** When true, `finish` never resolves and late provider events are still reported — a provider that hangs. */
    hang: boolean;
    /** When true, `append` never resolves, so queued audio accumulates and a backpressure bound can be observed. */
    hangAppend: boolean;
    /** Byte offset inside the concatenated audio at which each commit was requested. */
    boundaries: () => number[];
};

/**
 * Build one scriptable fake transport.
 *
 * Use in a fake provider's `open` (`return recorder.stream(session)`), so the shared contract suite and any provider
 * test drive the same boundary implementation. Every outcome is driven by the test that calls `emit`, `fail` or sets
 * `hang`/`hangAppend`; nothing here reads a clock, a network or a file.
 */
export function createContractRecorder(): ContractRecorder {
    let sink: types.voice.StreamSession | undefined;
    const recorder: ContractRecorder = {
        log: [],
        appended: [],
        commits: [],
        finishes: 0,
        cancels: 0,
        autoFinal: null,
        hang: false,
        hangAppend: false,
        stream: (session: types.voice.StreamSession): types.voice.VoiceStream => {
            sink = session;
            return {
                append: async (pcm: Uint8Array): Promise<void> => {
                    recorder.log.push({ type: "append", bytes: pcm.byteLength });
                    recorder.appended.push(pcm.slice());
                    if (recorder.hangAppend) await new Promise<void>(() => {});
                },
                commit: async (order: number): Promise<void> => {
                    recorder.log.push({ type: "commit", order });
                    recorder.commits.push(order);
                    if (recorder.autoFinal) recorder.emit({ type: "final", order, text: recorder.autoFinal(order) });
                },
                finish: async (): Promise<void> => {
                    recorder.finishes++;
                    if (recorder.hang) await new Promise<void>(() => {});
                },
                cancel: async (): Promise<void> => {
                    recorder.cancels++;
                    if (recorder.hang) await new Promise<void>(() => {});
                },
            };
        },
        session: (): types.voice.StreamSession | undefined => sink,
        emit: (event: types.voice.PhraseEvent): void => sink?.emit(event),
        // A provider failure must never leak its own text: this message is what core must not forward.
        fail: (code: types.voice.ErrorCode, message = "upstream said secret-fixture-key"): void => sink?.fail({ code, message }),
        boundaries: (): number[] => {
            const offsets: number[] = [];
            let total = 0;
            for (const call of recorder.log) {
                if (call.type === "append") total += call.bytes;
                else offsets.push(total);
            }
            return offsets;
        },
    };
    return recorder;
}

/**
 * Generate deterministic mono PCM16 at one amplitude.
 *
 * Use for synthetic speech and silence: a square wave gives every energy window the same stable root-mean-square
 * amplitude, and amplitude 0 produces exact digital silence, so a detector threshold is exercised predictably.
 * @param opts.sampleRate Negotiated rate in Hz.
 * @param opts.windows Number of energy windows to generate. @default 1
 * @param opts.windowMs Window length in milliseconds. @default 20
 * @param opts.amplitude Peak amplitude on a 0–1 scale; 0 is silence.
 */
export function pcmChunk(opts: {
    sampleRate: number;
    windows?: number;
    windowMs?: number;
    amplitude: number;
}): Uint8Array {
    const windowMs = opts.windowMs ?? 20;
    const windows = opts.windows ?? 1;
    const samples = Math.round((opts.sampleRate * windowMs) / 1000) * windows;
    const bytes = new Uint8Array(samples * 2);
    const period = 16;
    const peak = Math.round(Math.max(0, Math.min(1, opts.amplitude)) * 32767);
    for (let index = 0; index < samples; index++) {
        const value = peak === 0 ? 0 : (Math.floor(index / (period / 2)) % 2 === 0 ? peak : -peak);
        const signed = value < 0 ? value + 0x10000 : value;
        bytes[index * 2] = signed & 0xff;
        bytes[index * 2 + 1] = (signed >> 8) & 0xff;
    }
    return bytes;
}

/** Concatenate frames in order, so a test can compare the provider's total audio with its own input. */
export function concatFrames(frames: Uint8Array[]): Uint8Array {
    const total = frames.reduce((sum, frame) => sum + frame.byteLength, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const frame of frames) {
        out.set(frame, offset);
        offset += frame.byteLength;
    }
    return out;
}
