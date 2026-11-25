/**
 * Start one ordinary turn for an accepted /skill.<origin>:<name> command.
 *
 * Called by the skill command kind after the command receipt is claimed. Re-reads the skill as the target agent through skills.read, then, in one transaction, appends the user's exact command text as the user message, a synthetic completed read_skill({id}) call with its result, and schedules one run. Nothing is appended or scheduled if the skill is unavailable, and there is no fallback to another skill. Snapshots without skill reading are told to open a new chat.
 * @param opts.agentId Target session.
 * @param opts.command Derived skill command entry with its canonical ID.
 * @param opts.text Entire submitted slash command, kept verbatim as the user message.
 * @param opts.args Task text after the command token.
 * @param opts.requestId Stable client submission key.
 * @param opts.operationId Server-generated identity of this command operation.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: types.commands.ActionInput,
): Promise<types.commands.ActionResult> {
    const { agentId, command, text, args, requestId, operationId } = opts;
    const id = command.name!;
    const agent = ctx.state.agent?.[agentId] ?? await ctx.fns.session.load({ id: agentId });
    if (!agent.preset || !ctx.fns.agentPreset.allows({ snapshot: agent.preset, name: 'skills.read' })) {
        throw new Error('This chat was created without skill access. Open a new chat to use /' + id + '.');
    }
    const scoped = Object.create(ctx) as Context;
    scoped.session = ctx.fns.session.forAgent({ agent });
    const result = await scoped.fns.tools.call({ name: 'read_skill', agent, args: { id } }).catch((error: Error) => ({ output: 'Error: ' + error.message, isError: true }));
    if (result.isError) throw new Error(String(result.output).replace(/^Error: /, '') || '/' + id + ' is not available');
    const skill = (command as { skill?: { source?: string; name?: string } }).skill ?? {};
    const callId = 'skill_' + operationId.replace(/[^A-Za-z0-9]/g, '').slice(-24);
    return await ctx.fns.procs.db.transaction({ fn: async (): Promise<types.commands.ActionResult> => {
        const [row] = await ctx.fns.procs.db.select({ sql: 'SELECT id, archived_at FROM agents WHERE id=? FOR UPDATE', params: [agentId] });
        if (!row || row.archived_at != null) throw new Error('Session unavailable');
        const now = Date.now();
        const commandMeta = { name: id, kind: 'skill', text, argsText: args, requestId, operationId, skill: { id, name: skill.name ?? id.split(':')[1], source: skill.source ?? '' } };
        const message = await ctx.fns.session.appendMessage({ id: agentId, clientRequestId: requestId, message: { role: 'user', content: text, message_type: 'message' } });
        await ctx.fns.session.appendEvent({ id: agentId, ts: now, event: { type: 'user', text, messageIdx: message.idx, ts: now, command: commandMeta } });
        // The skill load is recorded exactly as if the model had called read_skill itself.
        const call = await ctx.fns.session.appendMessage({ id: agentId, message: { role: 'assistant', content: '', tool_calls: [{ id: callId, name: 'read_skill', args: { id } }], excluded_from_cursor: true } });
        const stored = await ctx.fns.agent.stashResult({ agent, output: String(result.output), kind: 'read_skill' });
        await ctx.fns.session.appendMessage({ id: agentId, message: { role: 'tool', tool_call_id: callId, content: stored.content, excluded_from_cursor: true, result_ref: stored.result_ref ?? null } });
        await ctx.fns.session.appendToolCallEvent({ id: agentId, ts: now, payload: { name: 'read_skill', args: { id }, result: stored.content, result_ref: stored.result_ref ?? null, isError: false, toolCallId: callId, messageIdx: call.idx } });
        await ctx.fns.procs.db.run({ sql: 'UPDATE agents SET stopped_at=NULL,last_error=NULL,next_run_at=GREATEST(COALESCE(next_run_at,0),?),updated_at=? WHERE id=?', params: [now, now, agentId] });
        return { status: 'completed', result: { messageIdx: message.idx, skill: id }, response: { scheduled: true, messageIdx: message.idx, sendAt: now, attachments: [] } };
    } }) as types.commands.ActionResult;
}
