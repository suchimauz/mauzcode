export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({sql:`
            ALTER TABLE agent_triggers ADD COLUMN IF NOT EXISTS task_reservation_id uuid REFERENCES goal_delegation_reservations(reservation_id) ON DELETE SET NULL,
                DROP CONSTRAINT agent_triggers_status_check,
                ADD CONSTRAINT agent_triggers_status_check CHECK (status IN ('active','checking','completed','timed_out','cancelled','paused'));
            CREATE INDEX IF NOT EXISTS agent_triggers_task_status ON agent_triggers(task_reservation_id,status);
            ALTER TABLE agent_trigger_runs DROP CONSTRAINT agent_trigger_runs_outcome_check,
                ADD CONSTRAINT agent_trigger_runs_outcome_check CHECK (outcome IN ('fired','waiting','rearmed','timed_out','error','coalesced','invalidated'));
            CREATE TABLE IF NOT EXISTS agent_trigger_deliveries (
                trigger_id text NOT NULL REFERENCES agent_triggers(id) ON DELETE CASCADE,
                firing_key bigint NOT NULL, agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
                message_idx bigint NOT NULL, reservation_id uuid REFERENCES goal_delegation_reservations(reservation_id) ON DELETE SET NULL,
                state text NOT NULL CHECK (state IN ('pending','consumed','invalidated')), created_at bigint NOT NULL, settled_at bigint,
                PRIMARY KEY(trigger_id,firing_key), UNIQUE(agent_id,message_idx));
            CREATE INDEX IF NOT EXISTS agent_trigger_deliveries_pending ON agent_trigger_deliveries(reservation_id,trigger_id) WHERE state='pending';`});
    },
    async down(ctx: Context) {
        // Keep all receipts and authority. Clearing bindings could admit stale firings as ordinary input.
        await ctx.fns.procs.db.transaction({fn:async()=>{
            const now = Date.now();
            await ctx.fns.procs.db.run({sql:"UPDATE goal_delegation_reservations SET task_state='blocked',blocked_at=?,blocked_reason='rollback' WHERE task_state='waiting'",params:[now]});
            await ctx.fns.procs.db.run({sql:"UPDATE agent_triggers SET status='paused',claim_token=NULL,claimed_at=NULL,updated_at=? WHERE task_reservation_id IS NOT NULL AND status IN ('active','checking')",params:[now]});
        }});
    },
};
