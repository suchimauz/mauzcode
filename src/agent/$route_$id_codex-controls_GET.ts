/** Read the signed-in owner's cache-only Codex control and reset projection. */
export default async function(ctx:Context,_session:Session|null,opts:{req:Request;params:Record<string,string>}):Promise<Response>{
    return ctx.fns.session.codexControlsSurface({req:opts.req,agentId:opts.params.id!});
}
