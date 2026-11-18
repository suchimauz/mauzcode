/**
 * Cancels one durable agent trigger
 *
 * Cancel one pending time, cron or condition trigger owned by the specified agent. Cancellation is idempotent and a trigger already being checked will not deliver after its claim is invalidated.
 * @param opts.id Owning agent identifier.
 * @param opts.triggerId Trigger identifier returned by wake, cron or watch.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Owning agent identifier. */
        id: string;
        /** Trigger identifier returned by wake, cron or watch. */
        triggerId: string;
    },
): Promise<{ cancelled: boolean }> {
    const now = Date.now();
    const count = await ctx.fns.procs.db.transaction({fn:async()=>{
        await ctx.fns.procs.db.select({sql:'SELECT id FROM agents WHERE id=? FOR UPDATE',params:[opts.id]});
        await ctx.fns.procs.db.select({sql:'SELECT reservation_id FROM goal_delegation_reservations WHERE source_agent_id=? FOR UPDATE',params:[opts.id]});
        const rows = await ctx.fns.procs.db.select({sql:"UPDATE agent_triggers SET status='cancelled',next_at=NULL,claim_token=NULL,claimed_at=NULL,updated_at=?,finished_at=? WHERE agent_id=? AND id=? AND status IN ('active','checking') RETURNING task_reservation_id",params:[now,now,opts.id,opts.triggerId]});
        for (const reservationId of new Set(rows.map(row=>String(row.task_reservation_id??'')).filter(Boolean))) {
            await ctx.fns.agent.reconcileTriggerWait({reservationId,reason:'trigger_cancelled',now});
        }
        return rows.length;
    }}) as number;
    ctx.fns.agent.wakeWorker({});
    return {cancelled:count > 0};
}
