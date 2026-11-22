/** Owner-only, cache-only browser projection, edit and reset notice mailbox for an existing chat. */
export default async function(ctx: Context, _session:Session|null, opts:{
    /** Incoming browser request; mutations require the cookie-bound CSRF token. */ req:Request;
    /** Exact existing chat identifier. */ agentId:string;
}):Promise<Response> {
    const reply = (data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
    const fail = (status:number,message:string):never=>{throw Object.assign(new Error(message),{status});};
    try {
        const {req,agentId}=opts;
        const who = await ctx.fns.auth.currentUser({req});
        if (!who.required || who.legacy || !who.user || who.user.disabledAt !== null) return reply({error:'Sign in as the chat owner'},401);
        const ownerId=who.user.id;
        const mutation=req.method==='POST';
        if (!mutation && req.method!=='GET') return reply({error:'Method not allowed'},405);
        const json: unknown = mutation ? await req.json().catch(()=>null) : null;
        const input = json && typeof json === 'object' && !Array.isArray(json) ? json as Record<string, unknown> : null;
        if (mutation && (!input || typeof input.csrfToken!=='string' || !await ctx.fns.auth.verifyCsrf({req,token:input.csrfToken}))) return reply({error:'Invalid CSRF token'},403);
        if (input && (typeof input.action !== 'string' || !['save','claim','release','ack'].includes(input.action))) return reply({error:'Invalid action'},400);
        const csrfToken = await ctx.fns.auth.csrfToken({req});
        const view=await ctx.fns.procs.db.transaction({fn:async()=>{
            const authorize=async(lock:boolean)=>{
                const [row]=await ctx.fns.procs.db.select({sql:'SELECT model,created_by FROM agents WHERE id=? AND archived_at IS NULL'+(lock?' FOR UPDATE':''),params:[agentId]});
                if (!row) fail(404,'Chat not found');
                if (row.created_by!==ownerId) fail(403,'Chat owner required');
                return row.model as string;
            };
            if (input && input.action!=='save') {
                await authorize(true);
                const uuid=(s:unknown)=>typeof s==='string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s);
                if (!uuid(input.claimId)) fail(400,'Invalid presentation ID');
                if (input.action==='claim') {
                    const [notice]=await ctx.fns.procs.db.select({sql:`SELECT id,message,claim_id,claim_until FROM codex_control_notices WHERE agent_id=? AND NOT acknowledged ORDER BY created_at,id LIMIT 1 FOR UPDATE`,params:[agentId]});
                    const now=Date.now();
                    if (!notice || (notice.claim_id!==input.claimId && Number(notice.claim_until)>now)) return {notice:null};
                    await ctx.fns.procs.db.run({sql:'UPDATE codex_control_notices SET claim_id=?,claim_until=? WHERE id=?',params:[input.claimId,now+30_000,notice.id]});
                    return {notice:{id:notice.id,message:notice.message}};
                }
                if (!uuid(input.noticeId)) fail(400,'Invalid notice ID');
                const [notice]=await ctx.fns.procs.db.select({sql:'SELECT claim_id,acknowledged FROM codex_control_notices WHERE id=? AND agent_id=? FOR UPDATE',params:[input.noticeId,agentId]});
                if (!notice) fail(404,'Notice not found');
                if (notice.claim_id!==input.claimId) fail(409,'Presentation changed');
                if (!notice.acknowledged) await ctx.fns.procs.db.run({sql:input.action==='ack'?'UPDATE codex_control_notices SET acknowledged=TRUE WHERE id=?':'UPDATE codex_control_notices SET claim_id=NULL,claim_until=NULL WHERE id=?',params:[input.noticeId]});
                return {ok:true};
            }
            // Global lock order is connection, then chat. The first read only identifies the lock.
            const route=await authorize(false);
            // Match the exact canonical prefix (account names cannot contain ':' or '/').
            // The suffix is opaque: native model IDs can themselves contain either character.
            const conn=route.startsWith('codex/') ? (await ctx.fns.procs.db.select({sql:`SELECT id,account_name,enabled,disabled_models,codex_generation,models_cache_generation,models_cache,models_published_ticket FROM llm_connections WHERE provider='codex' AND starts_with(?, 'codex/' || account_name || ':') FOR UPDATE`,params:[route]}))[0] : undefined;
            if (await authorize(true)!==route || (input && input.route!==route)) fail(409,'The selected model changed; reopen the picker');
            const generation=conn?.codex_generation;
            const trusted=generation && conn.models_cache_generation===generation && Array.isArray(conn.models_cache);
            const modelId=conn ? route.slice(`codex/${conn.account_name}:`.length) : undefined;
            const enabled=conn?.enabled && !conn.disabled_models.includes(modelId) && !(await ctx.fns.models.disabledProviders({})).has('codex');
            const descriptor:types.models.ModelInfo|undefined=enabled && trusted ? conn.models_cache.find((m:types.models.ModelInfo)=>m.id===modelId) : undefined;
            const speeds=descriptor?.responseControls?.speed?.supported ?? [];
            const verbosities=descriptor?.responseControls?.verbosity?.supported ?? [];
            const key=[agentId,conn?.id,modelId];
            const where=' WHERE agent_id=? AND connection_id=? AND model_id=?';
            const state=async()=>{
                const [clock]=conn ? await ctx.fns.procs.db.select({sql:'SELECT revision FROM codex_control_revisions'+where,params:key}) : [];
                const revision=new Bun.CryptoHasher('sha256').update(JSON.stringify([agentId,route,conn?.id,generation,String(conn?.models_published_ticket??0),String(clock?.revision??0)])).digest('hex');
                const [choice]=trusted?await ctx.fns.procs.db.select({sql:'SELECT speed,verbosity FROM codex_control_choices'+where+' AND generation=?',params:[...key,generation]}) : [];
                return {route,revision,speed:choice?.speed??'standard',verbosity:choice?.verbosity??null,speeds,verbosities,csrfToken};
            };
            let snapshot=await state();
            if (input) {
                if (!descriptor || input.revision!==snapshot.revision) fail(409,'Settings changed; reopen the picker');
                const speed=input.speed==='standard'?null:input.speed;
                const verbosity=input.verbosity;
                if (input.speed!=='standard' && ((speed !== 'fast' && speed !== 'ultrafast') || !speeds.includes(speed))) fail(400,'Unsupported speed');
                if (verbosity!==null && ((verbosity !== 'low' && verbosity !== 'medium' && verbosity !== 'high') || !verbosities.includes(verbosity))) fail(400,'Unsupported verbosity');
                await ctx.fns.procs.db.run({sql:`INSERT INTO codex_control_revisions(agent_id,connection_id,model_id,revision) VALUES(?,?,?,1) ON CONFLICT(agent_id,connection_id,model_id) DO UPDATE SET revision=codex_control_revisions.revision+1`,params:key});
                if (speed || verbosity) await ctx.fns.procs.db.run({sql:`INSERT INTO codex_control_choices(agent_id,connection_id,model_id,generation,speed,verbosity) VALUES(?,?,?,?,?,?) ON CONFLICT(agent_id,connection_id,model_id) DO UPDATE SET generation=excluded.generation,speed=excluded.speed,verbosity=excluded.verbosity`,params:[...key,generation,speed,verbosity]});
                else await ctx.fns.procs.db.run({sql:'DELETE FROM codex_control_choices'+where,params:key});
                snapshot=await state();
            }
            const pending=await ctx.fns.procs.db.select({sql:'SELECT 1 FROM codex_control_notices WHERE agent_id=? AND NOT acknowledged LIMIT 1',params:[agentId]});
            return {...snapshot,noticePending:!!pending.length};
        }});
        return reply(view);
    } catch (error) {
        const status=(error as {status?:number})?.status;
        return status && [400,403,404,409].includes(status) ? reply({error:(error as Error).message},status) : reply({error:'Cannot access Codex settings'},500);
    }
}
