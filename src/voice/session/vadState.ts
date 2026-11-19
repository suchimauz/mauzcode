/**
 * Create the energy-detector state for one session
 *
 * Use once per session, before the first frame, with the model's declared `turnDetection`, the negotiated sample
 * rate and the clamped thresholds from `voice.session.limits`. Every derived window count is computed here so the
 * push and flush steps never re-derive a threshold: the forced commit is always later than the silence window, and
 * the lookback is the half second the design allows core to split inside. `server` turn detection returns a state
 * that forwards audio unchanged and tracks energy only to decide whether finish must commit a remaining turn.
 * @param opts.turnDetection Turn detection the resolved model declares.
 * @param opts.sampleRate Negotiated sample rate in Hz; one of the model's declared rates.
 * @param opts.limits Clamped thresholds from voice.session.limits.
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Turn detection the resolved model declares. */
        turnDetection: "client" | "server";
        /** Negotiated sample rate in Hz; one of the model's declared rates. */
        sampleRate: number;
        /** Clamped thresholds from voice.session.limits. */
        limits: types.voice.SessionLimits;
    },
): types.voice.VadState {
    const { limits } = opts;
    // One energy window is a whole number of mono PCM16 samples; two bytes is the smallest possible window.
    const frameBytes = Math.max(2, Math.round((opts.sampleRate * limits.frameMs) / 1000) * 2);
    const silenceFrames = Math.max(1, Math.ceil(limits.silenceMs / limits.frameMs));
    return {
        turnDetection: opts.turnDetection,
        sampleRate: opts.sampleRate,
        limits,
        frameBytes,
        // The forced split may only look inside the last half second, so the detector holds back that much at most.
        lookbackFrames: Math.max(1, Math.ceil(500 / limits.frameMs)),
        silenceFrames,
        // A forced commit must come after at least one full silence window's worth of speech.
        forceFrames: Math.max(silenceFrames + 1, Math.ceil(limits.forceCommitMs / limits.frameMs)),
        carry: new Uint8Array(0),
        held: [],
        energies: [],
        speechRun: 0,
        silenceRun: 0,
        hasSpeech: false,
        phraseWindows: 0,
        lastSpeechByte: 0,
        pushedBytes: 0,
        forwardedBytes: 0,
    };
}
