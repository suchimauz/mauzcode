/** Create a custom preset after strict validation; duplicate identifiers fail without changing the existing row. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** New definition; builtin and updated_at are managed by storage. */
    preset: types.agentPreset.Definition;
}): Promise<types.agentPreset.Preset> {
    ctx.fns.agentPreset.validateDefinition({ definition: opts.preset });
    const p = opts.preset;
    const rows = await ctx.fns.procs.db.select({
        sql: `INSERT INTO agent_presets (id, name, description, sort_order, builtin, allow, deny, plugins, exclude_sections, prompt, updated_at)
            VALUES (?, ?, ?, ?, false, ?::jsonb, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?) RETURNING *`,
        params: [p.id, p.name, p.description ?? '', p.sort_order ?? 0, JSON.stringify(p.allow ?? []), JSON.stringify(p.deny ?? []), JSON.stringify(p.plugins ?? []), JSON.stringify(p.exclude_sections ?? []), p.prompt ?? '', Date.now()],
    });
    return rows[0]!;
}
