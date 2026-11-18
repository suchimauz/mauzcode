import {expect,test} from 'bun:test';
import {mkModelsTestCtx} from './modelsTestCtx.entry';
import workerLoop from './workerLoop';
import wakeWorker from './wakeWorker';
import migration from './$migration_20390101000001_trigger_task_binding';

async function fixture() {
    const ctx=await mkModelsTestCtx();
    const agent=await ctx.fns.agent.start({model:'mock/default:test'}), id=agent.id;
    const db=ctx.fns.procs.db;
    const rows=(sql:string,params:any[]=[]):Promise<Record<string,any>[]>=>db.select({sql,params});
    const exec=(sql:string,params:any[]=[])=>db.run({sql,params});
    const claim=(triggerId:string,token:string)=>exec("UPDATE agent_triggers SET status='checking',claim_token=?,claimed_at=1 WHERE id=?",[token,triggerId]);
    const fetch=(triggerId:string)=>rows('SELECT * FROM agent_trigger_deliveries WHERE trigger_id=?',[triggerId]);
    const runTurn=async()=>{
        let calls=0; const stream=ctx.state.registry.models.stream;
        ctx.state.registry.models.stream=(c:any,s:any,o:any)=>{calls++;return stream(c,s,o);};
        const loop=workerLoop(ctx,null,{});
        try {
            const until=Date.now()+5000;
            while(Date.now()<until){const [r]=await rows('SELECT run_state,next_run_at,last_processed_msg_idx FROM agents WHERE id=?',[id]);if(calls && r?.run_state==='idle' && r.next_run_at==null && Number(r.last_processed_msg_idx)>=0)break;await Bun.sleep(10);}
            expect(calls).toBe(1);
        } finally {ctx.state.workerLoopRunning=false;wakeWorker(ctx,null);await loop;}
    };
    return {ctx,id,claim,rows,exec,fetch,runTurn};
}

test('reclaimed firing uses the scheduled time, not claim token, and runs once after restart',async()=>{
    const h=await fixture(), {ctx,id}=h;
    const t=await ctx.fns.agent.wake({id,inMs:60000,prompt:'just once'});
    const due=Date.now()-1000;await h.exec('UPDATE agent_triggers SET next_at=? WHERE id=?',[due,t.id]);
    await h.claim(t.id,'old');
    await ctx.fns.agent.deliverTriggerPrompt({triggerId:t.id,claimToken:'old',prompt:'just once',now:Date.now()});
    // New dispatcher discovers the abandoned claim without its predecessor's token.
    const jobs:Promise<any>[]=[];const process=ctx.state.registry.agent.processTrigger;
    ctx.state.registry.agent.processTrigger=(c:any,s:any,o:any)=>{expect(o.claimToken).not.toBe('old');const job=process(c,s,o);jobs.push(job);return job;};
    expect(await ctx.fns.agent.pollTriggers({now:Date.now()})).toEqual({processed:[t.id]});
    expect(await Promise.all(jobs)).toEqual([{outcome:'fired'}]);ctx.state.registry.agent.processTrigger=process;
    expect(await h.rows("SELECT client_request_id FROM messages WHERE agent_id=? AND message_type='trigger'",[id])).toEqual([{client_request_id:`trigger:${t.id}:${due}`}]);
    expect(await h.fetch(t.id)).toHaveLength(1);
    await h.runTurn();
    expect((await h.fetch(t.id))[0]?.state).toBe('consumed');
},15000);

