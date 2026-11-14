/** Copy the legacy llm.openaiApiKey secret reference to embeddings.openaiApiKey without reading or exposing the secret value; existing embeddings rows win. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.run({
            sql: `INSERT INTO settings (module, scope_type, scope_id, key, value, is_secret, updated_at)
                  SELECT 'embeddings', scope_type, scope_id, 'openaiApiKey', value, is_secret, updated_at FROM settings
                  WHERE module = 'llm' AND key = 'openaiApiKey' AND scope_type = 'global'
                  ON CONFLICT (module, scope_type, scope_id, key) DO NOTHING`,
            params: [],
        });
    },
};
