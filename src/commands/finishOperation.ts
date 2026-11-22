/** Finish a claimed (possibly asynchronous) command exactly once; never overwrite a newer or terminal result. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Session that accepted the command. */ agentId: string;
    /** Stable client request key. */ requestId: string;
    /** Operation identity supplied to the kind handler. */ operationId: string;
    /** Completed handler result. Omit when reporting an error. */ outcome?: types.commands.ActionResult;
    /** Failure reason if the handler could not complete. */ error?: string;
}): Promise<Record<string, unknown>> {
    const {agentId, requestId, operationId, outcome, error} = opts;
    let changed = false;
    const finished = await ctx.fns.procs.db.transaction({fn: async () => {
        const [row] = await ctx.fns.procs.db.select({sql: 'SELECT command_text,result FROM agent_command_requests WHERE agent_id=? AND request_id=? FOR UPDATE', params: [agentId, requestId]});
        const claim = typeof row?.result === 'string' ? JSON.parse(row.result) : row?.result;
        if (!claim || claim.operationId !== operationId) throw new Error('Command claim ownership changed');
        if (claim.status !== 'running') return claim;
        const status = error !== undefined ? 'failed' : outcome?.status;
        if (status !== 'completed' && status !== 'failed' && status !== 'running') throw new Error('Invalid command outcome');
        const saved = {...claim, ...outcome?.response, ok: status !== 'failed', status, ...(error !== undefined ? {error} : {result: outcome?.result}), ...(status === 'running' ? {} : {finishedAt: Date.now()})};
        await ctx.fns.procs.db.run({sql: 'UPDATE agent_command_requests SET result=?::jsonb WHERE agent_id=? AND request_id=?', params: [JSON.stringify(saved), agentId, requestId]});
        if (status !== 'running') await ctx.fns.commands.recordEvent({agentId, type: 'command_result', commandName: claim.command, commandText: row!.command_text, requestId, operationId, status, text: error ?? outcome?.summary ?? 'Completed', ...(error !== undefined ? {error} : {}), ...(outcome?.result && typeof outcome.result === 'object' ? {result: outcome.result as Record<string,unknown>} : {})});
        changed = true;
        return saved;
    }}) as Record<string, unknown>;
    if (!changed) return finished;
    if (finished.status !== 'running') ctx.state.commands.activeOperations?.delete(operationId);
    try {
        const live = ctx.state.agent?.[agentId];
        if (live) await ctx.fns.session.syncAgentState({agent: live});
        ctx.fns.procs.events.refresh({topic: 'agent:' + agentId, reason: 'command'});
    } catch (e) { console.error('Command accepted; refresh failed', e); }
    if (finished.scheduled) ctx.fns.agent.wakeWorker({});
    return finished;
}
