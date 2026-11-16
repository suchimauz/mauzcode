/**
 * Classify a failed Qwen gateway response into SDK failure metadata
 *
 * The SDK classifyFailure of the qwen provider, consulted by the shared openai-chat protocol before the status rules. A 401 marks the cached access token stale (next request refreshes; the failed request is never replayed) and returns auth. 402, or 403 with a quota/plan/subscription error code, is QUOTA_EXHAUSTED with a fixed plan message; a 402 with error.code `insufficient_quota` is weekly-credit exhaustion: its `error.quota.reset_at` (Unix seconds) becomes resetAt, the exhaustion is recorded process-locally for models.provider.qwen.usage, and the message names the reset time and a tier hint from `quota.member_type`. 429 with a quota-like error code (quota, insufficient, exceeded, limit, billing — unless it names a rate, throttling or concurrency limit) is QUOTA_EXHAUSTED, any other 429 RATE_LIMITED; the shared handler adds a Retry-After hint. Other responses return null and use the status rules. Messages are fixed strings — never the token or upstream body text.
 * @param opts.conn Resolved qwen connection.
 * @param opts.status HTTP status of the failed response.
 * @param opts.body Bounded JSON-parsed error body, or null when unparseable.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved qwen connection. */
        conn: types.models.ResolvedConnection;
        /** HTTP status of the failed response. */
        status: number;
        /** Bounded JSON-parsed error body, or null when unparseable. */
        body: unknown | null;
    },
): Promise<{ code: string; classification: types.models.FailureInfo["classification"]; retryable: boolean; resetAt?: number; message: string } | null> {
    const body = (opts.body ?? null) as { error?: { code?: unknown; type?: unknown; quota?: unknown } | string; code?: unknown } | null;
    const err = body && typeof body.error === "object" && body.error ? body.error : null;
    const raw = [err?.code, err?.type, typeof body?.error === "string" ? body.error : undefined, body?.code].filter(v => typeof v === "string" || typeof v === "number").map(String).join(" ").toLowerCase();
    const rateLike = /rate|throttl|too_many|concurren/.test(raw);
    const quotaLike = !rateLike && /quota|insufficient|exceed|limit|billing|balance|arrear/.test(raw);
    const planLike = quotaLike || /plan|subscription|member|payment/.test(raw);
    if (opts.status === 401) {
        await ctx.fns.models.provider.qwen.auth({ conn: opts.conn, op: "invalidate" }).catch(() => undefined);
        return { code: "AUTH", classification: "auth", retryable: false, message: "Qwen rejected the access token; the next request refreshes it" };
    }
    // Qwen Code's contract: only 402 + error.code insufficient_quota is weekly-credit exhaustion; quota.reset_at is Unix seconds.
    if (opts.status === 402 && err?.code === "insufficient_quota") {
        const q = err.quota && typeof err.quota === "object" ? err.quota as { reset_at?: unknown; member_type?: unknown } : {};
        const now = Date.now();
        const resetAt = typeof q.reset_at === "number" && Number.isInteger(q.reset_at) && q.reset_at * 1000 > now ? q.reset_at * 1000 : undefined;
        ((ctx.state.models ??= {}).qwenQuota ??= {})[opts.conn.id] = { ...(resetAt ? { resetAt } : {}), observedAt: now, until: resetAt ?? now + 3600_000 };
        const tier = typeof q.member_type === "string" ? q.member_type.toLowerCase() : "";
        const hint = tier === "lite" || tier === "plus" ? "; wait for the weekly reset or upgrade the plan" : tier === "pro" ? "; wait for the weekly reset" : "";
        const when = resetAt ? " until " + new Date(resetAt).toISOString() : "";
        return { code: "QUOTA_EXHAUSTED", classification: "quota", retryable: false, ...(resetAt ? { resetAt } : {}), message: "Qwen weekly credits are used up" + when + hint };
    }
    if (opts.status === 402 || (opts.status === 403 && planLike))
        return { code: "QUOTA_EXHAUSTED", classification: "quota", retryable: false, message: "Qwen subscription plan does not allow this request or its quota is used up" };
    if (opts.status === 429)
        return quotaLike
            ? { code: "QUOTA_EXHAUSTED", classification: "quota", retryable: false, message: "Qwen subscription quota reached" }
            : { code: "RATE_LIMITED", classification: "throttled", retryable: true, message: "Qwen is rate limiting requests" };
    return null;
}
