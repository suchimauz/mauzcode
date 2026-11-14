/**
 * Aggregate usage of every enabled model connection with threshold levels
 *
 * Use for quota and usage displays. Lists enabled connections in creation order, queries models.usage for each in parallel and classifies every window as normal, warning, critical or alert using models.usageWarnPercent, models.usageCriticalPercent and models.usageAlertPercent (defaults 30, 60, 75; a value at or above a threshold reaches its level). Status-only and balance-only connections are reported without windows. A connection whose usage request fails is reported unavailable without hiding the others.
 * @param opts.refresh Bypass the 60 s per-connection usage cache. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Bypass the 60 s per-connection usage cache. @default false */
        refresh?: boolean;
    },
): Promise<types.frontendBridge.ModelUsageView> {
    const num = async (key: string, fallback: number) => { const v = await ctx.fns.settings.getNumber({ module: "models", scopeType: "global", key, fallback }); return typeof v === "number" && Number.isFinite(v) ? v : fallback; };
    const [warn, critical, alert] = await Promise.all([num("usageWarnPercent", 30), num("usageCriticalPercent", 60), num("usageAlertPercent", 75)]);
    const level = (v: number | undefined): types.frontendBridge.UsageLevel => v === undefined ? "normal" : v >= alert ? "alert" : v >= critical ? "critical" : v >= warn ? "warning" : "normal";
    const rank: Record<types.frontendBridge.UsageLevel, number> = { normal: 0, warning: 1, critical: 2, alert: 3 };
    const providers = ctx.fns.models.providers({});
    const connections = (await ctx.fns.models.list({})).filter(c => c.enabled);
    const reports = await Promise.allSettled(connections.map(c => ctx.fns.models.usage({ id: c.id, refresh: opts.refresh === true })));
    const now = Date.now();
    return { updatedAt: now, thresholds: { warn, critical, alert }, connections: connections.map((c, i) => {
        const r = reports[i]!;
        const report: types.models.UsageReport = r.status === "fulfilled" ? r.value : { status: "unavailable", reason: "usage-failed", checkedAt: now };
        const windows = (report.windows ?? []).map(w => ({ ...w, level: level(w.usedPercent) }));
        const worst = windows.reduce<types.frontendBridge.UsageLevel>((a, w) => rank[w.level] > rank[a] ? w.level : a, "normal");
        return { id: c.id, provider: c.provider, accountName: c.accountName, providerLabel: providers.find(p => p.id === c.provider)?.label ?? c.provider,
            status: report.status, ...(report.reason !== undefined ? { reason: report.reason } : {}), ...(report.plan !== undefined ? { plan: report.plan } : {}),
            checkedAt: report.checkedAt, windows, ...(report.balance ? { balance: report.balance } : {}), level: worst };
    }) };
}
