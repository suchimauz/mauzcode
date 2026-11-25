/**
 * Classify a failed Antigravity generation response
 *
 * classifyFailure of the antigravity stream. 401: marks the used access token stale (models.provider.antigravity.auth
 * op rejected) and returns AUTH, retryable only for the first 401 of that token so the shared call sends at most one
 * further request with the refreshed token of the same account. 403 or PERMISSION_DENIED: ACCESS_DENIED, not
 * retryable. 429 or RESOURCE_EXHAUSTED: QUOTA_EXHAUSTED, not retryable, with a RetryInfo `retryDelay` converted to
 * `resetAt` only. Other statuses return null (shared status rules: 5xx retryable and replay-safe). Messages are fixed
 * strings — never upstream text or tokens.
 * @param opts.conn Resolved antigravity connection.
 * @param opts.status HTTP status of the failed response.
 * @param opts.body Bounded JSON-parsed error body, or null when unparseable.
 * @param opts.accessToken Access token the failed request used.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved antigravity connection. */
        conn: types.models.ResolvedConnection;
        /** HTTP status of the failed response. */
        status: number;
        /** Bounded JSON-parsed error body, or null when unparseable. */
        body: unknown | null;
        /** Access token the failed request used. */
        accessToken: string;
    },
): Promise<{ code: string; classification: types.models.FailureInfo["classification"]; retryable: boolean; resetAt?: number; message: string } | null> {
    const root = (Array.isArray(opts.body) ? opts.body[0] : opts.body) as { error?: { status?: unknown; details?: unknown } } | null;
    const err = root && typeof root === "object" && root.error && typeof root.error === "object" ? root.error : null;
    const rpc = typeof err?.status === "string" ? err.status : "";
    const details = Array.isArray(err?.details) ? err!.details as Record<string, unknown>[] : [];
    if (opts.status === 401) {
        const r = await ctx.fns.models.provider.antigravity.auth({ conn: opts.conn, op: "rejected", accessToken: opts.accessToken }).catch(() => ({ retry: false }));
        return { code: "AUTH", classification: "auth", retryable: r.retry === true, message: "Google rejected the Antigravity access token" };
    }
    if (opts.status === 403 || rpc === "PERMISSION_DENIED") return { code: "ACCESS_DENIED", classification: "auth", retryable: false, message: "Google denied this Antigravity account access to the model" };
    if (opts.status === 429 || rpc === "RESOURCE_EXHAUSTED") {
        const delay = details.find(d => typeof d?.["@type"] === "string" && (d["@type"] as string).endsWith("google.rpc.RetryInfo"))?.retryDelay;
        const m = typeof delay === "string" ? /^(\d+(?:\.\d+)?)s$/.exec(delay.trim()) : null;
        return { code: "QUOTA_EXHAUSTED", classification: "quota", retryable: false, ...(m ? { resetAt: Date.now() + Math.round(Number(m[1]) * 1000) } : {}), message: "Antigravity quota for this model is used up" };
    }
    return null;
}
