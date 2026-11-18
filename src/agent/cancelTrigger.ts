/**
 * Cancels one durable agent trigger
 *
 * Cancel one pending time, cron or condition trigger owned by the specified agent. Cancellation is idempotent and a trigger already being checked will not deliver after its claim is invalidated. A committed cancellation adds one lifecycle entry to the owner's chat; a no-op adds none. Inside a caller transaction the caller publishes refreshes after commit.
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
): Promise<{ cancelled: boolean; kind?: string; purpose?: string }> {
    const now = Date.now();
    const apply = async () => {
        await ctx.fns.procs.db.select({sql:'SELECT id FROM agents WHERE id=? FOR UPDATE',params:[opts.id]});
        await ctx.fns.procs.db.select({sql:'SELECT reservation_id FROM goal_delegation_reservations WHERE source_agent_id=? FOR UPDATE',params:[opts.id]});
        const rows = await ctx.fns.procs.db.select({sql:"UPDATE agent_triggers SET status='cancelled',next_at=NULL,claim_token=NULL,claimed_at=NULL,updated_at=?,finished_at=? WHERE agent_id=? AND id=? AND status IN ('active','checking') RETURNING id,kind,prompt,config,timezone,task_reservation_id",params:[now,now,opts.id,opts.triggerId]});
        if (rows.length) await ctx.fns.agent.triggerLifecycleEvents({agentId:opts.id,transition:'cancelled',rows:rows as any[],cause:'manual'});
        for (const reservationId of new Set(rows.map(row=>String(row.task_reservation_id??'')).filter(Boolean))) {
            await ctx.fns.agent.reconcileTriggerWait({reservationId,reason:'trigger_cancelled',now});
        }
        const row = rows[0];
        return row ? {cancelled:true, kind:String(row.kind), purpose:ctx.fns.agent.triggerPurpose({prompt:String(row.prompt ?? '')})} : {cancelled:false};
    };
    const inTransaction = ctx.state.procs?.db?.transactionStorage?.getStore()?.active;
    const result = inTransaction ? await apply() : await ctx.fns.procs.db.transaction({fn:apply}) as Awaited<ReturnType<typeof apply>>;
    if (!inTransaction) {
        ctx.fns.agent.wakeWorker({});
        if (result.cancelled) await ctx.fns.agent.publishTriggerChange({agentIds:[opts.id],reason:'trigger-cancelled'});
    }
    return result;
}
