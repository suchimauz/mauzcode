/** Store preset rules and preserve unrestricted access for every pre-preset agent. */
export default {
    up: async (ctx: Context) => {
        await ctx.fns.procs.db.exec({ sql: `
            CREATE TABLE IF NOT EXISTS agent_presets (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                sort_order INTEGER NOT NULL DEFAULT 0,
                builtin BOOLEAN NOT NULL DEFAULT false,
                allow JSONB NOT NULL DEFAULT '[]',
                deny JSONB NOT NULL DEFAULT '[]',
                plugins JSONB NOT NULL DEFAULT '[]',
                exclude_sections JSONB NOT NULL DEFAULT '[]',
                prompt TEXT NOT NULL DEFAULT '',
                updated_at BIGINT NOT NULL
            );
            ALTER TABLE agents ADD COLUMN IF NOT EXISTS preset_id TEXT;
            ALTER TABLE agents ADD COLUMN IF NOT EXISTS preset_snapshot JSONB;
        ` });
        const defaults = ctx.fns.agentPreset.defaults({});
        for (const preset of defaults) {
            await ctx.fns.procs.db.run({
                sql: `INSERT INTO agent_presets
                    (id, name, description, sort_order, builtin, allow, deny, plugins, exclude_sections, prompt, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?)
                    ON CONFLICT (id) DO NOTHING`,
                params: [preset.id, preset.name, preset.description, preset.sort_order, preset.builtin,
                    JSON.stringify(preset.allow), JSON.stringify(preset.deny), JSON.stringify(preset.plugins),
                    JSON.stringify(preset.exclude_sections), preset.prompt, Date.now()],
            });
        }
        const creator = defaults.find(preset => preset.id === 'creator')!;
        const snapshot: types.agentPreset.Snapshot = {
            presetId: creator.id,
            name: creator.name,
            layers: [{ id: creator.id, allow: creator.allow, deny: creator.deny, plugins: creator.plugins,
                excludeSections: creator.exclude_sections, prompt: creator.prompt }],
        };
        await ctx.fns.procs.db.run({
            sql: `UPDATE agents SET preset_id = 'creator', preset_snapshot = ?::jsonb
                WHERE preset_snapshot IS NULL`,
            params: [JSON.stringify(snapshot)],
        });
    },
    down: async (ctx: Context) => {
        await ctx.fns.procs.db.exec({ sql: `
            ALTER TABLE agents DROP COLUMN IF EXISTS preset_snapshot;
            ALTER TABLE agents DROP COLUMN IF EXISTS preset_id;
            DROP TABLE IF EXISTS agent_presets;
        ` });
    },
};
