/** Update the signed-in owner's Codex consent or present a reset notice using cookie-bound CSRF. */
export default async function(ctx:Context,_session:Session|null,opts:{req:Request;params:Record<string,string>}):Promise<Response>{
    return ctx.fns.session.codexControlsSurface({req:opts.req,agentId:opts.params.id!});
}