test('cron advances and coalesces while quota parked; unpark starts one turn',async()=>{
    const h=await fixture(), {ctx,id}=h;
    await ctx.fns.session.mutateScratchpad({id,mutate:(s:any)=>{s.parked={reason:'usage_limit'};}});
    const t=await ctx.fns.agent.cron({id,expression:'* * * * *',timezone:'UTC',prompt:'tick'});
    for(let i=0;i<3;i++) {
        await h.claim(t.id,'token');
        expect(await ctx.fns.agent.processTrigger({triggerId:t.id,claimToken:'token',now:t.nextAt+60000*i})).toEqual({outcome:i?'coalesced':'fired'});
    }
    expect(await h.rows('SELECT next_run_at FROM agents WHERE id=?',[id])).toEqual([{next_run_at:null}]);
    expect((await h.rows('SELECT outcome FROM agent_trigger_runs WHERE trigger_id=? ORDER BY scheduled_at',[t.id])).map(r=>r.outcome)).toEqual(['fired','coalesced','coalesced']);
    expect(await h.fetch(t.id)).toHaveLength(1);
    expect((await ctx.fns.agent.unpark({id})).resumed).toBe(true);await h.runTurn();
    expect((await h.fetch(t.id))[0]?.state).toBe('consumed');
},15000);

async function task() {
    const h=await fixture(), {ctx,id}=h, root=(await ctx.fns.agent.start({model:'mock/default:test'})).id;
    const goalId=crypto.randomUUID(),reservationId=crypto.randomUUID(),capabilityId=crypto.randomUUID(),runToken='task-worker';
    await ctx.fns.settings.set({module:'goal',scopeType:'global',key:'enabled',value:true});
    await ctx.fns.settings.set({module:'agent',scopeType:'global',key:'triggerTaskWait',value:true});
    await h.exec("INSERT INTO agent_goals(agent_id,goal_id,schema_version,revision,objective,status,created_at,updated_at) VALUES(?,?::uuid,1,1,'test','active',1,1)",[root,goalId]);
    await h.exec("UPDATE agents SET run_token=?,run_state='running',goal_delegation_required=true WHERE id=?",[runToken,id]);
    await h.exec("INSERT INTO goal_delegation_reservations(reservation_id,root_agent_id,goal_id,source_agent_id,delegator_agent_id,delegator_run_id,created_at,task_state,authorized_through_idx) VALUES(?::uuid,?,?::uuid,?,?,'root-run',1,'open',0)",[reservationId,root,goalId,id,root]);
    await h.exec("INSERT INTO goal_delegations(capability_id,root_agent_id,goal_id,source_agent_id,source_run_id,delegator_agent_id,delegator_run_id,created_at,reservation_id) VALUES(?::uuid,?,?::uuid,?,?,?,'root-run',1,?::uuid)",[capabilityId,root,goalId,id,runToken,root,reservationId]);
    const binding={rootAgentId:root,sourceAgentId:id,goalId,runToken,authority:{capabilityId}} as types.goal.RunState['binding'];
    await ctx.fns.goal.runStopRegistry({action:'register',agentId:id,runToken,state:{binding} as types.goal.RunState});
    const scope=<T>(fn:()=>Promise<T>)=>ctx.fns.goal.delegationScope({action:'with',binding,fn}) as Promise<T>;
    const wake=(target=id):Promise<{id:string}>=>ctx.fns.agent.wake({id:target,inMs:60000,prompt:'deferred'});
    const wait=async()=>{await h.exec("UPDATE goal_delegation_reservations SET task_state='waiting' WHERE reservation_id=?::uuid",[reservationId]);await h.exec("UPDATE agents SET run_state='idle',run_token=NULL WHERE id=?",[id]);};
    const state=async()=>(await h.rows('SELECT task_state,blocked_at,blocked_reason FROM goal_delegation_reservations WHERE reservation_id=?::uuid',[reservationId]))[0]!;
    return {...h,scope,wake,root,reservationId,wait,state};
}

test('only executing child can bind; five arms max, cron minute floor, setting off',async()=>{
    const h=await task(),{ctx,id}=h;
    await h.wake();await h.scope(()=>h.wake(h.root));
    expect(await h.rows('SELECT task_reservation_id FROM agent_triggers')).toEqual([{task_reservation_id:null},{task_reservation_id:null}]);
    await expect(h.scope(()=>ctx.fns.agent.cron({id,expression:'*/10 * * * * *',timezone:'UTC',prompt:'fast'}))).rejects.toThrow('five fields');
    for(let i=0;i<5;i++)await h.scope(()=>h.wake());
    await expect(h.scope(()=>h.wake())).rejects.toThrow('5 armed');
    await ctx.fns.settings.set({module:'agent',scopeType:'global',key:'triggerTaskWait',value:false});
    const off=await h.scope(()=>h.wake());expect((await h.rows('SELECT task_reservation_id FROM agent_triggers WHERE id=?',[off.id]))[0]?.task_reservation_id).toBeNull();
});

