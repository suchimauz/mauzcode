/**
 * Fetch Z.ai Coding Plan quota windows and the plan level for one connection
 *
 * usage adapter of the zai-coding provider; reached through models.usage / models.refreshAll. Sends one authenticated GET https://api.z.ai/api/monitor/usage/quota/limit through the connection's transport (never directly) and normalizes the `CREDIT_LIMIT` entries into standard fiveHour and weekly account windows. `data.level` becomes `plan` when it is a non-empty string. Throws a safe error carrying the HTTP status (never the response body) on failure, and when the payload is unrecognized or carries no valid window — missing quota is never reported as unused.
 * @param opts.conn Resolved zai-coding connection supplying the apiKey secret and transport-bound fetch.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved zai-coding connection supplying the apiKey secret and transport-bound fetch. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.UsageReport> {
    const headers = { accept: "application/json", ...(await ctx.fns.models.provider.zaiCoding.headers({ conn: opts.conn })) };
        const res = await ctx.fns.models.protocol.common.checkedFetch({
            fetch: opts.conn.fetch, url: "https://api.z.ai/api/monitor/usage/quota/limit",
            init: { method: "GET", headers }, what: "Z.ai quota request",
        });
        const body = await res.json().catch(() => null) as { success?: unknown; code?: unknown; data?: { level?: unknown; limits?: unknown } | null } | null;
        if (!body || body.success !== true || body.code !== 200 || !Array.isArray(body.data?.limits)) throw new Error("Unrecognized Z.ai quota response");
        const now = Date.now();
        const windows: NonNullable<types.models.UsageReport["windows"]> = [];
        for (const raw of (body.data!.limits as unknown[]).slice(0, 100)) {
            const w = ctx.fns.models.provider.zaiCoding.zaiQuotaWindowOf({ raw, observedAt: now });
            if (w && !windows.some(x => x.id === w.id)) windows.push(w);
        }
        if (!windows.length) throw new Error("Z.ai quota response has no recognized windows");
        const level = typeof body.data!.level === "string" ? body.data!.level.trim().slice(0, 80) : "";
        return { status: "available", reason: "usage-ok", checkedAt: now, windows, ...(level ? { plan: level } : {}) };
}
