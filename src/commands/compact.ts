/** Compact an already claimed session outside the command transactions. */
export default async function (ctx: Context, _session: Session | null, opts: types.commands.ActionInput): Promise<types.commands.ActionResult> {
    const agent = ctx.state.agent?.[opts.agentId] ?? await ctx.fns.session.load({id: opts.agentId});
    if (!agent) throw new Error('Agent not found');
    const result = await ctx.fns.agent.compactContext({agent, ...(opts.args ? {instructions: opts.args} : {})});
    return {status: 'completed', result, summary: 'Context compaction: ' + result.status};
}
