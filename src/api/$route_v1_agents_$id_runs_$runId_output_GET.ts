/**
 * Returns the retained live output of a running tool call from a stream offset.
 *
 * An expanded running row fetches from 0 once, then from its last `end` on every refresh, so the shown output has no gaps or duplicates even after a reconnect. `start` above zero means older output was dropped by the per-run cap. Finished or unknown runs and foreign agents answer 404.
 * @param opts.req HTTP request with an optional `from` query parameter (stream offset, default 0).
 * @param opts.params Route parameters containing the agent id and the running call id.
 */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    const access = await ctx.fns.tools.authorizeRunRead({ req: opts.req, agentId: opts.params.id!, runId: opts.params.runId! });
    if (access.response) return access.response;
    const run = access.run;
    const from = Math.max(0, Math.floor(Number(new URL(opts.req.url).searchParams.get("from") ?? 0) || 0));
    const start = run.outputStart;
    const end = start + run.output.length;
    const at = Math.min(Math.max(from, start), end);
    return Response.json(
        { start, from: at, end, text: run.output.slice(at - start) },
        { headers: { "cache-control": "no-store" } },
    );
}
