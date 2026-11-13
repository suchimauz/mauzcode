/**
 * Classify a Codex backend error into SDK failure metadata
 *
 * Pure Codex classifier for HTTP error responses (phase http) and failed stream events (phase stream). Distinguishes 401 login, exhausted quota (usage_limit_reached, usage_not_included, quota_exceeded, credits_depleted codes) from transient throttling (other 429 or rate_limit codes), invalid input (4xx), and provider failures (5xx). Keeps retry timing from resets_at/resets_in_seconds or Retry-After. HTTP errors were not accepted and are replay-safe; stream failures happened after acceptance and are not. Returns a safe message without the upstream body.
 * @param opts.phase Whether the error came as an HTTP status before streaming or as a stream event.
 * @param opts.status HTTP status of the response.
 * @param opts.error Parsed upstream error object, when any (code, type, message, resets_at, resets_in_seconds).
 * @param opts.retryAfter Retry-After header value, when any.
 * @param opts.now Clock in epoch milliseconds, for retry timing. @default Date.now()
 */
export default function (
    _ctx: Context,
    _session: Session | null,
    opts: {
        /** Whether the error came as an HTTP status before streaming or as a stream event. */
        phase: "http" | "stream";
        /** HTTP status of the response. */
        status: number;
        /** Parsed upstream error object, when any (code, type, message, resets_at, resets_in_seconds). */
        error?: Record<string, unknown> | null;
        /** Retry-After header value, when any. */
        retryAfter?: string | null;
        /** Clock in epoch milliseconds, for retry timing. @default Date.now() */
        now?: number;
    },
): { info: types.models.FailureInfo; message: string; status: number } {
    return _ctx.fns.models.provider.codex.codexFailure(opts);
}
