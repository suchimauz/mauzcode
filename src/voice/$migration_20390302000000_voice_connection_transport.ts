/**
 * Add the per-connection voice transport, stored apart from the provider configuration.
 *
 * NULL means the connection predates transports (or never chose one) and uses `direct`. A stored value is only
 * `{kind:"direct"}`, `{kind:"socks",proxyId}` or `{kind:"ssh-tunnel",instance}`: references to saved
 * infrastructure, never credentials.
 */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({ sql: `ALTER TABLE voice_connections ADD COLUMN IF NOT EXISTS transport JSONB` });
    },
    async down(ctx: Context) {
        await ctx.fns.procs.db.exec({ sql: `ALTER TABLE voice_connections DROP COLUMN IF EXISTS transport` });
    },
};
