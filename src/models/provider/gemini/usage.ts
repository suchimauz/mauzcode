/**
 * Report Gemini Code Assist quota per model from retrieveUserQuota
 *
 * usage adapter of the gemini provider. Without a usable login returns configured/login-required without any request. Otherwise ensures setup, POSTs `retrieveUserQuota({ project })` through the transport and maps quota buckets to additional per-model windows: used percent = round((1 − remainingFraction) × 100), with the bucket's resetTime as resetAt. Buckets without a model id or a numeric remaining fraction are skipped; several buckets of one model merge into one window with the lowest remaining fraction and that bucket's reset time (earliest on a tie). Windows are sorted by model id. The plan shows the Code Assist tier name and the account email. Never returns tokens.
 * @param opts.conn Resolved gemini connection.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved gemini connection. */
        conn: types.models.ResolvedConnection;
    },
): Promise<types.models.UsageReport> {
    const { conn } = opts;
    const now = Date.now();
    const state = await ctx.fns.models.provider.gemini.auth({ conn, op: "status" });
    if (!state.loggedIn) return { status: "configured", reason: "login-required", checkedAt: now };
    const { projectId, tier } = await ctx.fns.models.provider.gemini.setup({ conn });
    const res = await ctx.fns.models.provider.gemini.request({ conn, method: "retrieveUserQuota", body: { project: projectId } });
    const payload = await res.json().catch(() => null) as { buckets?: unknown } | null;
    const buckets = Array.isArray(payload?.buckets) ? payload!.buckets as Record<string, unknown>[] : [];
    const best = new Map<string, { fraction: number; resetAt?: number }>();
    for (const b of buckets) {
        const model = typeof b?.modelId === "string" ? b.modelId.trim() : "";
        const fraction = typeof b?.remainingFraction === "number" && Number.isFinite(b.remainingFraction) ? Math.min(1, Math.max(0, b.remainingFraction)) : null;
        if (!model || fraction === null) continue;
        const parsed = typeof b.resetTime === "string" ? Date.parse(b.resetTime) : NaN;
        const resetAt = Number.isFinite(parsed) ? parsed : undefined;
        const prev = best.get(model);
        const earlier = prev && fraction === prev.fraction && resetAt !== undefined && (prev.resetAt === undefined || resetAt < prev.resetAt);
        if (!prev || fraction < prev.fraction || earlier) best.set(model, { fraction, ...(resetAt !== undefined ? { resetAt } : {}) });
    }
    const windows = [...best.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([model, w]) => ({
        id: "gemini:" + model, label: model, scope: "model" as const, model, observedAt: now,
        usedPercent: Math.round((1 - w.fraction) * 100), ...(w.resetAt !== undefined ? { resetAt: w.resetAt } : {}),
    }));
    const plan = [tier?.name ?? tier?.id, state.account?.email].filter(Boolean).join(" · ");
    return { status: "available", reason: "usage-ok", checkedAt: now, ...(plan ? { plan } : {}), ...(windows.length ? { windows } : {}) };
}
