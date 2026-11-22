/** Persist a rendered human turn and its exact typed command metadata, then schedule one run. */
export default async function (ctx: Context, _session: Session | null, opts: types.commands.ActionInput & {
    /** Human content to append (the exact command for /trigger). */ content: string;
    /** Disallow active or claimed runs, without rejecting queued requests. */ rejectActive?: boolean;
}): Promise<types.commands.ActionResult> {
    const {agentId, command, text, args, requestId, operationId} = opts;
    return await ctx.fns.procs.db.transaction({fn: async (): Promise<types.commands.ActionResult> => {
        const [row] = await ctx.fns.procs.db.select({sql: 'SELECT id, archived_at FROM agents WHERE id=? FOR UPDATE', params: [agentId]});
        if (!row || row.archived_at != null) throw new Error('Session unavailable');
        if (opts.rejectActive && !(await ctx.fns.commands.triggerAvailable({agentId})).enabled) throw new Error('Stop the current run before sending /trigger');
        const now = Date.now();
        const message = await ctx.fns.session.appendMessage({id: agentId, clientRequestId: requestId, message: {role: 'user', content: opts.content, message_type: 'message'}});
        await ctx.fns.session.appendEvent({id: agentId, ts: now, event: {type: 'user', text: opts.content, messageIdx: message.idx, ts: now, command: {name: command.name, kind: command.kind, text, argsText: args, requestId, operationId}}});
        await ctx.fns.procs.db.run({sql: 'UPDATE agents SET stopped_at=NULL,last_error=NULL,next_run_at=GREATEST(COALESCE(next_run_at,0),?),updated_at=? WHERE id=?', params: [now, now, agentId]});
        return {status: 'completed', result: {messageIdx: message.idx}, response: {scheduled: true, messageIdx: message.idx, sendAt: now, attachments: []}};
    }}) as types.commands.ActionResult;
}
