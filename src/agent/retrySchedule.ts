/**
 * Persist a model retry decision under the current run lease.
 *
 * Uses the agent-owned `agent.retryPolicy` through `agent.retryDecision`: eligibility comes from
 * machine codes, never from SDK `replaySafe`/`acceptance`, so a generation interrupted after
 * partial output is retried like any other transport failure. A Retry-After beyond the policy
 * maximum returns `parkUntil` instead of scheduling, so the caller can park this one agent.
 * Use only after a failed model request, before waiting. Locks the agent row to serialize Stop and
 * concurrent run recovery, increments the durable attempt and appends a retry event atomically.
 * @param opts.agentId Agent owning the request.
 * @param opts.runToken Current worker lease or null for a direct run.
 * @param opts.error The thrown error of the failed model request.
 * @param opts.provider Provider id for policy overrides; resolved from the agent model when absent.
 * @param opts.signal Run cancellation signal.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Agent owning the request. */
        agentId: string;
        /** Current worker lease or null for a direct run. */
        runToken: string | null;
        /** The thrown error of the failed model request. */
        error: any;
        /** Provider id for policy overrides; resolved from the agent model when absent. */
        provider?: string;
        /** Run cancellation signal. */
        signal: AbortSignal;
    },
): Promise<{ scheduled: boolean; parkUntil?: number }> {
    const decision = await ctx.fns.agent.retryDecision({ error: opts.error, provider: opts.provider, retry: 0 });
    // Nothing to schedule and no parking: refuse without touching the row.
    if (!decision.code) return { scheduled: false };
    if (!decision.retry && decision.parkUntil == null) return { scheduled: false };

    return await ctx.fns.procs.db.transaction({ fn: async () => {
        const row = (await ctx.fns.procs.db.select({ sql: 'SELECT llm_retry_attempt,stopped_at,run_token,model FROM agents WHERE id = ? FOR UPDATE', params: [opts.agentId] }))[0];
        opts.signal.throwIfAborted();
        if (!row || row.stopped_at != null || (opts.runToken && row.run_token !== opts.runToken)) throw new DOMException('Retry ownership lost', 'AbortError');
        const attempt = Number(row.llm_retry_attempt ?? 0);
        // The durable attempt is the authority on how often this request already failed;
        // recompute the decision with it so a recovered run cannot retry past the limit.
        const decided = attempt === 0 ? decision : await ctx.fns.agent.retryDecision({
            error: opts.error,
            provider: opts.provider ?? await providerOf({ ctx, model: row.model }),
            retry: attempt,
        });
        if (!decided.retry && decided.parkUntil != null) {
            // A long Retry-After is a wait, not a failure: the caller parks this agent.
            await ctx.fns.procs.db.run({ sql: 'UPDATE agents SET llm_retry_attempt = 0, llm_retry_pending = NULL WHERE id = ?', params: [opts.agentId] });
            return { scheduled: false, parkUntil: decided.parkUntil };
        }
        if (!decided.retry) return { scheduled: false };
        const delayMs = decided.delayMs;
        const payload = {
            type: 'llm_retry', retryId: crypto.randomUUID(), retry: attempt + 1, maxRetries: decided.maxRetries, mode: 'normal', delayMs,
            provider: decided.provider || undefined,
            failure: { code: decided.code, ...(decided.upstreamStatus != null ? { status: decided.upstreamStatus } : {}) },
            until: Date.now() + delayMs,
        };
        await ctx.fns.procs.db.run({ sql: 'UPDATE agents SET llm_retry_attempt = ?, llm_retry_pending = ?::jsonb WHERE id = ?', params: [attempt + 1, JSON.stringify(payload), opts.agentId] });
        await ctx.fns.session.appendEvent({ id: opts.agentId, event: payload });
        return { scheduled: true };
    } }) as { scheduled: boolean; parkUntil?: number };
}

/** Resolves the provider id of a stored model route without failing the retry path. */
async function providerOf(opts: { ctx: Context; model: unknown }): Promise<string | undefined> {
    if (typeof opts.model !== 'string' || !opts.model) return undefined;
    try { return (await opts.ctx.fns.models.resolveRoute({ route: opts.model })).provider; }
    catch { return undefined; }
}
