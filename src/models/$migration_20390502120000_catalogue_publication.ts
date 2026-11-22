/** Account binding and per-connection publication order; legacy snapshots remain untagged. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({ sql: `ALTER TABLE llm_connections
            ADD COLUMN IF NOT EXISTS models_cache_generation TEXT,
            ADD COLUMN IF NOT EXISTS models_refresh_ticket BIGINT NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS models_published_ticket BIGINT NOT NULL DEFAULT 0` });
    },
    async down(ctx: Context) {
        await ctx.fns.procs.db.exec({ sql: `ALTER TABLE llm_connections DROP COLUMN IF EXISTS models_cache_generation,
            DROP COLUMN IF EXISTS models_refresh_ticket, DROP COLUMN IF EXISTS models_published_ticket` });
    },
};
