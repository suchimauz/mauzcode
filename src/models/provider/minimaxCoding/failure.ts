/**
 * Classify a MiniMax M Plan inference failure into SDK failure metadata
 *
 * The SDK classifyFailure of the minimax-coding provider, consulted by the shared anthropic protocol on a failed response before the status rules. Reads the MiniMax error code from the bounded JSON body — base_resp.status_code, or error.code when the gateway answers in plain Anthropic error shape — and maps it from the documentation: 2056 and 2067 are the usage limit (QUOTA_EXHAUSTED, not retried); 1002, 1039, 1041, 1045, 2045-2047 and 2062 are rate or concurrency limits (throttled, retryable — a rate limit is never quota); 2061 and 2068 mean the model is not in the plan (UNSUPPORTED); 1004 and 2057 mean a key problem (auth). A quota failure carries the reset time of the exhausted window when the connection's cached usage snapshot reports an account window at 100% whose reset is still in the future (five-hour first, then weekly); the cache is read in place and never refreshed, so a stale snapshot simply omits resetAt and the core's default backoff applies. Unknown bodies return null and fall back to the status rules. Messages are fixed strings — never the key, never upstream body text.
 * @param opts.conn Resolved minimax-coding connection whose cached usage may supply a quota reset time.
 * @param opts.status HTTP status of the failed response.
 * @param opts.body Bounded JSON-parsed error body, or null when unparseable.
 * @param opts.model Model the failed turn targeted; classification does not depend on it.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved minimax-coding connection whose cached usage may supply a quota reset time. */
        conn: types.models.ResolvedConnection;
        /** HTTP status of the failed response. */
        status: number;
        /** Bounded JSON-parsed error body, or null when unparseable. */
        body: unknown | null;
        /** Model the failed turn targeted; classification does not depend on it. */
        model: string;
    },
): { code: string; classification: types.models.FailureInfo["classification"]; retryable: boolean; resetAt?: number; message: string } | null {
    const body = (opts.body ?? null) as { base_resp?: { status_code?: unknown }; error?: { code?: unknown } } | null;
    const raw = body?.base_resp?.status_code ?? body?.error?.code;
    const code = Number(raw);
    if (!Number.isFinite(code) || code === 0) return null;
    if (code === 2056 || code === 2067) {
        const resetAt = quotaResetAtOf(ctx, opts.conn.id);
        return { code: "QUOTA_EXHAUSTED", classification: "quota", retryable: false, ...(resetAt !== undefined ? { resetAt } : {}), message: "MiniMax M Plan usage limit reached" };
    }
    if (code === 1002 || code === 1039 || code === 1041 || code === 1045 || (code >= 2045 && code <= 2047) || code === 2062)
        return { code: "RATE_LIMITED", classification: "throttled", retryable: true, message: "MiniMax is rate limiting requests" };
    if (code === 2061 || code === 2068)
        return { code: "UNSUPPORTED", classification: "unsupported", retryable: false, message: "Model is not part of the MiniMax M Plan" };
    if (code === 1004 || code === 2057)
        return { code: "AUTH", classification: "auth", retryable: false, message: "The M Plan key was rejected" };
    return null;
}

/** Find the future reset time of a 100%-used account window in the connection's cached usage snapshot, five-hour first then weekly. Reads the in-memory usage cache only — a stale or absent snapshot yields undefined, never a refresh request. */
function quotaResetAtOf(ctx: Context, connectionId: string): number | undefined {
    const now = Date.now();
    const health = (ctx.state.models?.health ?? {}) as Record<string, { result?: types.models.UsageReport | types.models.TestResult } | undefined>;
    for (const entry of Object.entries(health)) {
        if (!entry[0].startsWith(connectionId + ":") || !entry[0].endsWith(":usage")) continue;
        const report = entry[1]?.result;
        if (!report || !("windows" in report) || report.status !== "available" || !Array.isArray(report.windows)) continue;
        for (const period of ["fiveHour", "weekly"] as const) {
            const window = report.windows!.find(w => w?.scope === "account" && w?.period === period && w?.usedPercent === 100
                && typeof w?.resetAt === "number" && Number.isFinite(w.resetAt) && w.resetAt > now);
            if (window?.resetAt !== undefined) return window.resetAt;
        }
    }
    return undefined;
}
