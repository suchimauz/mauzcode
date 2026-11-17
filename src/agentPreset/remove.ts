/** Delete a custom preset unless it is the configured default; retained agent snapshots are unaffected. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Custom preset identifier to delete. */
    id: string;
}): Promise<boolean> {
    if (ctx.fns.agentPreset.defaults({}).some(preset => preset.id === opts.id)) throw new Error(`Cannot delete built-in preset: ${opts.id}. Create or edit a custom copy with a distinct identifier instead.`);
    const defaultId = await ctx.fns.settings.getString({ module: 'agentPreset', scopeType: 'global', key: 'default', fallback: 'standard' });
    if (opts.id === defaultId) throw new Error(`Cannot delete default preset: ${opts.id}`);
    const preset = await ctx.fns.agentPreset.get({ id: opts.id });
    if (preset?.builtin) throw new Error(`Cannot delete built-in preset: ${opts.id}. Create or edit a custom copy with a distinct identifier instead.`);
    const rows = await ctx.fns.procs.db.select({ sql: 'DELETE FROM agent_presets WHERE id = ? AND builtin = false RETURNING id', params: [opts.id] });
    return rows.length > 0;
}
