/** Read durable task status for the caller's already selected delegated children.
 * No scheduler/cache state is consulted. A waiting child remains unfinished.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Child identifiers from the caller's ownership-scoped projection. */ sourceAgentIds: string[];
}): Promise<Record<string,{taskState:string;blockedReason:string|null;blockedAt:number|null;armedTriggerCount:number}>> {
    if(!opts.sourceAgentIds.length) return {};
    const rows=await ctx.fns.procs.db.select({sql:`SELECT source_agent_id,task_state,blocked_reason,blocked_at,
        (SELECT count(*) FROM agent_triggers WHERE task_reservation_id=r.reservation_id AND status IN ('active','checking')) AS armed
        FROM goal_delegation_reservations r WHERE source_agent_id IN (${opts.sourceAgentIds.map(()=>'?').join(',')})`,params:opts.sourceAgentIds});
    return Object.fromEntries(rows.map(r=>[r.source_agent_id,{taskState:String(r.task_state),blockedReason:r.blocked_reason??null,
        blockedAt:r.blocked_at==null?null:Number(r.blocked_at),armedTriggerCount:Number(r.armed)}]));
}
