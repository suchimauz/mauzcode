/**
 * Read the cached models.dev public price catalogue keyed by vendor
 *
 * Use only inside models to price routes. Fetches https://models.dev/api.json once, refreshes hourly in the background, and keeps the last good snapshot on failure (logged without bodies). Returns an empty object when the catalogue was never fetched.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<Record<string, { name?: string; models?: Record<string, { name?: string; cost?: Record<string, number> }> }>> {
    type Catalog = Record<string, { name?: string; models?: Record<string, { name?: string; cost?: Record<string, number> }> }>;
    const state = ctx.state as typeof ctx.state & { modelsPriceCatalog?: { data?: Catalog; pending?: Promise<void>; timer?: ReturnType<typeof setInterval> } };
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
    if (!cache.data) await refresh();
    return cache.data ?? {};
}
