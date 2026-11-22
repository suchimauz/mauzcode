import { expect, test } from 'bun:test';
import { mkTestCtx } from '../../_testCtx.entry';

async function fixture() {
    const ctx = await mkTestCtx();
    const db = ctx.fns.procs.db;
    ctx.state.models ??= {};
    ctx.state.models.providers = {codex:{definition:{id:'codex', fields:[], listModels:()=>{throw Error('unexpected provider path');}}}};
    const create = async (gen:string|null, cache:unknown=null) => {
        const id=crypto.randomUUID();
        await db.run({sql:`INSERT INTO llm_connections(id,provider,account_name,config,created_at,updated_at,codex_generation,models_cache) VALUES(?,'codex',?,'{"models":["manual"]}',0,0,?,?::jsonb)`,params:[id,id,gen,cache==null?null:JSON.stringify(cache)]}); return id;
    };
    let calls=0;
    let response=(async (_id:string, generation:string|null, notify:(g:string|null)=>void):Promise<unknown>=>{notify(generation);return [];});
    ctx.state.registry.models.connections.resolve=async (_:unknown,_s:unknown,{id}:{id:string})=>({conn:{id,secret:async()=>null},definition:{}});
    ctx.state.registry.models.provider.codex.codexListModels=async (_:unknown,_s:unknown,o:{conn:{id:string};onGeneration:(g:string|null)=>void})=>{
        calls++; const [{codex_generation:g}]=await db.select({sql:'SELECT codex_generation FROM llm_connections WHERE id=?',params:[o.conn.id]});
        return response(o.conn.id,g,o.onGeneration);
    };
    const list=(id:string, refresh=false)=>ctx.fns.models.listModels({id,...(refresh?{refresh}:{cacheOnly:true})});
    const count=async (table:string)=>(await db.select({sql:`SELECT count(*)::int AS n FROM ${table}`}))[0].n;
    const choice=async(id:string)=>{
        await db.run({sql:"INSERT INTO agents(id,model,created_by,created_at,updated_at) VALUES('chat',?,'owner',0,0)",params:[`codex/${id}:shared`]});
        await db.run({sql:"INSERT INTO codex_control_revisions VALUES ('chat',?,'shared',1)",params:[id]});
        await db.run({sql:"INSERT INTO codex_control_choices VALUES ('chat',?,'shared','A','fast','high')",params:[id]});
    };
    return {ctx,db,create,list,count,choice,set:(r:typeof response)=>{response=r;},calls:()=>calls};
}
const descriptor={id:'shared',responseControls:{speed:{supported:['fast','bad']},verbosity:{supported:['high','low'],default:'invalid'}},reasoning:{supported:['xhigh','max'],default:'max'},injected:true};
test('account-local controls are sanitized on disk and reloaded offline, including manual and legacy entries',async()=>{
    const f=await fixture(),a=await f.create('A'),b=await f.create('B'),legacy=await f.create(null,[descriptor]);
    expect((await f.list(a)).models).toEqual([{id:'manual',disabled:false}]);
    expect((await f.list(legacy)).models[0].responseControls).toBeUndefined(); expect(f.calls()).toBe(0);
    f.set(async(_,g,notify)=>{notify(g);return g==='A'?[descriptor,{id:'unusable',reasoningUnavailable:true,arbitrary:1}]:[{id:'shared',responseControls:{speed:{supported:['ultrafast']}}}];});
    await f.list(a,true);await f.list(b,true);
    const cold=await mkTestCtx(); // New process state; shared isolated worker DB.
    const models=(await cold.fns.models.listModels({id:a,cacheOnly:true})).models;
    expect(models).toEqual([{id:'shared',disabled:false,responseControls:{speed:{supported:['fast']},verbosity:{supported:['high','low']}},reasoning:{supported:['xhigh','max'],default:'max'}},{id:'unusable',disabled:false,reasoningUnavailable:true}]);
    expect((await f.list(b)).models[0].responseControls.speed.supported).toEqual(['ultrafast']); expect(f.calls()).toBe(2);
    const denied=await f.list(legacy,true);expect(denied.error).toBeTruthy();expect(denied.source).toBe('manual');
});
test('late result cannot cross generation or overwrite a later publication or reconcile twice',async()=>{
    const f=await fixture(),a=await f.create('A');
    f.set(async(_,g,notify)=>{notify(g);return [descriptor];});await f.list(a,true);await f.choice(a);
    const pending=()=>{const started=Promise.withResolvers<void>(), finished=Promise.withResolvers<void>();
        f.set(async(_,g,notify)=>{started.resolve();await finished.promise;notify(g);return [descriptor];});
        return {started:started.promise,release:finished.resolve,result:f.list(a,true)};};
    const first=pending();await first.started;
    f.set(async(_,g,notify)=>{notify(g);return [{id:'shared'}];});
    const current=[{id:'shared',disabled:false}];
    expect((await f.list(a,true)).models).toEqual(current);first.release();expect((await first.result).models).toEqual(current);
    expect((await f.list(a)).models).toEqual(current);expect(await f.count('codex_control_choices')).toBe(0);expect(await f.count('codex_control_notices')).toBe(1);
    f.ctx.state.registry.auth.currentUser=async()=>({required:true,legacy:false,user:{id:'owner',disabledAt:null}});
    f.ctx.state.registry.auth.csrfToken=async()=>'csrf';f.ctx.state.registry.auth.verifyCsrf=async()=>true;
    const surface=(req:Request)=>f.ctx.fns.session.codexControlsSurface({req,agentId:'chat'});
    const saved=await (await surface(new Request('http://fixture'))).json();
    const denied=await surface(new Request('http://fixture',{method:'POST',body:JSON.stringify({...saved,action:'save',speed:'fast',verbosity:null})}));
    expect(denied.status).toBe(400);expect(await f.count('codex_control_choices')).toBe(0);
    const late=pending();await late.started;
    await f.db.run({sql:"UPDATE llm_connections SET codex_generation='B' WHERE id=?",params:[a]});
    f.set(async()=>{throw Error('mock failure');});expect((await f.list(a,true)).source).toBe('manual');
    late.release();expect((await late.result).source).toBe('manual');expect((await f.list(a)).source).toBe('manual');
    expect(await f.count('codex_control_notices')).toBe(1);
});
test('HTTP 200 incomplete envelopes retain both choices; complete empty removes them once',async()=>{
    const f=await fixture(),a=await f.create('A');
    f.set(async(_,g,notify)=>{notify(g);return [descriptor];});await f.list(a,true);await f.choice(a);
    const discovery=(await import('../provider/codex/codexListModels')).default;
    let payload:unknown={};
    f.ctx.state.registry.models.provider.codex.codexListModels=discovery;
    f.ctx.state.registry.models.provider.codex.codexWireAuth=async()=>({generation:'A',token:'fixture',accountId:'x',credentialRevision:1});
    f.ctx.state.registry.models.provider.codex.codexWireChecked=async(_:unknown,_s:unknown,{res}:{res:Response})=>res;
    f.ctx.state.registry.models.provider.codex.codexVersion=async()=>'fixture';
    f.ctx.state.registry.models.connections.resolve=async()=>({definition:{},conn:{config:{},secret:async()=>null,fetch:async()=>Response.json(payload)}});
    for(payload of [{},{models:null},{models:[{}]},{models:[],has_more:true},{models:Array(2001).fill({slug:'same'})}]){
        const r=await f.list(a,true);expect(r.error).toBeTruthy();expect(r.models[0].id).toBe('shared');
        expect(await f.count('codex_control_choices')).toBe(1);expect(await f.count('codex_control_notices')).toBe(0);
    }
    payload={models:[]};expect((await f.list(a,true)).models).toEqual([]);
    expect(await f.count('codex_control_choices')).toBe(0);expect(await f.count('codex_control_notices')).toBe(1);
});
