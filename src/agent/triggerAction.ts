/**
 * Apply one replay-safe run-now or cancel action to a single trigger
 *
 * Shared boundary for chat row controls and conversational /trigger actions. Looks up the per-agent request key first, then records the normalized action, target and actual result in the same transaction as the state change. An identical retry returns the stored result without another side effect, even after the worker fired; reusing the key for another action or target is rejected with 409. Planning mode blocks mutation without changing the mode or any pending review. Ownership and grants are the caller's responsibility.
 * @param opts.agentId Owning agent identifier.
 * @param opts.triggerId Exact trigger of that agent.
 * @param opts.action Run/check now, or cancel.
 * @param opts.requestId Client or derived idempotency key, at most 200 characters.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Owning agent identifier. */
        agentId: string;
        /** Exact trigger of that agent. */
        triggerId: string;
        /** Run/check now, or cancel. */
        action: 'run' | 'cancel';
        /** Client or derived idempotency key, at most 200 characters. */
        requestId: string;
    },
): Promise<types.agent.TriggerActionResult> {
    const fail = (status: number, code: string, message: string): never => { throw Object.assign(new Error(message), { status, code }); };
    if (opts.action !== 'run' && opts.action !== 'cancel') fail(400, 'invalid_action', 'Unsupported trigger action');
    if (!opts.requestId || opts.requestId.length > 200) fail(400, 'invalid_request', 'Invalid requestId');
    if (!opts.triggerId || opts.triggerId.length > 200) fail(400, 'invalid_request', 'Invalid triggerId');
    const result = await ctx.fns.procs.db.transaction({ fn: async () => {
        const [agent] = await ctx.fns.procs.db.select({ sql: 'SELECT id,archived_at FROM agents WHERE id=? FOR UPDATE', params: [opts.agentId] });
        if (!agent) fail(404, 'not_found', 'Agent not found');
        const [prior] = await ctx.fns.procs.db.select({ sql: 'SELECT action,trigger_id,result FROM agent_trigger_action_requests WHERE agent_id=? AND request_id=?', params: [opts.agentId, opts.requestId] });
        if (prior) {
            if (prior.action !== opts.action || prior.trigger_id !== opts.triggerId) fail(409, 'idempotency_conflict', 'Idempotency key reused for a different trigger action');
            const stored = typeof prior.result === 'string' ? JSON.parse(prior.result) : prior.result;
            return { ...stored, duplicate: true } as types.agent.TriggerActionResult;
        }
        if (agent.archived_at != null) fail(409, 'archived', 'Restore this archived chat first');
        const planning = await ctx.fns.planning.read({ agentId: opts.agentId });
        let outcome: types.agent.TriggerActionResult['outcome'];
        let kind: string | undefined, purpose: string | undefined;
        const [own] = await ctx.fns.procs.db.select({ sql: 'SELECT kind,prompt FROM agent_triggers WHERE id=? AND agent_id=?', params: [opts.triggerId, opts.agentId] });
        if (own) { kind = String(own.kind); purpose = ctx.fns.agent.triggerPurpose({ prompt: String(own.prompt ?? '') }); }
        if (planning.mode === 'plan') outcome = 'planning';
        else if (!own) outcome = 'not_active';
        else if (opts.action === 'cancel') outcome = (await ctx.fns.agent.cancelTrigger({ id: opts.agentId, triggerId: opts.triggerId })).cancelled ? 'cancelled' : 'not_active';
        else outcome = (await ctx.fns.agent.runTriggerNow({ id: opts.agentId, triggerId: opts.triggerId })).outcome;
        const saved: types.agent.TriggerActionResult = { ok: !['not_active', 'planning', 'already_checking'].includes(outcome), action: opts.action, triggerId: opts.triggerId, requestId: opts.requestId, outcome, ...(kind ? { kind, purpose } : {}), at: Date.now() };
        // A foreign or unknown ID never records its stored data: only the requested key and outcome.
        await ctx.fns.procs.db.run({ sql: 'INSERT INTO agent_trigger_action_requests(agent_id,request_id,action,trigger_id,result,created_at) VALUES (?,?,?,?,?::jsonb,?)', params: [opts.agentId, opts.requestId, opts.action, opts.triggerId, JSON.stringify(saved), saved.at] });
        return saved;
    } }) as types.agent.TriggerActionResult;
    if (!result.duplicate) {
        if (result.outcome === 'scheduled' || result.outcome === 'deferred_paused') ctx.fns.agent.wakeWorker({});
        if (result.outcome === 'cancelled') ctx.fns.agent.wakeWorker({});
        await ctx.fns.agent.publishTriggerChange({ agentIds: [opts.agentId], reason: `trigger-${opts.action}`, transcript: result.outcome === 'cancelled' });
    }
    return result;
}
