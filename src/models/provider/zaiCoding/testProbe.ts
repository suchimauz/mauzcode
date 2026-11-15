/**
 * Read the Z.ai Coding Plan quota endpoint for a connection test
 *
 * Use only from models.provider.zaiCoding.test. Sends one authenticated GET https://api.z.ai/api/monitor/usage/quota/limit through the connection's transport and classifies the outcome without exposing the key or the response body: `ok` when the payload carries a recognized quota window, `{ status }` when the endpoint answers 401/403 or the payload is unrecognized (treated as an unusable key), and a thrown error carrying the HTTP status for any other failure.
 * @param opts.conn Resolved zai-coding connection supplying the apiKey secret and transport-bound fetch.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved zai-coding connection supplying the apiKey secret and transport-bound fetch. */
        conn: types.models.ResolvedConnection;
    },
): Promise<{ ok: true } | { status: number }> {
    const headers = { accept: "application/json", ...(await ctx.fns.models.provider.zaiCoding.headers({ conn: opts.conn })) };
        const res = await opts.conn.fetch("https://api.z.ai/api/monitor/usage/quota/limit", { method: "GET", headers, redirect: "error" });
        if (!res.ok) {
            await res.body?.cancel().catch(() => undefined);
            if (res.status === 401 || res.status === 403) return { status: res.status };
            throw Object.assign(new Error("Z.ai quota request failed (HTTP " + res.status + ")"), { status: res.status });
        }
        const body = await res.json().catch(() => null) as { success?: unknown; code?: unknown; data?: { limits?: unknown } | null } | null;
        const limits = body?.success === true && body.code === 200 && Array.isArray(body.data?.limits) ? body.data!.limits as unknown[] : null;
        if (!limits) return { status: 0 };
        const now = Date.now();
        return limits.slice(0, 100).some(raw => ctx.fns.models.provider.zaiCoding.zaiQuotaWindowOf({ raw, observedAt: now }))
            ? { ok: true } : { status: 0 };
}
