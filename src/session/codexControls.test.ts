import {test, expect} from 'bun:test';
import {mkTestCtx} from '../_testCtx.entry';
import get from '../agent/$route_$id_codex-controls_GET';
import post from '../agent/$route_$id_codex-controls_POST';
import migration from './$migration_20390503120000_codex_controls';

// Real isolated Postgres, including the connection transaction and chat row locks. Only browser identity is mocked.
async function fixture(){
    const ctx=await mkTestCtx(); const db=ctx.fns.procs.db;
    const actor={id:'owner',disabledAt:null};
    ctx.state.registry.auth.currentUser=async()=>({required:true,user:actor});
    ctx.state.registry.auth.csrfToken=async()=> 'cookie-bound'; // keep the real verifier
    const model={id:'one',responseControls:{speed:{supported:['standard','fast']},verbosity:{supported:['low','high']}}};
    const connectionId=crypto.randomUUID(), account='test'+connectionId.slice(0,8), route=`codex/${account}:one`;
    const agent=await ctx.fns.agent.start({model:route});
    await ctx.fns.session.save({agent});
    await db.run({sql:'UPDATE agents SET created_by=? WHERE id=?',params:['owner',agent.id]});
    await db.run({sql:`INSERT INTO llm_connections(id,provider,account_name,created_at,updated_at,codex_generation,models_cache_generation,models_cache) VALUES(?,'codex',?,0,0,'a','a',?::jsonb)`,params:[connectionId,account,JSON.stringify([model])]});
    const visit=async(body?:any,id=agent.id)=>{
        const req=new Request('http://localhost/agent/'+id+'/codex-controls',body?{method:'POST',body:JSON.stringify({csrfToken:'cookie-bound',...body})}:{});
        const res=await (body?post:get)(ctx,null,{req,params:{id}}); return {status:res.status,data:await res.json() as any};
    };
    const save=async(revision:string,speed='fast',verbosity:string|null='high')=>visit({action:'save',route,revision,speed,verbosity});
    const publish=async(models:any[],generation:string|null='a')=>db.transaction({fn:async()=>{
        await db.run({sql:'UPDATE llm_connections SET models_cache=?::jsonb,models_published_ticket=models_published_ticket+1,codex_generation=?,models_cache_generation=? WHERE id=?',params:[JSON.stringify(models),generation,generation,connectionId]});
        await ctx.fns.session.reconcileCodexControls({connectionId,generation,models});
    }});
    const admit=(ownerId:string|null='owner',generation:string|null='a')=>db.transaction({fn:()=>ctx.fns.session.admittedCodexControls({agentId:agent.id,ownerId,generation,connectionId,modelId:'one'})});
    return {ctx,db,actor,agent,model,route,connectionId,visit,save,publish,admit};
}

test('additive migration, route-scoped edit clocks and ownership; defaults do not resurrect stale Fast',async()=>{
    const f=await fixture();
    await migration.up(f.ctx); // safe reapplication with existing chats
    let v=await f.visit(); expect(v.status).toBe(200);expect(v.data.speed).toBe('standard');expect(v.data.speeds).toContain('fast');
    expect((await f.db.select({sql:'SELECT * FROM codex_control_revisions WHERE agent_id=?',params:[f.agent.id]}))).toHaveLength(0);
    const initial=v.data.revision;v=await f.save(initial); expect(v.status).toBe(200);expect((await f.visit()).data.speed).toBe('fast');
    expect(await f.admit()).toEqual({speed:'fast',verbosity:'high'});expect(await f.admit('other')).toEqual({});
    const forks=[await f.ctx.fns.session.fork({id:f.agent.id}),await f.ctx.fns.agent.start({model:f.route,parentId:f.agent.id}),await f.ctx.fns.agent.start({model:f.route})];
    for (const a of forks){ await f.ctx.fns.session.save({agent:a}); await f.db.run({sql:'UPDATE agents SET created_by=? WHERE id=?',params:['owner',a.id]});expect((await f.visit(undefined,a.id)).data.speed).toBe('standard'); }
    const switchTo=(s:string)=>f.db.run({sql:'UPDATE agents SET model=? WHERE id=?',params:[s,f.agent.id]});
    await switchTo(f.route+'-another-model');expect((await f.visit()).data.speed).toBe('standard');expect((await f.save(v.data.revision)).status).toBe(409);
    const other=crypto.randomUUID(),label='other'+other.slice(0,8);
    await f.db.run({sql:`INSERT INTO llm_connections(id,provider,account_name,created_at,updated_at,codex_generation,models_cache_generation,models_cache) VALUES(?,'codex',?,0,0,'a','a',?::jsonb)`,params:[other,label,JSON.stringify([f.model])]});
    await switchTo(`codex/${label}:one`);expect((await f.visit()).data.speed).toBe('standard');expect(await f.admit()).toEqual({});
    await switchTo(f.route);expect((await f.visit()).data.speed).toBe('fast');
    const standard=await f.ctx.fns.agentPreset.resolve({presetId:'standard'});
    for(const name of ['session.admittedCodexControls','session.reconcileCodexControls','session.codexControlsSurface']) expect(f.ctx.fns.agentPreset.allows({snapshot:standard,name})).toBe(false);
    f.actor.id='other';expect((await f.visit()).status).toBe(403);expect((await f.save(v.data.revision)).status).toBe(403);f.actor.id='owner';
    expect((await f.visit({action:'save',route:f.route,revision:v.data.revision,speed:'standard',verbosity:null,csrfToken:'bad'})).status).toBe(403);
    expect((await f.save(v.data.revision,'ultrafast')).status).toBe(400);
    const reset=await f.save(v.data.revision,'standard',null);expect(reset.status).toBe(200);
    expect((await f.save(initial)).status).toBe(409);expect((await f.save(v.data.revision)).status).toBe(409);expect(await f.admit()).toEqual({});
    expect(await f.db.select({sql:'SELECT * FROM codex_control_choices WHERE agent_id=?',params:[f.agent.id]})).toHaveLength(0);
});

