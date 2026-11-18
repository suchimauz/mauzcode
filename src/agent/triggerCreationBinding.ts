/** Resolve the reservation for a trigger insert inside its creation transaction. Caller-supplied identity is only the target, never authority.
 * @param opts.agentId Target agent of the insert.
 */
export default async function (ctx: Context, _session: Session | null, opts: { agentId: string }): Promise<string | null> {
    if (!(await ctx.fns.settings.get({module:'agent',scopeType:'global',key:'triggerTaskWait'}) === true) || !await ctx.fns.goal.enabled({})) return null;
    const scope = await ctx.fns.goal.delegationScope({action:'read'}) as {sourceAgentId:string;parentCapabilityId?:string} | undefined;
    if (scope?.sourceAgentId !== opts.agentId || !scope.parentCapabilityId) return null;
    const a = await ctx.fns.goal.delegationCapture({agentId:opts.agentId});
    if (!a?.parentCapabilityId) throw new Error('Missing executing task grant');
    await ctx.fns.goal.delegationAuthorize({rootAgentId:a.rootAgentId, goalId:a.goalId, sourceAgentId:a.sourceAgentId, sourceRunId:a.runToken, sourceRunToken:a.runToken, capabilityId:a.parentCapabilityId});
    const [grant] = await ctx.fns.procs.db.select({sql:`SELECT r.reservation_id FROM goal_delegation_reservations r
        JOIN goal_delegations d ON d.reservation_id=r.reservation_id JOIN agents a ON a.id=r.source_agent_id
        JOIN agent_goals g ON g.agent_id=r.root_agent_id AND g.goal_id=r.goal_id
        WHERE d.capability_id=?::uuid AND r.source_agent_id=? AND r.task_state='open' AND r.cancelled_at IS NULL AND g.status='active'
        AND coalesce(a.scratchpad::jsonb#>>'{delegation,status}','')<>'ready' AND coalesce(a.scratchpad::jsonb#>>'{delegateTask,status}','')<>'finished' FOR UPDATE OF r`,params:[a.parentCapabilityId,opts.agentId]});
    if (!grant) throw new Error('Executing task grant is no longer open');
    const [count] = await ctx.fns.procs.db.select({sql:"SELECT count(*) AS armed FROM agent_triggers WHERE task_reservation_id=?::uuid AND status IN ('active','checking')",params:[grant.reservation_id]});
    if (Number(count?.armed) >= 5) throw new Error('Task already has 5 armed bound triggers');
    return String(grant.reservation_id);
}
