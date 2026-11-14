/**
 * Decide whether a failed models.call attempt may be retried on the same connection
 *
 * Pure retry policy of the one-shot call: retries only failures that are retryable, replay-safe and not accepted by the upstream (acceptance none or rejected), at most three attempts in total. The delay is the failure's retryAfterMs when present, otherwise 500 ms before the second and 2000 ms before the third attempt. Never chooses another connection, account or model; the caller applies the decision against its deadline and signal.
 * @param opts.failure SDK failure of the attempt; null for errors without SDK failure metadata, which are never retried.
 * @param opts.attempt Number of the attempt that just failed. @minimum 1
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** SDK failure of the attempt; null for errors without SDK failure metadata, which are never retried. */
        failure: types.models.FailureInfo | null;
        /** Number of the attempt that just failed. @minimum 1 */
        attempt: number;
    },
): { retry: boolean; delayMs: number } {
    const MAX_ATTEMPTS = 3;
    const BACKOFF = [500, 2000];
    const f = opts.failure;
    if (!f || !f.retryable || !f.replaySafe || (f.acceptance !== "none" && f.acceptance !== "rejected")) return { retry: false, delayMs: 0 };
    if (!Number.isInteger(opts.attempt) || opts.attempt < 1 || opts.attempt >= MAX_ATTEMPTS) return { retry: false, delayMs: 0 };
    const hinted = typeof f.retryAfterMs === "number" && Number.isFinite(f.retryAfterMs) && f.retryAfterMs >= 0 ? f.retryAfterMs : undefined;
    return { retry: true, delayMs: hinted ?? BACKOFF[opts.attempt - 1]! };
}
