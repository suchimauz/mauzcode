/**
 * Clamp one session's segmentation thresholds and deadlines into their documented ranges
 *
 * Use before opening a session, when a transport has caller-supplied tuning to apply. Every value is clamped
 * rather than rejected: a mistyped or hostile client can make dictation coarser or slower but never unbounded, and
 * the session core receives numbers it never has to re-check. Values are rounded to whole milliseconds, silence is
 * at least two energy windows, the forced commit is always after the silence window, and the buffered-audio ceiling
 * is a fixed 1 MiB so a stalled provider cannot grow memory without limit.
 * @param opts.config Caller tuning; every field is optional and every out-of-range value is clamped.
 */
export default function (
    ctx: Context,
    _session: Session | null,
    opts: { config?: types.voice.VoiceSessionConfig },
): types.voice.SessionLimits {
    const raw = opts.config ?? {};
    const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
        if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
        return Math.min(Math.max(value, min), max);
    };
    const frameMs = Math.round(clamp(raw.frameMs, 10, 100, 20));
    const silenceMs = Math.round(clamp(raw.silenceMs, 2 * frameMs, 5000, 500));
    const forceCommitMs = Math.round(clamp(raw.forceCommitMs, silenceMs + frameMs, 120000, 15000));
    // Amplitude thresholds are the smallest values a clamp may not round away, so they keep full precision.
    const speechRms = clamp(raw.speechRms, 0.0001, 0.5, 0.01);
    return {
        frameMs,
        silenceMs,
        forceCommitMs,
        speechRms,
        finishTimeoutMs: Math.round(clamp(raw.finishTimeoutMs, 100, 120000, 10000)),
        cancelTimeoutMs: Math.round(clamp(raw.cancelTimeoutMs, 100, 120000, 5000)),
        maxBufferedBytes: 1048576,
    };
}
