/** Additive storage for chat trigger management: creator identity on triggers and replay receipts for row/conversational actions. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({sql:`
            ALTER TABLE agent_triggers ADD COLUMN IF NOT EXISTS created_by_agent_id text,
                ADD COLUMN IF NOT EXISTS created_by_tool_call_id text;
            CREATE INDEX IF NOT EXISTS agent_triggers_creator_call ON agent_triggers(created_by_agent_id,created_by_tool_call_id) WHERE created_by_tool_call_id IS NOT NULL;
            CREATE INDEX IF NOT EXISTS agent_triggers_armed ON agent_triggers(agent_id,next_at,id) WHERE status IN ('active','checking');
            CREATE TABLE IF NOT EXISTS agent_trigger_action_requests (
                agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
                request_id text NOT NULL,
                action text NOT NULL CHECK (action IN ('run','cancel')),
                trigger_id text NOT NULL,
                result jsonb NOT NULL,
                created_at bigint NOT NULL,
                PRIMARY KEY(agent_id,request_id)
            );`});
    },
    // Rollback keeps receipts, creator columns and history: dropping them could replay user actions.
    async down(_ctx: Context) {},
};