test('closed-chat removal and restore leaves high only; interruption, claims and idempotent ack across owner views',async()=>{
    const f=await fixture();const v=await f.visit();expect((await f.save(v.data.revision)).status).toBe(200);
    await f.publish([{id:'one',responseControls:{verbosity:f.model.responseControls.verbosity}}]);await f.publish([f.model]);
    expect(await f.admit()).toEqual({verbosity:'high'});let reopened=await f.visit();expect(reopened.data).toMatchObject({speed:'standard',verbosity:'high',noticePending:true});
    const a=crypto.randomUUID(),b=crypto.randomUUID();const claim=(claimId:string)=>f.visit({action:'claim',claimId});
    f.actor.id='other';expect((await claim(b)).status).toBe(403);f.actor.id='owner';
    const n=(await claim(a)).data.notice;expect(n.message).toContain('Standard');expect((await claim(b)).data.notice).toBeNull();expect((await claim(a)).data.notice.id).toBe(n.id);
    await f.db.run({sql:'UPDATE codex_control_notices SET claim_until=0 WHERE id=?',params:[n.id]});expect((await claim(b)).data.notice.id).toBe(n.id);
    const ack=(id:string)=>f.visit({action:'ack',claimId:id,noticeId:n.id});expect((await ack(a)).status).toBe(409);
    f.actor.id='other';expect((await ack(b)).status).toBe(403);f.actor.id='owner';expect((await ack(b)).status).toBe(200);expect((await ack(b)).status).toBe(200);
    expect((await f.visit()).data.noticePending).toBe(false);expect((await claim(a)).data.notice).toBeNull();
    expect(await f.db.select({sql:'SELECT id FROM codex_control_notices WHERE agent_id=?',params:[f.agent.id]})).toHaveLength(1);
});

test('generation replacement rejects stale paid consent, concurrent saves have one winner, admission repairs stale state',async()=>{
    const f=await fixture(),initial=(await f.visit()).data;
    expect((await Promise.all([f.save(initial.revision),f.save(initial.revision)])).map(s=>s.status).sort()).toEqual([200,409]);
    const stale=(await f.visit()).data;await f.db.run({sql:'UPDATE llm_connections SET codex_credential_revision=2 WHERE id=?',params:[f.connectionId]});expect(await f.admit()).toEqual({speed:'fast',verbosity:'high'});
    await f.publish([],null);await f.publish([f.model],'b');expect(await f.admit('owner','b')).toEqual({});expect((await f.save(stale.revision)).status).toBe(409);
    expect((await f.visit()).data.noticePending).toBe(true);
    const fresh=(await f.visit()).data;expect((await f.save(fresh.revision)).status).toBe(200);
    await f.db.run({sql:'UPDATE llm_connections SET models_cache=?::jsonb WHERE id=?',params:[JSON.stringify([{id:'one',responseControls:{speed:{supported:['standard','fast']}}}]),f.connectionId]});
    expect(await f.admit('owner','b')).toEqual({speed:'fast'});
    const notices=()=>f.db.select({sql:'SELECT id FROM codex_control_notices WHERE agent_id=?',params:[f.agent.id]});expect(await notices()).toHaveLength(2);
    await f.publish([f.model],'c');expect(await f.admit('owner','c')).toEqual({});expect(await notices()).toHaveLength(3);
});
