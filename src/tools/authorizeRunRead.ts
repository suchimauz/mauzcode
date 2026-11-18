// Who may read a running call's live data (output, arguments).
//
// The same exact-ownership rule as the source-message reader: a signed-in user
// sees only agents they created; open and legacy shared-password instances
// only see ownerless agents. Unknown and foreign agents answer the same 404 so
// the route does not reveal which agents exist. The run must belong to the
// agent in the URL — a run id alone is not a capability.
/**
 * Authorizes an HTTP read of a running tool call's live output or arguments.
 *
 * Use from routes that expose live run data; returns the run when the caller owns the agent and the run is still executing for it, otherwise a 401/404 response.
 * @param opts.req Incoming HTTP request used to resolve the current user.
 * @param opts.agentId Agent id from the route.
 * @param opts.runId Running call id from the route.
 */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Incoming HTTP request used to resolve the current user. */
        req: Request;
        /** Agent id from the route. */
        agentId: string;
        /** Running call id from the route. */
        runId: string;
    },
): Promise<{ run: types.tools.ToolRun; response?: undefined } | { run?: undefined; response: Response }> {
    const headers = { "cache-control": "no-store" };
    const who = await ctx.fns.auth.currentUser({ req: opts.req });
    if (who.required && !who.user && !who.legacy) return { response: Response.json({ error: "unauthorized" }, { status: 401, headers }) };
    const owner = (await ctx.fns.procs.db.select({ sql: "SELECT created_by FROM agents WHERE id = ?", params: [opts.agentId] }))[0];
    if (!owner || (who.user ? owner.created_by !== who.user.id : owner.created_by != null)) {
        return { response: Response.json({ error: "not_found", message: "Agent not found" }, { status: 404, headers }) };
    }
    const run = ctx.fns.tools.runs({ agentId: opts.agentId }).find(item => item.id === opts.runId);
    if (!run) return { response: Response.json({ error: "not_found", message: "No such running tool call" }, { status: 404, headers }) };
    return { run };
}
