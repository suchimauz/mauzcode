/**
 * Classify a failed Code Assist response into SDK failure metadata
 *
 * The classifyFailure of the gemini provider. Parses the Google RPC error (`error.status`, `error.details[]`). 401 invalidates the access token (the next request refreshes first; never replayed) and is auth. 429: RESOURCE_EXHAUSTED with a QuotaFailure detail or an ErrorInfo reason naming exhausted quota (QUOTA_EXHAUSTED, RATE_LIMIT_EXCEEDED excluded, …) is QUOTA_EXHAUSTED/quota, any other 429 RATE_LIMITED/throttled; a RetryInfo `retryDelay` ("60s", "1.5s") becomes retryAfterMs and, for quota, resetAt. 403 is auth with a fixed plan/permission message. 404 is MODEL_UNAVAILABLE. Other statuses return null (status rules). Messages are fixed strings — never upstream body text or tokens.
 * @param opts.conn Resolved gemini connection.
 * @param opts.status HTTP status of the failed response.
 * @param opts.body Bounded JSON-parsed error body, or null when unparseable.
 * @param opts.model Model id of the request.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved gemini connection. */
        conn: types.models.ResolvedConnection;
        /** HTTP status of the failed response. */
        status: number;
        /** Bounded JSON-parsed error body, or null when unparseable. */
        body: unknown | null;
        /** Model id of the request. */
        model?: string;
    },
): Promise<{ code: string; classification: types.models.FailureInfo["classification"]; retryable: boolean; retryAfterMs?: number; resetAt?: number; message: string } | null> {
    const root = (Array.isArray(opts.body) ? opts.body[0] : opts.body) as { error?: { status?: unknown; details?: unknown } } | null;
    const err = root && typeof root === "object" && root.error && typeof root.error === "object" ? root.error : null;
    const details = Array.isArray(err?.details) ? err!.details as Record<string, any>[] : [];
    const type = (d: Record<string, any>) => typeof d?.["@type"] === "string" ? d["@type"] : "";
    if (opts.status === 401) {
        await ctx.fns.models.provider.gemini.auth({ conn: opts.conn, op: "invalidate" }).catch(() => undefined);
        return { code: "AUTH", classification: "auth", retryable: false, message: "Google rejected the access token; the next request refreshes it" };
    }
    if (opts.status === 429) {
        const delay = details.find(d => type(d).endsWith("google.rpc.RetryInfo"))?.retryDelay;
        const m = typeof delay === "string" ? /^(\d+(?:\.\d+)?)s$/.exec(delay.trim()) : null;
        const retryAfterMs = m ? Math.round(Number(m[1]) * 1000) : undefined;
        const quotaFailure = details.some(d => type(d).endsWith("google.rpc.QuotaFailure"));
        const reasons = details.filter(d => type(d).endsWith("google.rpc.ErrorInfo")).map(d => String(d.reason ?? "").toUpperCase());
        const quotaReason = reasons.some(r => /QUOTA|EXHAUSTED|INSUFFICIENT/.test(r) && !/RATE_LIMIT/.test(r));
        const exhausted = err?.status === "RESOURCE_EXHAUSTED" && (quotaFailure || quotaReason);
        if (exhausted) return { code: "QUOTA_EXHAUSTED", classification: "quota", retryable: false, ...(retryAfterMs !== undefined ? { retryAfterMs, resetAt: Date.now() + retryAfterMs } : {}), message: "Gemini Code Assist quota for this model is used up" };
        return { code: "RATE_LIMITED", classification: "throttled", retryable: true, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}), message: "Gemini Code Assist is rate limiting requests" };
    }
    if (opts.status === 403) return { code: "AUTH", classification: "auth", retryable: false, message: "Google denied this request; the account or its Code Assist tier may not allow it" };
    if (opts.status === 404) return { code: "MODEL_UNAVAILABLE", classification: "unsupported", retryable: false, message: "This Gemini model is not available through Code Assist" };
    return null;
}
