/**
 * Add voice connection storage; secret field values live encrypted in local_secrets under namespace `voice`.
 *
 * The table stores only presence: `secrets` maps a declared secret field key to `true`, never to a value and
 * never to a `secret://` reference. The encrypted value itself is written to `local_secrets` under the
 * deterministic name `<connection id>.<field>`, so a connection row can never leak a reference.
 */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({sql: `CREATE TABLE IF NOT EXISTS voice_connections (
            id UUID PRIMARY KEY,
            provider TEXT NOT NULL,
            account_name TEXT NOT NULL CHECK (length(btrim(account_name)) BETWEEN 1 AND 100),
            config JSONB NOT NULL DEFAULT '{}'::jsonb,
            secrets JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS voice_connections_provider_idx ON voice_connections (provider, created_at);
        CREATE UNIQUE INDEX IF NOT EXISTS voice_connections_provider_account_unique ON voice_connections (provider, account_name)`});
    },
    async down(ctx: Context) {
        await ctx.fns.procs.db.exec({sql: `DELETE FROM local_secrets WHERE namespace = 'voice' AND name ~ '^[0-9a-f-]{36}\\.';
        DROP TABLE IF EXISTS voice_connections`});
    },
};
