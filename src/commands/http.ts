/**
 * Expose chat command discovery and authenticated structured dispatch
 *
 * GET lists the command catalog and CSRF token. POST accepts a command and request key, verifies human HTTP authorization, and delegates atomic dispatch.
 * @param opts.req Authenticated HTTP request.
 * @param opts.agentId Agent from the route path (mobile GET or web POST).
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Authenticated HTTP request. */
        req: Request;
        /** Agent from the route path (mobile GET or web POST). */
        agentId?: string;
    },
): Promise<Response> {
    try {
    await ctx.fns.projects.principal({});
    if (opts.req.method === 'GET') {
        const query = new URL(opts.req.url).searchParams;
        const version = query.get('version') ?? (opts.agentId ? '2' : '1');
        if (version !== '1' && version !== '2') return Response.json({error: 'unsupported_catalogue_version'}, {status: 400});
        const agentId = opts.agentId ?? query.get('agentId') ?? undefined;
        const catalogue = await ctx.fns.commands.catalogue({agentId, version: version === '1' ? 1 : 2,
            ...(agentId ? {} : {projectId: query.get('projectId') ?? undefined, presetId: query.get('presetId') ?? undefined})});
        return Response.json({...catalogue, csrfToken: await ctx.fns.auth.csrfToken({req: opts.req})}, {headers: {'cache-control': 'no-store'}});
    }
    if(!await ctx.fns.auth.verifyCsrf({req:opts.req,token:opts.req.headers.get('x-csrf-token')??''})) return Response.json({error:'invalid_csrf'},{status:403});
    const body=await opts.req.json() as {text?:string;requestId?:string};
    if(!opts.agentId||typeof body.text!=='string') return Response.json({error:'invalid_command'},{status:400});
    const accepted=await ctx.fns.commands.dispatch({agentId:opts.agentId,text:body.text,requestId:body.requestId||opts.req.headers.get('idempotency-key')||Bun.randomUUIDv7()});
    return Response.json(accepted,{status:accepted.status==='running'?202:200});
    } catch(error) {const e=error as Error & {status?:number;code?:string};return Response.json({error:e.code??'invalid_command',message:e.message},{status:e.status??400});}
}
