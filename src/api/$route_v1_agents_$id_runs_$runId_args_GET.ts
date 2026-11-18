/**
 * Returns the complete, secret-redacted arguments of a running tool call.
 *
 * Used when the arguments were too large for the live activity payload (`argsLarge`); finished or unknown runs and foreign agents answer 404.
 * @param opts.req Incoming HTTP request.
 * @param opts.params Route parameters containing the agent id and the running call id.
 */
export default async function (ctx: Context, _session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    const access = await ctx.fns.tools.authorizeRunRead({ req: opts.req, agentId: opts.params.id!, runId: opts.params.runId! });
    if (access.response) return access.response;
    return Response.json({ args: access.run.args }, { headers: { "cache-control": "no-store" } });
}
