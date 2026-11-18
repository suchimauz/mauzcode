/** Disarm task-owned triggers and invalidate queued firings in the task-end transaction.
 * Internal only. Caller holds the owner agent and reservation locks for every supplied reservation.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Reservations locked by the trusted task-end operation. */
    reservationIds: string[];
}): Promise<void> {
    if (!ctx.state.procs?.db?.transactionStorage?.getStore()?.active) throw new Error('Task end requires a transaction');
    if (!opts.reservationIds.length) return;
    const ids = opts.reservationIds.map(() => '?::uuid').join(',');
    const now = Date.now();
    // The reservation lock prevents new bindings. Each UPDATE takes a row lock;
    // lock all triggers before touching any delivery (including multi-task revoke).
    await ctx.fns.procs.db.run({ sql: `UPDATE agent_triggers SET status='cancelled', next_at=NULL,
        claim_token=NULL, claimed_at=NULL, updated_at=?, finished_at=?
        WHERE task_reservation_id IN (${ids}) AND status IN ('active','checking','paused')`, params: [now, now, ...opts.reservationIds] });
    await ctx.fns.procs.db.run({ sql: `UPDATE agent_trigger_deliveries SET state='invalidated', settled_at=?
        WHERE reservation_id IN (${ids}) AND state='pending'`, params: [now, ...opts.reservationIds] });
}
