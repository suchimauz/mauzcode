/**
 * Extract Codex quota windows from a response
 *
 * Reads quota observations Codex already reports on inference responses — x-codex-{primary,secondary}-{used-percent,window-minutes,reset-at} headers and a stream rate_limits payload (which wins) — without any extra usage request or legacy recording. Returns null when nothing usable is present.
 * @param opts.headers Response headers.
 * @param opts.rateLimits rate_limits object from the stream, when any.
 */
export default function (
    _ctx: Context,
    _session: Session | null,
    opts: {
        /** Response headers. */
        headers?: Headers;
        /** rate_limits object from the stream, when any. */
        rateLimits?: Record<string, unknown> | null;
    },
): types.models.QuotaObservation | null {
    return _ctx.fns.models.provider.codex.codexQuota(opts);
}
