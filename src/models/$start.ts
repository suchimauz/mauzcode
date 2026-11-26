/** Refreshes cached model lists of all model connections every hour and once converts legacy group-member disables from trustworthy caches. Never blocks startup. */
export default async function (ctx: Context, _session: Session | null, _opts?: {}) {
    // Startup pass of the group availability migration: cached catalogues only, no provider request.
    void ctx.fns.models.catalog.convertLegacyDisables({}).catch((e: any) => ctx.fns.procs.log.warn({ event: "models.convertLegacyDisables.failed", msg: String(e?.message ?? e) }));
    if (ctx.env.MODELS_REFRESH === "off") return {};
    const refresh = () => ctx.fns.models.catalog.refreshAll({}).then(r => {
        if (r.failed.length) ctx.fns.procs.log.warn({ event: "models.refreshAll", msg: `${r.refreshed} refreshed, ${r.failed.length} failed` });
    }).catch((e: any) => ctx.fns.procs.log.warn({ event: "models.refreshAll.failed", msg: String(e?.message ?? e) }));
    const refreshTimer = setInterval(refresh, 60 * 60 * 1000);
    return { refreshTimer };
}
