/** List fresh code-defined built-ins and stored custom presets by sort order then identifier; reserved IDs always use code. */
export default async function (ctx: Context, _session: Session | null, _opts: {}): Promise<types.agentPreset.Preset[]> {
    const builtins = ctx.fns.agentPreset.defaults({});
    const reserved = new Set(builtins.map(preset => preset.id));
    const custom: types.agentPreset.Preset[] = await ctx.fns.procs.db.select({ sql: 'SELECT * FROM agent_presets WHERE builtin = false' });
    return structuredClone([...builtins, ...custom.filter(preset => !reserved.has(preset.id))]
        .sort((a, b) => a.sort_order - b.sort_order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}
