/**
 * Read the cached models.dev public model catalogue (prices and limits) keyed by vendor
 *
 * Use only inside models to price routes and to look up catalogue context/output limits. Fetches https://models.dev/api.json once, refreshes hourly in the background, and keeps the last good snapshot on failure (logged without bodies). Returns an empty object when the catalogue was never fetched. With `cacheOnly` it never waits for the network: it returns the current snapshot (possibly empty) and starts a background fetch when none is cached.
 * @param opts.offline Read the existing snapshot without scheduling any fetch or timer.
 * @param opts.cacheOnly Return the current snapshot without awaiting a fetch.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Return the current snapshot at once; a missing snapshot starts a background fetch instead of being awaited. @default false */
        cacheOnly?: boolean;
        /** Read only the existing snapshot without starting refreshes or timers. */
        offline?: boolean;
    },
): Promise<Record<string, { name?: string; models?: Record<string, { name?: string; cost?: Record<string, number>; limit?: { context?: number; output?: number } }> }>> {
    type Catalog = Record<string, { name?: string; models?: Record<string, { name?: string; cost?: Record<string, number>; limit?: { context?: number; output?: number } }> }>;
    const state = ctx.state as typeof ctx.state & { modelsPriceCatalog?: { data?: Catalog; pending?: Promise<void>; timer?: ReturnType<typeof setInterval> } };
    if (opts?.offline) return state.modelsPriceCatalog?.data ?? {};
    const cache = state.modelsPriceCatalog ??= {};
    const refresh = () => cache.pending ??= (async () => {
        try {
            const r = await fetch("https://models.dev/api.json", { redirect: "error", signal: AbortSignal.timeout(20000) });
            if (r.ok) cache.data = await r.json() as Catalog;
            else await ctx.fns.procs.log.warn({ event: "models.priceCatalog.unavailable", msg: "models.dev returned HTTP " + r.status + "; keeping last snapshot" });
        } catch { await ctx.fns.procs.log.warn({ event: "models.priceCatalog.unavailable", msg: "models.dev unavailable; keeping last snapshot" }); }
        finally { delete cache.pending; }
    })();
    if (!cache.timer) { cache.timer = setInterval(() => { void refresh(); }, 3600000); cache.timer.unref?.(); }
    if (!cache.data) {
        if (opts?.cacheOnly) { void refresh().catch(() => {}); return {}; }
        await refresh();
    }
    return cache.data ?? {};
}
