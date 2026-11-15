/**
 * Return the credential-free quota inventory `{ updatedAt, accounts }` under the standard API authentication middleware.
 *
 * Built from frontendBridge.modelUsage (enabled model connections and their usage); no legacy `llms` call. Only
 * windows with explicit `scope: "account"` and a `period` fill the main `windows` map (fiveHour, weekly, monthly);
 * a period claimed by several distinct account windows stays empty. Every other window — model-specific, unknown
 * scope or period, label-only, conflicting — is returned in `additionalWindows` with `id`, `label`, `usedPercent`,
 * `remaining`, `resetsAt`, `observedAt`, `scope` and `tone`; labels are never parsed. Missing values are null, not 0.
 * An account with any window is `kind: "quota"`; its tone covers all windows. Each account carries `icon`, the
 * provider mark from frontendBridge.modelMark.
 */
export default async function (ctx: Context, _session: Session | null, _opts: { req: Request; params: Record<string, string> }): Promise<Response> {
    const view = await ctx.fns.frontendBridge.modelUsage({});
    const tone = (level: types.frontendBridge.UsageLevel) => level === "alert" ? "error" as const : level === "normal" ? "neutral" as const : level;
    // One mark per provider from the shared resolver, so quota cards match pickers and chats.
    const marks = new Map(await Promise.all([...new Set(view.connections.map(c => c.provider))].map(async provider =>
        [provider, await ctx.fns.frontendBridge.modelMark({ provider }).catch(() => null)] as const)));
    type Period = "fiveHour" | "weekly" | "monthly";
    const accounts = view.connections.map(c => {
        const claims = new Map<Period, number>();
        for (const w of c.windows) if (w.scope === "account" && w.period) claims.set(w.period, (claims.get(w.period) ?? 0) + 1);
        const windows: Partial<Record<Period, { usedPercent: number | null; resetsAt: number | null; tone: ReturnType<typeof tone> }>> = {};
        const additionalWindows: { id: string; label: string; scope: "account" | "model" | "unknown"; period: Period | null; model: string | null; usedPercent: number | null; remaining: number | null; resetsAt: number | null; observedAt: number | null; tone: ReturnType<typeof tone> }[] = [];
        c.windows.forEach((w, i) => {
            if (w.scope === "account" && w.period && claims.get(w.period) === 1) { windows[w.period] = { usedPercent: w.usedPercent ?? null, resetsAt: w.resetAt ?? null, tone: tone(w.level) }; return; }
            additionalWindows.push({ id: w.id ?? `window-${i + 1}`, label: w.label, scope: w.scope ?? "unknown", period: w.period ?? null, model: w.model ?? null, usedPercent: w.usedPercent ?? null,
                remaining: w.remaining ?? null, resetsAt: w.resetAt ?? null, observedAt: w.observedAt ?? null, tone: tone(w.level) });
        });
        const kind = c.windows.length ? "quota" as const : "status" as const;
        const status = c.status === "configured" ? "unknown" as const : c.status;
        return { id: c.id, provider: c.provider, account: c.accountName, label: `${c.providerLabel} · ${c.accountName}`, model: `${c.provider}/${c.accountName}`, icon: marks.get(c.provider) ?? null,
            connection: "mauzcode" as const, kind, ...(kind === "quota" ? { windows, additionalWindows } : {}), status,
            quotaStatus: c.status === "unavailable" ? "unavailable" as const : "fresh" as const, quotaUpdatedAt: c.status === "unavailable" ? null : c.checkedAt,
            tone: c.status === "unavailable" ? "error" as const : tone(c.level), planType: c.plan ?? null, parkedAgents: 0 };
    });
    return Response.json({ updatedAt: view.updatedAt, accounts }, { headers: { "Cache-Control": "no-store" } });
}
