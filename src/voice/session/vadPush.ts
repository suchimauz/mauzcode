/**
 * Feed one PCM frame through the server-side energy detector and return the ordered provider steps
 *
 * Use inside the session core for every inbound frame; a transport never calls it. The detector cuts mono PCM16 into
 * fixed energy windows and returns one ordered plan of `audio`/`commit` steps, so the provider receives audio in
 * stream order and a boundary is never placed inside an audio window:
 *
 * - a pause of `silenceMs` after speech commits the phrase at the end of that pause;
 * - `forceCommitMs` of continuous speech forces a commit placed after the lowest-energy window of the last half
 *   second, so a word is not cut where the speaker was briefly quietest;
 * - audio already handed over cannot be recalled, so the detector holds back at most that half second. Everything a
 *   user actually said is forwarded exactly once — a forced split moves audio from the hold-back to the provider and
 *   never duplicates or drops a byte;
 * - silence before the first syllable is not forwarded (only one silence window of pre-roll is kept, so the first
 *   syllable is not clipped) and a silence-only phrase is never committed;
 * - a partial window is carried into the next call, so no byte is lost at a frame boundary.
 *
 * Models with provider-side turn detection receive audio unchanged. Energy tracking in that mode is only used to
 * tell whether finish has speech left to commit. Mutation is limited to the returned state.
 * @param opts.state Detector state created by voice.session.vadState for this session.
 * @param opts.pcm Mono PCM16 little-endian frame at the negotiated rate; may be any length.
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Detector state created by voice.session.vadState for this session. */
        state: types.voice.VadState;
        /** Mono PCM16 little-endian frame at the negotiated rate; may be any length. */
        pcm: Uint8Array;
    },
): { state: types.voice.VadState; steps: types.voice.VadStep[] } {
    const steps: types.voice.VadStep[] = [];
    const source = opts.pcm instanceof Uint8Array ? opts.pcm : new Uint8Array(0);
    const state: types.voice.VadState = {
        ...opts.state,
        held: [...opts.state.held],
        energies: [...opts.state.energies],
    };
    if (!source.byteLength) return { state, steps };

    const start = state.pushedBytes - state.carry.byteLength;
    state.pushedBytes += source.byteLength;
    const merged = state.carry.byteLength ? concat(state.carry, source) : source;
    const whole = Math.floor(merged.byteLength / state.frameBytes);
    const threshold = state.limits.speechRms;

    // Send original chunks immediately. Keep only the partial analysis window and the offset of the latest speech,
    // so an upstream boundary reported asynchronously cannot hide speech from a newer chunk.
    if (state.turnDetection === "server") {
        for (let i = whole - 1; i >= 0; i--) {
            const offset = i * state.frameBytes;
            const window = merged.subarray(offset, offset + state.frameBytes);
            if (rms(window) < threshold) continue;
            // The provider can cut inside an energy window. Ignore the silent samples at its end.
            const samples = new DataView(window.buffer, window.byteOffset, window.byteLength);
            for (let end = window.byteLength; end > 0; end -= 2) {
                const value = samples.getInt16(end - 2, true);
                if (Math.abs(value) / 32768 < threshold) continue;
                state.lastSpeechByte = start + offset + end;
                break;
            }
            break;
        }
        state.carry = merged.slice(whole * state.frameBytes);
        state.forwardedBytes += source.byteLength;
        return { state, steps: [{ type: "audio", pcm: source }] };
    }

    for (let index = 0; index < whole; index++) {
        const window = merged.slice(index * state.frameBytes, (index + 1) * state.frameBytes);
        const energy = rms(window);
        state.held.push(window);
        state.energies.push(energy);
        if (energy >= threshold) {
            state.hasSpeech = true;
            state.speechRun++;
            state.silenceRun = 0;
        } else {
            state.silenceRun++;
            state.speechRun = 0;
        }
        if (state.hasSpeech) state.phraseWindows++;

        if (state.hasSpeech && state.silenceRun >= state.silenceFrames) {
            // A pause long enough to be a phrase boundary: everything held belongs before the commit.
            forwardAll(steps, state);
            steps.push({ type: "commit" });
            state.held = [];
            state.energies = [];
            state.speechRun = 0;
            state.silenceRun = 0;
            state.hasSpeech = false;
            state.phraseWindows = 0;
            continue;
        }
        if (state.hasSpeech && state.phraseWindows >= state.forceFrames) {
            // Continuous speech: split where the speaker was quietest inside the allowed half-second lookback.
            const split = quietestWindow(state.energies, state.lookbackFrames);
            forwardCount(steps, state, split + 1);
            steps.push({ type: "commit" });
            const kept = state.energies;
            state.hasSpeech = kept.some(value => value >= threshold);
            state.silenceRun = trailingSilence(kept, threshold);
            state.speechRun = trailingSpeech(kept, threshold);
            state.phraseWindows = kept.length;
            continue;
        }
        if (!state.hasSpeech) {
            // Still waiting for the first syllable: keep the pre-roll and drop older silence instead of sending it.
            while (state.held.length > state.silenceFrames) {
                state.held.shift();
                state.energies.shift();
            }
            state.silenceRun = Math.min(state.silenceRun, state.held.length);
            continue;
        }
        // Inside a phrase and not at a boundary: release everything older than the hold-back window. Audio already
        // forwarded can no longer be split, so the detector keeps exactly one half second in reserve.
        while (state.held.length > state.lookbackFrames) forwardCount(steps, state, 1);
    }

    state.carry = whole ? merged.slice(whole * state.frameBytes) : merged;
    return { state, steps };
}

