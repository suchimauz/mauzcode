/** Block a waiting reservation only after its last armed trigger and pending receipt disappear. The caller holds the agent and reservation locks in a transaction.
 * @param opts.reservationId Locked task reservation.
 * @param opts.reason Persisted reason the last trigger disappeared.
 * @param opts.now Time of the transition.
 */
export default async function (ctx: Context, _session: Session | null, opts: { reservationId: string; reason: 'trigger_cancelled' | 'watch_timed_out'; now: number }): Promise<void> {
    if (!ctx.state.procs?.db?.transactionStorage?.getStore()?.active) throw new Error('Trigger reconciliation requires a transaction');
    await ctx.fns.procs.db.run({sql:`UPDATE goal_delegation_reservations r SET task_state='blocked', blocked_reason=?, blocked_at=?
        WHERE reservation_id=?::uuid AND task_state='waiting' AND cancelled_at IS NULL
        AND NOT EXISTS(SELECT 1 FROM agent_triggers WHERE task_reservation_id=r.reservation_id AND status IN ('active','checking'))
        AND NOT EXISTS(SELECT 1 FROM agent_trigger_deliveries WHERE reservation_id=r.reservation_id AND state='pending')`,params:[opts.reason,opts.now,opts.reservationId]});
}
