// Additive rollout: the down operation is a safety transition, not schema destruction.
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({sql: `ALTER TABLE goal_delegation_reservations
            DROP CONSTRAINT goal_delegation_reservations_task_state_check,
            ADD CONSTRAINT goal_delegation_reservations_task_state_check CHECK (task_state IN ('pending_review','open','waiting','blocked','closed','cancelled')),
            ADD COLUMN IF NOT EXISTS blocked_reason text CHECK (blocked_reason IN ('trigger_cancelled','watch_timed_out','rollback')),
            ADD COLUMN IF NOT EXISTS blocked_at bigint`});
    },
    async down(ctx: Context) {
        await ctx.fns.procs.db.run({sql: "UPDATE goal_delegation_reservations SET task_state='blocked',blocked_reason='rollback',blocked_at=? WHERE task_state='waiting'",params:[Date.now()]});
    },
};
