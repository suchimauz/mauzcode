/**
 * Return the credential-free quota inventory `{ updatedAt, accounts }` under the standard API authentication middleware.
 *
 * Built from frontendBridge.modelUsage (enabled model connections and their usage); no legacy `llms` call. Only
 * windows with explicit `scope: "account"` and a `period` fill the main `windows` map (fiveHour, weekly, monthly);
 * a period claimed by several distinct account windows stays empty. Every other window — model-specific, unknown
 * scope or period, label-only, conflicting — is returned in `additionalWindows` with `id`, `label`, `usedPercent`,
 * `remaining`, `resetsAt`, `observedAt`, `scope`, `tone` and `family` (`gemini`, `claude` or null); labels are never
 * parsed. Missing values are null, not 0. `usedPercent` is always the used share, so remaining is `100 − usedPercent`.
 * A connection whose cached catalogue names model families (Antigravity pools) becomes one ordinary account per family
 * with an enabled model, Gemini first: id `<connection>:<family>`, `connectionId`, `family`, and the standard `windows`
 * filled only by that family's unique `scope: "group"` period readings; the family's other readings are its
 * `additionalWindows`, and readings of no shown family are additional windows of the first pool account. Each pool
 * account's tone covers its own windows; `partial: true` marks a pool whose readings were truncated. When every window is a family measurement and no family is shown, the
 * connection is one ordinary `kind: "status"` account.
 * A connection whose latest read failed after a success reports `quotaStatus: "stale"` with `quotaUpdatedAt` at that
 * success. An account with any window is `kind: "quota"`; its tone covers all windows. Each account carries `icon`, the
 * provider mark from frontendBridge.modelMark.
 */
export default async function (ctx: Context, _session: Session | null, _opts: { req: Request; params: Record<string, string> }): Promise<Response> {
    const view = await ctx.fns.frontendBridge.modelUsage({});
    const tone = (level: types.frontendBridge.UsageLevel) => level === "alert" ? "error" as const : level === "normal" ? "neutral" as const : level;
    // One mark per provider from the shared resolver, so quota cards match pickers and chats.
    const marks = new Map(await Promise.all([...new Set(view.connections.map(c => c.provider))].map(async provider =>
        [provider, await ctx.fns.frontendBridge.modelMark({ provider }).catch(() => null)] as const)));
    type Period = "fiveHour" | "weekly" | "monthly";
    type Win = (typeof view.connections)[number]["windows"][number];
    const rank: Record<types.frontendBridge.UsageLevel, number> = { normal: 0, warning: 1, critical: 2, alert: 3 };
    /** Main period cells from the unique windows of `scope`, everything else additional. */
    const split = (list: { w: Win; i: number }[], scope: "account" | "group") => {
        const claims = new Map<Period, number>();
        for (const { w } of list) if (w.scope === scope && w.period) claims.set(w.period, (claims.get(w.period) ?? 0) + 1);
        const windows: Partial<Record<Period, { usedPercent: number | null; resetsAt: number | null; tone: ReturnType<typeof tone> }>> = {};
        const additionalWindows: { id: string; label: string; scope: "account" | "model" | "group" | "unknown"; bucket: string | null; period: Period | null; model: string | null; family: "gemini" | "claude" | null; usedPercent: number | null; remaining: number | null; resetsAt: number | null; observedAt: number | null; tone: ReturnType<typeof tone> }[] = [];
        for (const { w, i } of list) {
            if (w.scope === scope && w.period && claims.get(w.period) === 1) { windows[w.period] = { usedPercent: w.usedPercent ?? null, resetsAt: w.resetAt ?? null, tone: tone(w.level) }; continue; }
            additionalWindows.push({ id: w.id ?? `window-${i + 1}`, label: w.label, scope: w.scope ?? "unknown", bucket: w.bucket ?? null, period: w.period ?? null, model: w.model ?? null, family: w.family ?? null, usedPercent: w.usedPercent ?? null,
                remaining: w.remaining ?? null, resetsAt: w.resetAt ?? null, observedAt: w.observedAt ?? null, tone: tone(w.level) });
        }
        return { windows, additionalWindows };
    };
    const accounts = view.connections.flatMap(c => {
        const status = c.status === "configured" ? "unknown" as const : c.status;
        const base = { provider: c.provider, account: c.accountName, label: `${c.providerLabel} · ${c.accountName}`, model: `${c.provider}/${c.accountName}`, icon: marks.get(c.provider) ?? null,
            connection: "mauzcode" as const, status, quotaStatus: c.status === "unavailable" ? "unavailable" as const : c.stale ? "stale" as const : "fresh" as const,
            quotaUpdatedAt: c.status === "unavailable" ? null : c.checkedAt, planType: c.plan ?? null, parkedAgents: 0 };
        const indexed = c.windows.map((w, i) => ({ w, i }));
        const families = (c.families ?? []).map(f => f.family);
        const partial = new Set((c.families ?? []).filter(f => f.partial).map(f => f.family));
        if (families.length) {
            // One ordinary account per shown family pool; readings of no shown family stay on the first pool.
            const kind = c.windows.length ? "quota" as const : "status" as const;
            return families.map((family, n) => {
                const own = indexed.filter(({ w }) => w.family === family || (n === 0 && !(w.family && families.includes(w.family))));
                const level = own.reduce<types.frontendBridge.UsageLevel>((a, { w }) => rank[w.level] > rank[a] ? w.level : a, "normal");
                return { id: `${c.id}:${family}`, connectionId: c.id, family, ...(partial.has(family) ? { partial: true } : {}), ...base, kind, ...(kind === "quota" ? split(own, "group") : {}),
                    tone: c.status === "unavailable" ? "error" as const : tone(level) };
            });
        }
        // Family measurements belong to family pools: with no family shown the connection keeps its ordinary status card.
        const hidden = c.windows.length > 0 && c.windows.every(w => w.family);
        const kind = c.windows.length && !hidden ? "quota" as const : "status" as const;
        return [{ id: c.id, ...base, kind, ...(kind === "quota" ? split(indexed, "account") : {}), tone: c.status === "unavailable" ? "error" as const : tone(c.level) }];
    });
    return Response.json({ updatedAt: view.updatedAt, accounts }, { headers: { "Cache-Control": "no-store" } });
}