for(const mode of ['cancel','bulk','timeout','pending','timeout prompt'] as const)test(`last bound trigger: ${mode}`,async()=>{
    const h=await task(),{ctx,id}=h;
    ctx.state.registry.agent.watchPredicate=async()=>({ready:false});
    const watch=await h.scope<{id:string;timeoutAt:number|null}>(()=>ctx.fns.agent.watch({id,predicate:'file.exists',opts:{path:'mock'},everyMs:5000,timeoutMs:5000,prompt:'ready',...(mode==='timeout prompt'?{onTimeoutPrompt:'expired'}:{})}));
    const extra= mode==='cancel'||mode==='pending' ? await h.scope(()=>h.wake()) : undefined;
    await h.wait();
    if(mode==='pending' && extra){await h.claim(extra.id,'wake');await ctx.fns.agent.processTrigger({triggerId:extra.id,claimToken:'wake',now:Date.now()});}
    if(mode==='bulk')await ctx.fns.agent.cancelAllTriggers({id});
    else if(mode==='cancel'||mode==='pending') {
        await ctx.fns.agent.cancelTrigger({id,triggerId:watch.id});expect((await h.state()).task_state).toBe('waiting');
        if(mode==='cancel')await ctx.fns.agent.cancelTrigger({id,triggerId:extra!.id});
    }else {await h.claim(watch.id,'watch');await ctx.fns.agent.processTrigger({triggerId:watch.id,claimToken:'watch',now:watch.timeoutAt!+1});}
    if(mode==='pending'||mode==='timeout prompt') {expect((await h.state()).task_state).toBe('waiting');expect(await h.rows('SELECT state,reservation_id FROM agent_trigger_deliveries')).toEqual([{state:'pending',reservation_id:h.reservationId}]);}
    else {expect(await h.state()).toMatchObject({task_state:'blocked',blocked_reason:mode==='timeout'?'watch_timed_out':'trigger_cancelled',blocked_at:expect.anything()});expect(await h.rows('SELECT next_run_at FROM agents WHERE id=?',[id])).toEqual([{next_run_at:null}]);}
});

test('additive migration does not invent bindings or replay history; rollback pauses bound arms',async()=>{
    const h=await task(),{ctx,id}=h;
    const old=await h.wake();await ctx.fns.session.appendMessage({id,message:{role:'user',message_type:'trigger',excluded_from_cursor:true,author:null,content:'old'}});
    // Recreate the pre-binding schema in this disposable DB around actual historical rows.
    await ctx.fns.procs.db.exec({sql:'DROP TABLE agent_trigger_deliveries; ALTER TABLE agent_triggers DROP COLUMN task_reservation_id'});
    await migration.up(ctx);
    expect((await h.rows('SELECT task_reservation_id FROM agent_triggers WHERE id=?',[old.id]))[0]?.task_reservation_id).toBeNull();
    expect(await h.rows('SELECT excluded_from_cursor FROM messages WHERE agent_id=?',[id])).toEqual([{excluded_from_cursor:1}]);
    expect(await h.rows('SELECT * FROM agent_trigger_deliveries')).toEqual([]);
    const bound=await h.scope(()=>h.wake());await h.wait();await migration.down(ctx);
    expect(await h.state()).toMatchObject({task_state:'blocked',blocked_reason:'rollback',blocked_at:expect.anything()});
    expect(await h.rows('SELECT status,task_reservation_id FROM agent_triggers WHERE id=?',[bound.id])).toEqual([{status:'paused',task_reservation_id:h.reservationId}]);
});
