/** Resolve one desktop alert using the requesting profile's current signed session. */
export default async function(ctx:Context,_session:Session|null,opts:{/** Incoming request with profile cookies. */req:Request}):Promise<Response>{
    const id=new URL(opts.req.url).searchParams.get('id');
    const access=id && /^[a-f0-9]{64}$/.test(id) ? await ctx.fns.events.desktopAccess({req:opts.req,id}) : null;
    const validate=access && (ctx.state as any).events?.desktopOccurrences?.get(id)?.issued.has(access.scope);
    return Response.json(validate && access ? {version:1,scope:access.scope,kind:access.kind,agentId:access.agentId} : null,{status:validate?200:404,headers:{'Cache-Control':'no-store'}});
}
