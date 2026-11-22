/** Claim a visible command, execute its registered kind outside the transaction, and persist the result. */
export default async function (ctx: Context, session: Session | null, opts: {
    /** Existing target session. */ agentId: string;
    /** Entire typed command (preserved in human-facing metadata). */ text: string;
    /** Stable client key, 1–200 characters. */ requestId: string;
}): Promise<Record<string, unknown>> {
    const {agentId, text, requestId} = opts;
    const fail = (status: number, code: string, message: string): never => {throw Object.assign(new Error(message), {status, code});};
    if (!requestId || requestId.length > 200) fail(400, 'invalid_request', 'Invalid requestId');
    if (text.length > 200000) fail(413, 'command_too_long', 'Command is too long');
    const active = ctx.state.commands.activeOperations ??= new Set<string>();
    const priorSql = 'SELECT command_text,result FROM agent_command_requests WHERE agent_id=? AND request_id=?';
    const replay = async (row: Record<string, any>) => {
        if (row.command_text !== text) fail(409, 'idempotency_conflict', 'Idempotency key reused for a different command');
        const stored = typeof row.result === 'string' ? JSON.parse(row.result) : row.result;
        if (stored.status === 'running' && !active.has(stored.operationId)) {
            const error = 'The operation owner is no longer available. Inspect the session before starting a new attempt.';
            Object.assign(stored, {ok: false, status: 'interrupted', error, finishedAt: Date.now()});
            await ctx.fns.procs.db.run({sql: 'UPDATE agent_command_requests SET result=?::jsonb WHERE agent_id=? AND request_id=?', params: [JSON.stringify(stored), agentId, requestId]});
            await ctx.fns.commands.recordEvent({agentId, type: 'command_result', commandName: stored.command, commandText: text, requestId, operationId: stored.operationId, status: 'interrupted', text: error, error});
        }
        return {...stored, duplicate: true};
    };
    // Replays must work even if this very request scheduled work, or its plugin was removed.
    const existing = await ctx.fns.procs.db.transaction({fn: async () => {
        const [row] = await ctx.fns.procs.db.select({sql: priorSql + ' FOR UPDATE', params: [agentId, requestId]});
        return row ? replay(row) : null;
    }}) as Record<string, unknown> | null;
    if (existing) return existing;
    const parsed = await ctx.fns.commands.parse({text, agentId});
    if (!parsed) return fail(400, 'invalid_command', 'Expected a slash command');
    const [entry] = await ctx.fns.commands.candidates({agentId, name: parsed.name});
    const command = entry?.command;
    const kind = command && ctx.state.commands.kinds?.[command.kind];
    const execute = kind?.dispatch;
    const operationId = Bun.randomUUIDv7();
    const claim = await ctx.fns.procs.db.transaction({fn: async () => {
        const [owner] = await ctx.fns.procs.db.select({sql: 'SELECT id,archived_at FROM agents WHERE id=? FOR UPDATE', params: [agentId]});
        if (!owner) fail(404, 'not_found', 'Agent not found');
        const [prior] = await ctx.fns.procs.db.select({sql: priorSql + ' FOR UPDATE', params: [agentId, requestId]});
        if (prior) return replay(prior);
        if (!command || !kind || !entry) return fail(400, 'unknown_command', `Unknown command /${parsed.name}`);
        if (!execute) fail(400, 'client_only', 'This command runs only in the client');
        if (!entry.enabled) fail(409, entry.code ?? 'command_unavailable', entry.reason ?? 'Command is disabled');
        if (owner!.archived_at != null) fail(409, 'archived', 'Restore this archived chat first');
        const [message] = await ctx.fns.procs.db.select({sql: 'SELECT idx FROM messages WHERE agent_id=? AND client_request_id=? LIMIT 1', params: [agentId, requestId]});
        if (message) fail(409, 'idempotency_conflict', 'Idempotency key already belongs to a chat message');
        if (command.blockWhileRunning) {
            await ctx.fns.planning.assertIdle({agentId});
            const [running] = await ctx.fns.procs.db.select({sql: "SELECT request_id FROM agent_command_requests WHERE agent_id=? AND result->>'command'=? AND result->>'status'='running' LIMIT 1", params: [agentId, parsed.name]});
            if (running) fail(409, 'command_running', 'Another command is pending; retry its original request key to inspect it');
        }
        const accepted = {ok: true, command: parsed.name, requestId, operationId, status: 'running', scheduled: false, createdAt: Date.now()};
        await ctx.fns.procs.db.run({sql: 'INSERT INTO agent_command_requests(agent_id,request_id,command_text,result) VALUES (?,?,?,?::jsonb)', params: [agentId, requestId, text, JSON.stringify(accepted)]});
        await ctx.fns.commands.recordEvent({agentId, type: 'command_invocation', commandName: parsed.name, commandText: text, requestId, operationId, status: 'running', text});
        active.add(operationId); // Visible before commit: a retry must never recover a live claim.
        return accepted;
    }}).catch(error => { active.delete(operationId); throw error; }) as Record<string, unknown>;
    if ('duplicate' in claim) return claim;
    let outcome: types.commands.ActionResult;
    try {
        outcome = await execute!(ctx, session, {agentId, text, requestId, operationId, command: command!, args: parsed.args});
        if (!outcome || !['completed','running'].includes(outcome.status)) throw new Error('Invalid command handler result');
    } catch (error) {
        try { return await ctx.fns.commands.finishOperation({agentId, requestId, operationId, error: String((error as Error).message ?? error)}); }
        finally { active.delete(operationId); }
    }
    return ctx.fns.commands.finishOperation({agentId, requestId, operationId, outcome}).catch(error => {
        // The handler is no longer executing; a retry can report the uncertain outcome.
        active.delete(operationId);
        throw error;
    });
}
