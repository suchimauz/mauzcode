/** Chat consent is opt-in. Keep the edit clock even when the last override is removed. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({sql: `CREATE TABLE IF NOT EXISTS codex_control_revisions (
            agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            connection_id UUID NOT NULL REFERENCES llm_connections(id) ON DELETE CASCADE,
            model_id TEXT NOT NULL, revision BIGINT NOT NULL,
            PRIMARY KEY(agent_id,connection_id,model_id));
        CREATE TABLE IF NOT EXISTS codex_control_choices (
            agent_id TEXT NOT NULL, connection_id UUID NOT NULL, model_id TEXT NOT NULL,
            generation TEXT NOT NULL, speed TEXT CHECK(speed IN ('fast','ultrafast')),
            verbosity TEXT CHECK(verbosity IN ('low','medium','high')), CHECK(speed IS NOT NULL OR verbosity IS NOT NULL),
            PRIMARY KEY(agent_id,connection_id,model_id), FOREIGN KEY(agent_id,connection_id,model_id)
            REFERENCES codex_control_revisions(agent_id,connection_id,model_id) ON DELETE CASCADE);
        CREATE INDEX IF NOT EXISTS codex_control_choices_conn ON codex_control_choices(connection_id);
        CREATE TABLE IF NOT EXISTS codex_control_notices (
            id UUID PRIMARY KEY, agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            message TEXT NOT NULL, created_at BIGINT NOT NULL, claim_id UUID, claim_until BIGINT, acknowledged BOOLEAN NOT NULL DEFAULT FALSE);
        CREATE INDEX IF NOT EXISTS codex_control_notices_pending ON codex_control_notices(agent_id,created_at,id) WHERE NOT acknowledged`});
    },
    async down(ctx: Context) {
        await ctx.fns.procs.db.exec({sql:'DROP TABLE IF EXISTS codex_control_notices, codex_control_choices, codex_control_revisions'});
    },
};
