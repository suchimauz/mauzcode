/** Move legacy built-ins out of storage without losing editable definitions. Forward-only: downgrade requires an approved backup/restore procedure. */
export default {
    up: async (ctx: Context) => {
        const defaults = ctx.fns.agentPreset.defaults({});
        const reserved = new Map(defaults.map(preset => [preset.id, preset]));
        const mappings: Array<{ from: string; to: string }> = [];
        await ctx.fns.procs.db.transaction({ fn: async () => {
            // Conflicts with INSERT/UPDATE/DELETE and itself, but permits catalogue reads.
            // Acquire before reading so concurrent migration/writer commits are visible.
            await ctx.fns.procs.db.exec({ sql: 'LOCK TABLE agent_presets IN SHARE ROW EXCLUSIVE MODE' });
            const rows = await ctx.fns.procs.db.select({ sql: 'SELECT * FROM agent_presets ORDER BY id' });
            const occupied = new Set([...reserved.keys(), ...rows.map(row => String(row.id))]);
            const scalars = ['name', 'description', 'sort_order', 'prompt'] as const;
            const arrays = ['allow', 'deny', 'plugins', 'exclude_sections'] as const;
            const setKey = (value: string[]) => JSON.stringify([...new Set(value)].sort());
            for (const row of rows) {
                const factory = reserved.get(row.id);
                if (!factory) {
                    if (row.builtin) await ctx.fns.procs.db.run({ sql: 'UPDATE agent_presets SET builtin = false WHERE id = ?', params: [row.id] });
                    continue;
                }
                const equal = scalars.every(key => row[key] === factory[key])
                    && arrays.every(key => setKey(row[key]) === setKey(factory[key]));
                if (!equal) {
                    let suffix = 1;
                    for (;;) {
                        const id = `${row.id}-custom${suffix === 1 ? '' : `-${suffix}`}`;
                        suffix++;
                        if (occupied.has(id)) continue;
                        // ON CONFLICT keeps a uniqueness race recoverable without aborting
                        // the transaction or overwriting any existing custom definition.
                        const inserted = await ctx.fns.procs.db.select({
                            sql: `INSERT INTO agent_presets
                                (id, name, description, sort_order, builtin, allow, deny, plugins, exclude_sections, prompt, updated_at)
                                SELECT ?, name || ' (preserved custom)', description, sort_order, false,
                                    allow, deny, plugins, exclude_sections, prompt, updated_at
                                FROM agent_presets WHERE id = ?
                                ON CONFLICT (id) DO NOTHING RETURNING id`,
                            params: [id, row.id],
                        });
                        occupied.add(id);
                        if (inserted.length) {
                            mappings.push({ from: row.id, to: id });
                            break;
                        }
                    }
                }
                await ctx.fns.procs.db.run({ sql: 'DELETE FROM agent_presets WHERE id = ?', params: [row.id] });
            }
        } });
        // Report only committed identifiers, never definitions or prompt contents.
        for (const mapping of mappings) ctx.fns.procs.log.info({
            event: 'agentPreset.preserved', msg: `${mapping.from} -> ${mapping.to}`,
        });
        return { preserved: mappings };
    },
};
