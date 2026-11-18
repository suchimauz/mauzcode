/**
 * Cancels all pending durable triggers for an agent
 *
 * Cancel every active or currently checking time, cron and condition trigger owned by one agent. Use when stopping all deferred autonomous work for that agent.
 * @param opts.id Agent whose triggers should be cancelled.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Agent whose triggers should be cancelled. */
        id: string;
    },
): Promise<{ cancelled: number }> {
    const now = Date.now();
    const count = await ctx.fns.procs.db.transaction({fn:async()=>{
        await ctx.fns.procs.db.select({sql:'SELECT id FROM agents WHERE id=? FOR UPDATE',params:[opts.id]});
        await ctx.fns.procs.db.select({sql:'SELECT reservation_id FROM goal_delegation_reservations WHERE source_agent_id=? FOR UPDATE',params:[opts.id]});
        const rows = await ctx.fns.procs.db.select({sql:"UPDATE agent_triggers SET status='cancelled',next_at=NULL,claim_token=NULL,claimed_at=NULL,updated_at=?,finished_at=? WHERE agent_id=? AND status IN ('active','checking') RETURNING task_reservation_id",params:[now,now,opts.id]});
        for (const reservationId of new Set(rows.map(row=>String(row.task_reservation_id??'')).filter(Boolean))) {
            await ctx.fns.agent.reconcileTriggerWait({reservationId,reason:'trigger_cancelled',now});
        }
        return rows.length;
    }}) as number;
    ctx.fns.agent.wakeWorker({});
    return {cancelled:count};
}
