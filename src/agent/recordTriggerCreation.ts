/**
 * Record who created a trigger and add its creation entry when needed
 *
 * Internal; call inside the creation transaction right after the insert. Stores the creating agent and its enclosing tool-call id (from agent.toolCallScope, never from caller arguments). Rejects an agent arming its own trigger while its session is in PLAN mode. The owner's chat gets a creation entry unless the owner itself created the trigger through a recorded tool call, whose card shows a badge instead.
 * @param opts.triggerId Newly inserted trigger.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Newly inserted trigger. */
        triggerId: string;
    },
): Promise<{ agentId: string; entry: boolean }> {
    const scope = await ctx.fns.agent.toolCallScope({ action: 'read' }) as { agentId: string; toolCallId: string } | undefined;
    const creatorAgentId = scope?.agentId ?? (typeof session?.agentId === 'string' ? session.agentId : null);
    const toolCallId = scope?.toolCallId ?? null;
    // PLAN is advisory, but an agent's own tool call must not arm work for its planning session.
    if (scope) {
        const [owner] = await ctx.fns.procs.db.select({ sql: 'SELECT agent_id FROM agent_triggers WHERE id=?', params: [opts.triggerId] });
        if (owner && String(owner.agent_id) === scope.agentId && (await ctx.fns.planning.read({ agentId: scope.agentId })).mode === 'plan')
            throw Object.assign(new Error('Planning mode: no trigger was created. Ask the person to approve the plan or leave planning first.'), { status: 409, code: 'planning' });
    }
    const [row] = await ctx.fns.procs.db.select({ sql: `UPDATE agent_triggers SET created_by_agent_id=?,created_by_tool_call_id=? WHERE id=?
        RETURNING id,agent_id,kind,prompt,config,timezone,next_at`, params: [creatorAgentId, toolCallId, opts.triggerId] });
    if (!row) throw new Error('Trigger creation record missing');
    const agentId = String(row.agent_id);
    const visibleCall = !!toolCallId && creatorAgentId === agentId;
    if (!visibleCall) await ctx.fns.agent.triggerLifecycleEvents({ agentId, transition: 'created', rows: [row as any],
        cause: creatorAgentId ? 'agent' : 'manual', creatorAgentId });
    return { agentId, entry: !visibleCall };
}
