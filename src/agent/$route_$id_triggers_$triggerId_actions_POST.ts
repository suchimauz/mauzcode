/** Apply one replay-safe Run/Check now or Cancel action to a single owned trigger from the chat panel. Requires owner authorization and the cookie-bound `x-csrf-token`; body `{ requestId, action: 'run' | 'cancel' }`. Returns the actual outcome, never a firing.
 * @param opts.req Incoming JSON POST request.
 * @param opts.params Exact agent id and triggerId route parameters.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming HTTP request. */
    req: Request;
    /** Exact agent and trigger identifiers. */
    params: Record<string, string>;
}): Promise<Response> {
    const headers = { 'Cache-Control': 'no-store' };
    try {
        const agentId = opts.params.id!;
        await ctx.fns.goal.surfaceAuthorize({ req: opts.req, agentId, csrfToken: opts.req.headers.get('x-csrf-token') ?? '' });
        const body = await opts.req.json().catch(() => null) as { requestId?: unknown; action?: unknown } | null;
        const action = body?.action, requestId = body?.requestId;
        if ((action !== 'run' && action !== 'cancel') || typeof requestId !== 'string') return Response.json({ error: 'invalid_request', message: 'Expected requestId and action' }, { status: 400, headers });
        const result = await ctx.fns.agent.triggerAction({ agentId, triggerId: opts.params.triggerId!, action, requestId });
        return Response.json(result, { headers });
    } catch (error) {
        const e = error as Error & { status?: number; code?: string };
        return Response.json({ error: e.code ?? 'trigger_action_failed', message: e.status ? e.message : 'Trigger action failed' }, { status: e.status ?? 500, headers });
    }
}
