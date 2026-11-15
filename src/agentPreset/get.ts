/** Read one stored preset without resolving defaults; missing identifiers return null. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Exact stored preset identifier. */
    id: string;
}): Promise<types.agentPreset.Preset | null> {
    const rows = await ctx.fns.procs.db.select({ sql: 'SELECT * FROM agent_presets WHERE id = ?', params: [opts.id] });
    return rows[0] ?? null;
}
