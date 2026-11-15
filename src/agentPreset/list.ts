/** List stored presets in menu order, breaking sort-order ties by identifier. */
export default async function (ctx: Context, _session: Session | null, _opts: {}): Promise<types.agentPreset.Preset[]> {
    return await ctx.fns.procs.db.select({ sql: 'SELECT * FROM agent_presets ORDER BY sort_order, id' });
}
