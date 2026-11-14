/** Enforce provider/account route identity before any agent route migration. Existing duplicates abort without rewriting or deleting data. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({ sql: "CREATE UNIQUE INDEX IF NOT EXISTS llm_connections_provider_account_unique ON llm_connections(provider, account_name)" });
    },
    async down(ctx: Context) {
        await ctx.fns.procs.db.exec({ sql: "DROP INDEX IF EXISTS llm_connections_provider_account_unique" });
    },
};
