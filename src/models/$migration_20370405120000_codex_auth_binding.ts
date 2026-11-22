/** No identity backfill: only a fresh OAuth response can establish the account binding. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({ sql: `ALTER TABLE llm_connections
            ADD COLUMN IF NOT EXISTS codex_generation TEXT,
            ADD COLUMN IF NOT EXISTS codex_credential_revision BIGINT NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS codex_refresh_owner TEXT,
            ADD COLUMN IF NOT EXISTS codex_refresh_until BIGINT,
            ADD COLUMN IF NOT EXISTS codex_login_intent TEXT` });
    },
    async down(ctx: Context) {
        await ctx.fns.procs.db.exec({ sql: `ALTER TABLE llm_connections
            DROP COLUMN IF EXISTS codex_generation,
            DROP COLUMN IF EXISTS codex_credential_revision,
            DROP COLUMN IF EXISTS codex_refresh_owner,
            DROP COLUMN IF EXISTS codex_refresh_until,
            DROP COLUMN IF EXISTS codex_login_intent` });
    },
};
