/**
 * Cache quota windows actually observed in Claude response headers.
 *
 * Use from claude provider adapters or protocol procedures; preserves existing wire behavior.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** conn input used by the claude recordHeaders protocol helper. */
        conn: types.models.ResolvedConnection;
        /** h input used by the claude recordHeaders protocol helper. */
        h: Headers;
    },
): Promise<void> {
    const { conn, h } = opts;
    
        const windows: NonNullable<types.models.UsageReport["windows"]> = [];
        for (const [key, label] of [["5h", "Session"], ["7d", "Weekly"]]) {
            const raw = h.get(`anthropic-ratelimit-unified-${key}-utilization`);
            if (raw === null || !Number.isFinite(Number(raw))) continue;
            const reset = h.get(`anthropic-ratelimit-unified-${key}-reset`);
            windows.push({ label: label!, usedPercent: Math.max(0, Math.min(100, Number(raw) * 100)), ...(reset !== null && Number.isFinite(Number(reset)) && Number(reset) > 0 ? { resetAt: Number(reset) * 1000 } : {}) });
        }
        if (!windows.length) return;
        const connection = await ctx.fns.models.get({ id: conn.id });
        await ctx.fns.models.cached({ connection, kind: "usage", reuse: false, run: async () => ({ status: "available", reason: "usage-headers", checkedAt: Date.now(), windows }) });
}
