/** Disarm task-owned triggers and invalidate queued firings in the task-end transaction.
 * Appends one cancellation lifecycle entry per disarmed trigger; publishes refresh hints once the caller's transaction closes.
 * Internal only. Caller holds the owner agent and reservation locks for every supplied reservation.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Reservations locked by the trusted task-end operation. */
    reservationIds: string[];
}): Promise<{ agentIds: string[] }> {
    if (!ctx.state.procs?.db?.transactionStorage?.getStore()?.active) throw new Error('Task end requires a transaction');
    if (!opts.reservationIds.length) return { agentIds: [] };
    const ids = opts.reservationIds.map(() => '?::uuid').join(',');
    const now = Date.now();
    // The reservation lock prevents new bindings. Each UPDATE takes a row lock;
    // lock all triggers before touching any delivery (including multi-task revoke).
    const cancelled = ((await ctx.fns.procs.db.run({ sql: `UPDATE agent_triggers SET status='cancelled', next_at=NULL,
        claim_token=NULL, claimed_at=NULL, updated_at=?, finished_at=?
        WHERE task_reservation_id IN (${ids}) AND status IN ('active','checking','paused') RETURNING id,agent_id,kind,prompt,config,timezone`, params: [now, now, ...opts.reservationIds] })).rows ?? []) as Record<string, any>[];
    const owners = new Map<string, typeof cancelled>();
    for (const row of cancelled) owners.set(String(row.agent_id), [...(owners.get(String(row.agent_id)) ?? []), row]);
    for (const [agentId, rows] of owners) await ctx.fns.agent.triggerLifecycleEvents({ agentId, transition: 'cancelled', rows: rows as any[], cause: 'task' });
    await ctx.fns.procs.db.run({ sql: `UPDATE agent_trigger_deliveries SET state='invalidated', settled_at=?
        WHERE reservation_id IN (${ids}) AND state='pending'`, params: [now, ...opts.reservationIds] });
    if (owners.size) await ctx.fns.agent.publishTriggerChange({ agentIds: [...owners.keys()], reason: 'trigger-cancelled', afterTransaction: true });
    return { agentIds: [...owners.keys()] };
}
