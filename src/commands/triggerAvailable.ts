/** Allow a queued /trigger request, but not one sent during a claimed or streaming run. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Session receiving the request. */ agentId: string;
}): Promise<{enabled: boolean; reason?: string}> {
    const [row] = await ctx.fns.procs.db.select({sql: 'SELECT run_state FROM agents WHERE id=?', params: [opts.agentId]});
    const live = ctx.state.agent?.[opts.agentId];
    if (!row || row.run_state === 'running' || row.run_state === 'claimed' || live?.isStreaming || (live?.activeRunCount ?? 0) > 0) {
        return {enabled: false, reason: 'Stop the current run before sending /trigger'};
    }
    return {enabled: true};
}
