/**
 * Resolve desktop alert support and validate a scoped occurrence.
 *
 * Checks the active user and signed session, then re-reads canonical ownership and eligibility for one retained occurrence. Never accepts an agent ID from the client.
 * @param opts.req Current authenticated HTTP request.
 * @param opts.id Optional opaque occurrence identifier to revalidate.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Current authenticated HTTP request. */
        req: Request;
        /** Optional opaque occurrence identifier to revalidate. */
        id?: string;
    },
): Promise<{owner:string; scope:string; agentId?:string; kind?:string} | null> {
    const {user,required}=await ctx.fns.auth.currentUser({req:opts.req});
    if(!user || !required) return null;
    const token=new Bun.CookieMap(opts.req.headers.get('cookie')??'').get(ctx.fns.procs.auth.cookieName({}));
    if(!token) return null;
    const binding=await ctx.fns.webPush.sessionBinding({token});
    if(!binding || binding.ownerId!==user.id || binding.expiresAt<=Date.now()) return null;
    const access={owner:user.id,scope:binding.key};
    if(opts.id===undefined) return access;
    const record=(ctx.state as any).events?.desktopOccurrences?.get(opts.id);
    if(!record || record.owner!==user.id || record.expires<=Date.now()) return null;
    const gate=record.kind==='input-pending'?"EXISTS (SELECT 1 FROM inputs WHERE agent_id=a.id AND id=? AND state='open')":"a.updated_at=? AND a.run_state='idle' AND a.run_token IS NULL AND a.next_run_at IS NULL AND a.wake_at IS NULL AND a.last_error IS NULL AND NOT EXISTS (SELECT 1 FROM inputs WHERE agent_id=a.id AND state IN ('open','processing'))";
    const [row]=await ctx.fns.procs.db.select({sql:"SELECT a.id FROM agents a WHERE a.id=? AND a.created_by=? AND a.parent_id IS NULL AND a.archived_at IS NULL AND a.stopped_at IS NULL AND COALESCE(a.visibility,'nav')='nav' AND "+gate,params:[record.agentId,user.id,record.kind==='input-pending'?record.token:record.at]});
    return row?{...access,agentId:String(row.id),kind:record.kind}:null;
}
