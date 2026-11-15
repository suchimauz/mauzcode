/**
 * Measure an agent's current context size from the last provider-reported prompt plus newer messages
 *
 * Returns the token count the next model request will occupy: the latest provider-reported prompt_tokens plus a local estimate of only the own transcript messages persisted after that request (tool results, replies, new user turns). Falls back — first to the provider's exact token count when its connection declares one (cached per agent, connection, model, last message index and an instructions+tools hash; bounded timeout; never fails the turn), then to a full local estimate — when the last usage is missing, predates the active compaction checkpoint, came from another model, or lacks a coverage boundary. Use for compaction thresholds and context indicators so they share one number.
 * @param opts.agentId Agent whose next-request context is measured.
 * @param opts.model Provider-qualified model route the next request targets; defaults to the persisted agent model.
 * @param opts.fallbackTokens Caller's full uncalibrated local estimate used when no fresh provider usage exists (calibration is applied here); defaults to estimating the projected transcript. @minimum 0
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Agent whose next-request context is measured. */
        agentId: string;
        /** Provider-qualified model route the next request targets; defaults to the persisted agent model. */
        model?: string;
        /** Caller's full uncalibrated local estimate used when no fresh provider usage exists (calibration is applied here); defaults to estimating the projected transcript. @minimum 0 */
        fallbackTokens?: number;
    },
): Promise<{ tokens: number; source: "provider" | "estimate"; reportedTokens: number | null; deltaTokens: number | null; reportedAt: number | null }> {
    const rows = await ctx.fns.procs.db.select({ sql: "SELECT model, sleep_context FROM agents WHERE id = ?", params: [opts.agentId] }) as Array<{ model: string; sleep_context: Record<string, unknown> | null }>;
        const row = rows[0];
        if (!row) throw new Error("Agent not found");
        const model = opts.model ?? row.model;
        const projection = await ctx.fns.compaction.project({ model, messages: await ctx.fns.session.getFullMessages({ id: opts.agentId }), sleepContext: row.sleep_context });
        // Local estimates are scaled by the per-model provider calibration; provider counts are not.
        const { factor } = await ctx.fns.compaction.calibration({ model });
        const estimate = async () => Math.round(factor * (opts.fallbackTokens ?? await ctx.fns.compaction.estimateTokens({ messages: projection.messages, model })));
        const usageRows = await ctx.fns.procs.db.select({ sql: "SELECT payload, ts FROM events WHERE agent_id = ? AND type = 'context_usage' ORDER BY idx DESC LIMIT 1", params: [opts.agentId] }) as Array<{ payload: unknown; ts: number | string }>;
        let payload: any = null;
        try { payload = typeof usageRows[0]?.payload === "string" ? JSON.parse(usageRows[0].payload) : usageRows[0]?.payload ?? null; } catch { payload = null; }
        const prompt = Number(payload?.usage?.prompt_tokens);
        const reportedAt = usageRows[0] ? Number(usageRows[0].ts) : null;
        const reportedTokens = Number.isFinite(prompt) && prompt >= 0 ? prompt : null;
        const coveredIdx = Number(payload?.coveredIdx);
        // Usage before the active checkpoint, from another model, or without a
        // coverage boundary cannot describe the context that will be sent next.
        const fresh = reportedTokens !== null && Number.isSafeInteger(coveredIdx) && payload?.model === model
            && (projection.mode !== "compact" || Number(reportedAt ?? 0) > Number(projection.activatedAt ?? 0));
        if (!fresh) {
            const exact = await providerCount(ctx, opts.agentId, model, row.sleep_context);
            if (exact !== null) return { tokens: exact, source: "provider", reportedTokens: exact, deltaTokens: null, reportedAt };
            return { tokens: await estimate(), source: "estimate", reportedTokens, deltaTokens: null, reportedAt };
        }
        const own = await ctx.fns.session.getMessages({ id: opts.agentId });
        const delta = own.filter(m => Number(m.idx) > coveredIdx);
        const deltaTokens = delta.length ? Math.round(factor * await ctx.fns.compaction.estimateTokens({ messages: delta, model })) : 0;
        return { tokens: reportedTokens + deltaTokens, source: "provider", reportedTokens, deltaTokens, reportedAt };
}

/** Provider-exact context measurement for the stale-usage path: asks the model's connection for an exact count of the same projected payload, cached per agent, connection, model, last message index and an instructions+tools hash. Returns null when the connection offers no counting, the count fails or times out — the caller then falls back to the local estimate. */
async function providerCount(ctx: Context, agentId: string, model: string, sleepContext: Record<string, unknown> | null): Promise<number | null> {
    try {
        const route = await ctx.fns.models.resolveRoute({ route: model });
        const cache: Map<string, number> = ((ctx.state as { agentContextCount?: Map<string, number> }).agentContextCount ??= new Map());
        const agent = ctx.state.agent[agentId] ?? await ctx.fns.session.load({ id: agentId });
        if (!agent) return null;
        const messages = await ctx.fns.session.getMessages({ id: agentId });
        const snapshot = { ...agent, model, sleepContext, messages };
        const [request, tools, indexRows] = await Promise.all([
            ctx.fns.agent.buildLlmRequest({ agent: snapshot, preview: true }),
            Promise.resolve(ctx.fns.agent.wireTools({ agent: snapshot })),
            ctx.fns.procs.db.select({ sql: "SELECT COALESCE(MAX(idx), -1) AS idx FROM messages WHERE agent_id = ?", params: [agentId] }),
        ]);
        const fingerprint = String(indexRows[0]?.idx ?? -1) + "|" + (await sha1Hex((request.instructions ?? "") + "\u0000" + JSON.stringify(tools)));
        const key = [agentId, route.connectionId, route.model, fingerprint].join("|");
        const hit = cache.get(key);
        if (hit !== undefined) return hit;
        const projection = await ctx.fns.compaction.project({ model, messages: await ctx.fns.session.getFullMessages({ id: agentId }), sleepContext: snapshot.sleepContext });
        const count = await ctx.fns.models.countTokens({
            connectionId: route.connectionId, model: route.model,
            messages: projection.messages as (Record<string, unknown> | types.models.CheckpointEntry)[],
            instructions: request.instructions,
            ...(tools.length ? { tools } : {}),
            timeoutMs: 15000,
        });
        if (count === null) return null;
        cache.set(key, count);
        return count;
    } catch {
        // Measurement must never fail the turn; the caller falls back to the estimate.
        return null;
    }
}

async function sha1Hex(text: string): Promise<string> {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-1", bytes);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}
