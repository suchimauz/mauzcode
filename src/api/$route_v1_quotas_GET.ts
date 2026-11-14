/**
 * Return the credential-free quota inventory `{ updatedAt, accounts }` under the standard API authentication middleware.
 *
 * Built from frontendBridge.modelUsage (enabled model connections and their usage); no legacy `llms` call. Windows are
 * mapped by label onto fiveHour (session), weekly and monthly periods; threshold levels map onto quota tones. Each account carries `icon`, the provider mark from frontendBridge.modelMark.
 */
export default async function (ctx: Context, _session: Session | null, _opts: { req: Request; params: Record<string, string> }): Promise<Response> {
    const view = await ctx.fns.frontendBridge.modelUsage({});
    const tone = (level: types.frontendBridge.UsageLevel) => level === "alert" ? "error" as const : level === "normal" ? "neutral" as const : level;
    const period = (label: string) => /^(session|5\s*h|five)/i.test(label) ? "fiveHour" as const : /^week/i.test(label) ? "weekly" as const : /^month/i.test(label) ? "monthly" as const : null;
    // One mark per provider from the shared resolver, so quota cards match pickers and chats.
    const marks = new Map(await Promise.all([...new Set(view.connections.map(c => c.provider))].map(async provider =>
        [provider, await ctx.fns.frontendBridge.modelMark({ provider }).catch(() => null)] as const)));
    const accounts = view.connections.map(c => {
        const windows: Partial<Record<"fiveHour" | "weekly" | "monthly", { usedPercent: number | null; resetsAt: number | null; tone: ReturnType<typeof tone> }>> = {};
        for (const w of c.windows) { const key = period(w.label); if (key && !windows[key]) windows[key] = { usedPercent: w.usedPercent ?? null, resetsAt: w.resetAt ?? null, tone: tone(w.level) }; }
        const kind = c.windows.length ? "quota" as const : "status" as const;
        const status = c.status === "configured" ? "unknown" as const : c.status;
        return { id: c.id, provider: c.provider, account: c.accountName, label: `${c.providerLabel} · ${c.accountName}`, model: `${c.provider}/${c.accountName}`, icon: marks.get(c.provider) ?? null,
            connection: "mauzcode" as const, kind, ...(kind === "quota" ? { windows } : {}), status,
            quotaStatus: c.status === "unavailable" ? "unavailable" as const : "fresh" as const, quotaUpdatedAt: c.status === "unavailable" ? null : c.checkedAt,
            tone: c.status === "unavailable" ? "error" as const : tone(c.level), planType: c.plan ?? null, parkedAgents: 0 };
    });
    return Response.json({ updatedAt: view.updatedAt, accounts }, { headers: { "Cache-Control": "no-store" } });
}
