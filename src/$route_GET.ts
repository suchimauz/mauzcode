/** Serve the native React home surface when the frontend interceptor delegates to the root route.
 * @param opts.req Authenticated incoming browser request.
 * @param opts.params Root route parameters.
 */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Authenticated incoming request. */ req: Request;
    /** Root route parameters. */ params: Record<string, string>;
}): Promise<Response> {
    const url = new URL(opts.req.url); url.pathname = '/ui-lab/';
    return await ctx.fns.frontendBridge.proxy({ req: new Request(url.toString(), { method: opts.req.method, headers: opts.req.headers }) }) ?? new Response('UI route unavailable', { status: 502 });
}
