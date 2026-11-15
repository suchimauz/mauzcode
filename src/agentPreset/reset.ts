/** Restore a shipped built-in definition, including a missing row, without changing existing agent snapshots. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Shipped built-in identifier: standard, creator or minimal. */
    id: string;
}): Promise<types.agentPreset.Preset> {
    const p = ctx.fns.agentPreset.defaults({}).find(preset => preset.id === opts.id);
    if (!p) throw new Error(`Cannot reset non-built-in preset: ${opts.id}`);
    const rows = await ctx.fns.procs.db.select({
        sql: `INSERT INTO agent_presets (id, name, description, sort_order, builtin, allow, deny, plugins, exclude_sections, prompt, updated_at)
            VALUES (?, ?, ?, ?, true, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?)
            ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order,
            builtin = true, allow = EXCLUDED.allow, deny = EXCLUDED.deny, plugins = EXCLUDED.plugins,
            exclude_sections = EXCLUDED.exclude_sections, prompt = EXCLUDED.prompt, updated_at = EXCLUDED.updated_at RETURNING *`,
        params: [p.id, p.name, p.description, p.sort_order, JSON.stringify(p.allow), JSON.stringify(p.deny), JSON.stringify(p.plugins), JSON.stringify(p.exclude_sections), p.prompt, Date.now()],
    });
    return rows[0]!;
}
