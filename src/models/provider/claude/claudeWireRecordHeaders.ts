/**
 * Merge quota windows observed in Claude inference response headers into the cached usage snapshot.
 *
 * Use from Claude stream adapters after a successful response. Reads `anthropic-ratelimit-unified-{5h,7d}-utilization`
 * and `-reset` and updates only the corresponding account-wide `claude:five_hour`/`claude:seven_day` windows; a
 * missing header never overwrites a window with 0%. Additional windows from the last usage-endpoint snapshot are
 * kept with their original `observedAt`, and the cache entry keeps its expiry so header traffic never postpones the
 * next full endpoint refresh (which replaces the snapshot and drops omitted extras).
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved Claude connection whose usage cache is updated. */
        conn: types.models.ResolvedConnection;
        /** Response headers of a successful inference request. */
        h: Headers;
    },
): Promise<void> {
    const { conn, h } = opts;
    const now = Date.now();
    type Window = NonNullable<types.models.UsageReport["windows"]>[number];
    const observed: Window[] = [];
    for (const [key, id, label, period] of [["5h", "claude:five_hour", "Session", "fiveHour"], ["7d", "claude:seven_day", "Weekly", "weekly"]] as const) {
        const raw = h.get(`anthropic-ratelimit-unified-${key}-utilization`);
        if (raw === null || raw.trim() === "" || !Number.isFinite(Number(raw))) continue;
        const reset = h.get(`anthropic-ratelimit-unified-${key}-reset`);
        observed.push({ id, label, period, scope: "account", observedAt: now, usedPercent: Math.max(0, Math.min(100, Number(raw) * 100)), ...(reset !== null && Number.isFinite(Number(reset)) && Number(reset) > 0 ? { resetAt: Number(reset) * 1000 } : {}) });
    }
    if (!observed.length) return;
    const connection = await ctx.fns.models.connections.get({ id: conn.id });
    await ctx.fns.models.connections.cached({ connection, kind: "usage", reuse: false, preserveExpiry: true, run: async previous => {
        const prev = previous && "windows" in previous && previous.status === "available" ? previous as types.models.UsageReport : undefined;
        const ids = new Set(observed.map(w => w.id));
        const kept = (prev?.windows ?? []).filter(w => !w.id || !ids.has(w.id));
        // Keep earlier positions stable: replace general windows in place, then append newly observed ones.
        const windows = (prev?.windows ?? []).flatMap(w => w.id && ids.has(w.id) ? observed.filter(o => o.id === w.id) : kept.includes(w) ? [w] : []);
        for (const o of observed) if (!windows.some(w => w.id === o.id)) windows.push(o);
        return { status: "available", reason: "usage-headers", checkedAt: now, ...(prev?.plan ? { plan: prev.plan } : {}), windows, ...(prev?.balance ? { balance: prev.balance } : {}) };
    } });
}
