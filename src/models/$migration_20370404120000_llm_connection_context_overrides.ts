/** Owner context-window overrides per exact model id on a connection; empty by default, deleted with the connection. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({sql: `ALTER TABLE llm_connections ADD COLUMN IF NOT EXISTS model_context_overrides JSONB NOT NULL DEFAULT '{}'::jsonb`});
    },
    async down(ctx: Context) {
        await ctx.fns.procs.db.exec({sql: `ALTER TABLE llm_connections DROP COLUMN IF EXISTS model_context_overrides`});
    },
};
