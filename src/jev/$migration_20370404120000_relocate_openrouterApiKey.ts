/** Copy the legacy llm.openrouterApiKey secret reference to jev.openrouterApiKey without reading or exposing the secret value; existing jev rows win. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.run({
            sql: `INSERT INTO settings (module, scope_type, scope_id, key, value, is_secret, updated_at)
                  SELECT 'jev', scope_type, scope_id, 'openrouterApiKey', value, is_secret, updated_at FROM settings
                  WHERE module = 'llm' AND key = 'openrouterApiKey' AND scope_type = 'global'
                  ON CONFLICT (module, scope_type, scope_id, key) DO NOTHING`,
            params: [],
        });
    },
};
