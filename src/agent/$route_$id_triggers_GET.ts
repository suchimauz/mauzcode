/** Read the owner-authorized armed-trigger projection of one agent for the chat panel: counts by kind and sorted safe rows, never predicate configuration or results.
 * @param opts.req Incoming GET request.
 * @param opts.params Exact agent id route parameter.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming HTTP request. */
    req: Request;
    /** Exact agent identifier. */
    params: Record<string, string>;
}): Promise<Response> {
    const headers = { 'Cache-Control': 'no-store', Vary: 'Cookie' };
    try {
        const agentId = opts.params.id!;
        await ctx.fns.goal.surfaceAuthorize({ req: opts.req, agentId });
        return Response.json({ agentId, ...await ctx.fns.agent.armedTriggers({ id: agentId }) }, { headers });
    } catch (error) {
        const e = error as Error & { status?: number };
        return Response.json({ message: e.status ? e.message : 'Triggers unavailable' }, { status: e.status ?? 500, headers });
    }
}
