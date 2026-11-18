/**
 * Accept a /trigger chat command as one ordinary human request to the current agent
 *
 * Deduplicates by request key in agent_command_requests, appends the exact command text as a human message (arguments stay data, never system instructions) and schedules one normal turn. Never changes planning mode or a pending review. Acceptance means the request was received, not that a trigger exists or fired.
 * @param opts.agentId Existing target session.
 * @param opts.text Exact /trigger command text.
 * @param opts.requestId Client idempotency key reused on transport retries.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Existing target session. */
        agentId: string;
        /** Exact /trigger command text. */
        text: string;
        /** Client idempotency key reused on transport retries. */
        requestId: string;
    },
): Promise<Record<string, unknown>> {
    const text = opts.text.trim();
    const fail = (status: number, code: string, message: string): never => { throw Object.assign(new Error(message), { status, code }); };
    if (!/^\/trigger(?:\s|$)/.test(text) || text.length > 200000) fail(400, 'invalid_command', 'Invalid /trigger command');
    if (!opts.requestId || opts.requestId.length > 200) fail(400, 'invalid_request', 'Invalid requestId');
    const argsText = text.slice('/trigger'.length).trim();
    const operationId = Bun.randomUUIDv7();
    const result = await ctx.fns.procs.db.transaction({ fn: async () => {
        const [row] = await ctx.fns.procs.db.select({ sql: 'SELECT id,archived_at,run_state FROM agents WHERE id=? FOR UPDATE', params: [opts.agentId] });
        if (!row) fail(404, 'not_found', 'Agent not found');
        const [prior] = await ctx.fns.procs.db.select({ sql: 'SELECT command_text,result FROM agent_command_requests WHERE agent_id=? AND request_id=?', params: [opts.agentId, opts.requestId] });
        if (prior) {
            if (prior.command_text !== text) fail(409, 'idempotency_conflict', 'Idempotency key reused for a different command');
            return { ...(typeof prior.result === 'string' ? JSON.parse(prior.result) : prior.result), duplicate: true };
        }
        const [priorMessage] = await ctx.fns.procs.db.select({ sql: 'SELECT idx FROM messages WHERE agent_id=? AND client_request_id=? LIMIT 1', params: [opts.agentId, opts.requestId] });
        if (priorMessage) fail(409, 'idempotency_conflict', 'Idempotency key already belongs to a chat message');
        if (row.archived_at != null) fail(409, 'archived', 'Restore this archived chat first');
        const live = ctx.state.agent?.[opts.agentId];
        if (row.run_state === 'running' || row.run_state === 'claimed' || (live?.activeRunCount ?? 0) > 0 || live?.isStreaming) fail(409, 'agent_running', 'Stop the current run before sending /trigger');
        const now = Date.now();
        const message = await ctx.fns.session.appendMessage({ id: opts.agentId, clientRequestId: opts.requestId, message: { role: 'user', content: text, message_type: 'message' } });
        await ctx.fns.session.appendEvent({ id: opts.agentId, ts: now, event: { type: 'user', text, messageIdx: message.idx, ts: now, command: { name: 'trigger', text, argsText, requestId: opts.requestId, operationId } } });
        await ctx.fns.procs.db.run({ sql: 'UPDATE agents SET stopped_at=NULL,last_error=NULL,next_run_at=GREATEST(COALESCE(next_run_at,0),?),updated_at=? WHERE id=?', params: [now, now, opts.agentId] });
        const accepted = { ok: true, command: 'trigger', requestId: opts.requestId, operationId, status: 'completed', scheduled: true, createdAt: now, finishedAt: now, messageIdx: message.idx, sendAt: now, attachments: [] };
        await ctx.fns.procs.db.run({ sql: 'INSERT INTO agent_command_requests(agent_id,request_id,command_text,result) VALUES (?,?,?,?::jsonb)', params: [opts.agentId, opts.requestId, text, JSON.stringify(accepted)] });
        return accepted;
    } }) as Record<string, unknown>;
    if (!result.duplicate) {
        try {
            const live = ctx.state.agent?.[opts.agentId];
            if (live) await ctx.fns.session.syncAgentState({ agent: live });
            ctx.fns.procs.events.refresh({ topic: 'agent:' + opts.agentId, reason: 'command' });
        } catch (error) { console.error('Trigger command accepted; refresh failed', error); }
        ctx.fns.agent.wakeWorker({});
    }
    return result;
}
