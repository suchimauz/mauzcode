/** Apply the claimed planning toggle and accept any explicit task in the same transaction. */
export default async function (ctx: Context, session: Session | null, opts: types.commands.ActionInput): Promise<types.commands.ActionResult> {
    // planning.* is advertised to Standard agents; this human toggle is not an agent capability.
    if (session?.kind === 'agent' || session?.agentId || session?.agent || !ctx.state.commands.activeOperations?.has(opts.operationId)) {
        throw Object.assign(new Error('Planning toggle requires a claimed human command'), {status: 403});
    }
    const {agentId, text, args, requestId, operationId} = opts;
    const task = args === 'off' ? '' : args;
    const accepted = await ctx.fns.procs.db.transaction({fn: async () => {
        await ctx.fns.planning.assertIdle({agentId});
        const now = Date.now();
        const state = await ctx.fns.planning.read({agentId});
        const mode = args ? (args === 'off' ? 'execute' : 'plan') : (state.mode === 'plan' ? 'execute' : 'plan');
        if (state.proposal?.status === 'pending') await ctx.fns.procs.db.run({sql: "UPDATE inputs SET state='cancelled',error='Planning command superseded this proposal',updated_at=? WHERE id=? AND state='open'", params: [now, state.proposal.inputId]});
        await ctx.fns.procs.db.run({sql: 'INSERT INTO agent_planning(agent_id,mode,revision,proposal,updated_at) VALUES (?,?,1,NULL,?) ON CONFLICT(agent_id) DO UPDATE SET mode=excluded.mode,revision=agent_planning.revision+1,proposal=NULL,updated_at=excluded.updated_at', params: [agentId, mode, now]});
        let messageIdx: number | undefined;
        if (task) {
            const message = await ctx.fns.session.appendMessage({id: agentId, message: {role: 'user', content: task, message_type: 'planning_task'}});
            messageIdx = message.idx;
            await ctx.fns.session.appendEvent({id: agentId, ts: now, event: {type: 'user', text: task, messageIdx, ts: now, command: {name: opts.command.name, text, argsText: task, requestId, operationId}}});
            await ctx.fns.procs.db.run({sql: 'UPDATE agents SET stopped_at=NULL,last_error=NULL,next_run_at=?,updated_at=? WHERE id=?', params: [now, now, agentId]});
        }
        const planning = await ctx.fns.planning.read({agentId});
        return {planning, scheduled: !!task, ...(messageIdx === undefined ? {} : {messageIdx, sendAt: now}), attachments: [] as never[]};
    }}) as NonNullable<types.commands.ActionResult['response']> & {planning: types.planning.State};
    await ctx.fns.planning.publish({agentId, proposal: true, operationId, requestId});
    return {status: 'completed', result: accepted.planning, response: accepted, summary: accepted.planning.mode === 'execute' ? 'Planning mode disabled' : task ? 'Planning mode enabled; task accepted' : 'Planning mode enabled (advisory, not a sandbox)'};
}
