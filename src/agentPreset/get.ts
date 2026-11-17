/** Read a code-defined built-in or stored custom preset without resolving defaults; missing identifiers return null. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Exact built-in or custom preset identifier. */
    id: string;
}): Promise<types.agentPreset.Preset | null> {
    const builtin = ctx.fns.agentPreset.defaults({}).find(preset => preset.id === opts.id);
    if (builtin) return structuredClone(builtin);
    const rows = await ctx.fns.procs.db.select({ sql: 'SELECT * FROM agent_presets WHERE id = ? AND builtin = false', params: [opts.id] });
    return rows[0] ? structuredClone(rows[0]) : null;
}
