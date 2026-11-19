/**
 * Close the buffered audio of a session with one final ordered step plan
 *
 * Use on `finish`, after the last frame, so nothing a user said is left uncommitted. For client turns the held
 * windows and the partial window are forwarded before committing. For provider turns the audio is already sent,
 * so only request a boundary when speech remains beyond the last upstream commit. Empty or silence-only tails
 * never create a new phrase.
 * @param opts.state Detector state after the last voice.session.vadPush.
 * @param opts.serverCommittedBytes Exclusive byte offset of the last provider-selected boundary, if any.
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Detector state after the last voice.session.vadPush. */
        state: types.voice.VadState;
        /** Exclusive byte offset of the last provider-selected boundary, if any. */
        serverCommittedBytes?: number;
    },
): { state: types.voice.VadState; steps: types.voice.VadStep[]; committed: boolean } {
    const tailStart = opts.state.pushedBytes - opts.state.carry.byteLength;
    const consumed = opts.serverCommittedBytes ?? 0;
    const tail = opts.state.carry.subarray(Math.max(0, consumed - tailStart));
    // Normalize by actual samples, not a padded 20 ms window. An incomplete PCM16 sample cannot establish speech.
    const tailSpeech = rms(tail) >= opts.state.limits.speechRms;
    const state: types.voice.VadState = {
        ...opts.state,
        held: [],
        energies: [],
        carry: new Uint8Array(0),
        hasSpeech: false,
        speechRun: 0,
        silenceRun: 0,
        phraseWindows: 0,
        lastSpeechByte: 0,
    };
    if (state.turnDetection === "server") {
        const committed = opts.state.lastSpeechByte > consumed || tailSpeech;
        return { state, steps: committed ? [{ type: "commit" }] : [], committed };
    }
    if (!opts.state.hasSpeech && !tailSpeech) return { state, steps: [], committed: false };

    const steps: types.voice.VadStep[] = [];
    for (const pcm of [...opts.state.held, opts.state.carry]) {
        if (!pcm.byteLength) continue;
        steps.push({ type: "audio", pcm });
        state.forwardedBytes += pcm.byteLength;
    }
    steps.push({ type: "commit" });
    return { state, steps, committed: true };
}

/** Root-mean-square amplitude of the available complete PCM16 samples. */
function rms(pcm: Uint8Array): number {
    const samples = Math.floor(pcm.byteLength / 2);
    if (!samples) return 0;
    const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    let sum = 0;
    for (let i = 0; i < samples; i++) sum += view.getInt16(i * 2, true) ** 2;
    return Math.sqrt(sum / samples) / 32768;
}
