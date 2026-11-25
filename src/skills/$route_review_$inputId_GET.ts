/** Serve one skill review as JSON for the native React card; read-only, owner-only. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Incoming browser request. */ req: Request;
    /** Route parameters with the review input id. */ params: Record<string, string>;
}): Promise<Response> {
    const headers = { 'cache-control': 'no-store', vary: 'Cookie', 'x-content-type-options': 'nosniff' };
    try {
        return Response.json(await ctx.fns.skills.add.view({ req: opts.req, inputId: String(opts.params.inputId ?? '') }), { headers });
    } catch (error) {
        const e = error as Error & { status?: number };
        return Response.json({ error: e.message }, { status: e.status ?? 400, headers });
    }
}