/** Concatenate two frames without touching either input. */
function concat(head: Uint8Array, tail: Uint8Array): Uint8Array {
    const out = new Uint8Array(head.byteLength + tail.byteLength);
    out.set(head, 0);
    out.set(tail, head.byteLength);
    return out;
}

/** Root-mean-square amplitude of one PCM16 window, normalized to a 0–1 scale. */
function rms(window: Uint8Array): number {
    const samples = Math.floor(window.byteLength / 2);
    if (!samples) return 0;
    let sum = 0;
    for (let index = 0; index < samples; index++) {
        const low = window[index * 2] ?? 0;
        const high = window[index * 2 + 1] ?? 0;
        // Little-endian PCM16: assemble, then narrow to a signed 16-bit value.
        const value = (((high << 8) | low) << 16) >> 16;
        sum += value * value;
    }
    return Math.sqrt(sum / samples) / 32768;
}

/** Forward the first `count` held windows as audio steps, preserving stream order. */
function forwardCount(steps: types.voice.VadStep[], state: types.voice.VadState, count: number): void {
    for (let index = 0; index < count; index++) {
        const window = state.held.shift();
        state.energies.shift();
        if (!window?.byteLength) continue;
        steps.push({ type: "audio", pcm: window });
        state.forwardedBytes += window.byteLength;
    }
}

/** Forward everything held; used at a boundary, where the whole hold-back belongs before the commit. */
function forwardAll(steps: types.voice.VadStep[], state: types.voice.VadState): void {
    forwardCount(steps, state, state.held.length);
}

/**
 * Index of the quietest window inside the last `lookback` entries; ties pick the earliest, so a split is
 * deterministic and the earlier phrase keeps the shorter quiet tail.
 */
function quietestWindow(energies: number[], lookback: number): number {
    const start = Math.max(0, energies.length - lookback);
    let best = start;
    let bestEnergy = energies[start] ?? Number.POSITIVE_INFINITY;
    for (let index = start + 1; index < energies.length; index++) {
        const energy = energies[index] ?? Number.POSITIVE_INFINITY;
        if (energy < bestEnergy) {
            best = index;
            bestEnergy = energy;
        }
    }
    return best;
}

/** Count trailing silent windows. */
function trailingSilence(energies: number[], threshold: number): number {
    let count = 0;
    for (let index = energies.length - 1; index >= 0; index--) {
        if ((energies[index] ?? 0) >= threshold) break;
        count++;
    }
    return count;
}

/** Count trailing speech windows. */
function trailingSpeech(energies: number[], threshold: number): number {
    let count = 0;
    for (let index = energies.length - 1; index >= 0; index--) {
        if ((energies[index] ?? 0) < threshold) break;
        count++;
    }
    return count;
}
