/** End a task and its inherited task grants while the root worker holds the root agent lock.
 * Internal transaction hook shared by cancellation and capability revocation. All claim generations
 * of a task share its fate; even a not-yet-consumed descendant can own a reservation.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Locked accounting owner. */ rootAgentId: string;
    /** Verified current goal. */ goalId: string;
    /** Target task for cancellation. */ reservationId?: string;
    /** Target claim for revocation. */ capabilityId?: string;
    /** Persisted cancellation reason. */ reason: string;
}): Promise<void> {
    if (!ctx.state.procs?.db?.transactionStorage?.getStore()?.active) throw new Error('Grant end requires a transaction');
    // Nodes are reservation or capability IDs, kept distinct even if their UUIDs coincide.
    const affected = await ctx.fns.procs.db.select({sql:`WITH RECURSIVE edges(from_id,to_id) AS (
        SELECT 'r:'||reservation_id, 'c:'||capability_id FROM goal_delegations WHERE root_agent_id=? AND goal_id=?::uuid AND reservation_id IS NOT NULL
        UNION ALL SELECT 'c:'||capability_id, 'r:'||reservation_id FROM goal_delegations WHERE root_agent_id=? AND goal_id=?::uuid AND reservation_id IS NOT NULL
        UNION ALL SELECT 'c:'||parent_capability_id, 'r:'||reservation_id FROM goal_delegation_reservations WHERE root_agent_id=? AND goal_id=?::uuid AND parent_capability_id IS NOT NULL
        UNION ALL SELECT 'c:'||parent_capability_id, 'c:'||capability_id FROM goal_delegations WHERE root_agent_id=? AND goal_id=?::uuid AND parent_capability_id IS NOT NULL
    ), affected(id) AS (SELECT ?::text UNION SELECT e.to_id FROM affected a JOIN edges e ON e.from_id=a.id)
    SELECT r.reservation_id,r.source_agent_id FROM goal_delegation_reservations r JOIN affected a ON a.id='r:'||r.reservation_id
    WHERE r.root_agent_id=? AND r.goal_id=?::uuid ORDER BY r.source_agent_id`, params:[opts.rootAgentId,opts.goalId,opts.rootAgentId,opts.goalId,opts.rootAgentId,opts.goalId,opts.rootAgentId,opts.goalId,opts.reservationId ? 'r:'+opts.reservationId : 'c:'+opts.capabilityId,opts.rootAgentId,opts.goalId]});
    if(opts.reservationId && !affected.some(r=>r.reservation_id===opts.reservationId)) throw new Error('Reservation scope mismatch');
    if(!affected.length) return;
    const ids = affected.map(r=>String(r.reservation_id));
    const fields = ids.map(()=>'?::uuid').join(',');
    await ctx.fns.procs.db.select({sql:`SELECT id FROM agents WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY id FOR UPDATE`,params:affected.map(r=>r.source_agent_id)});
    await ctx.fns.procs.db.select({sql:`SELECT reservation_id FROM goal_delegation_reservations WHERE reservation_id IN (${fields}) ORDER BY reservation_id FOR UPDATE`,params:ids});
    const now = Date.now();
    await ctx.fns.procs.db.run({sql:`UPDATE goal_delegation_reservations SET task_state='cancelled',retry_from_run_id=NULL,
        blocked_reason=NULL,blocked_at=NULL,cancelled_at=COALESCE(cancelled_at,?),cancel_reason=COALESCE(cancel_reason,?)
        WHERE reservation_id IN (${fields}) AND task_state NOT IN ('closed','cancelled')`,params:[now,opts.reason,...ids]});
    await ctx.fns.procs.db.run({sql:`UPDATE goal_delegations SET revoked_at=COALESCE(revoked_at,?) WHERE reservation_id IN (${fields})`,params:[now,...ids]});
    await ctx.fns.goal.delegationEndTriggers({reservationIds:ids});
}
