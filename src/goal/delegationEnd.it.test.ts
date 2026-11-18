import { expect, test } from 'bun:test';
import { mkModelsTestCtx } from '../agent/modelsTestCtx.entry';
import workerLoop from '../agent/workerLoop';
import wakeWorker from '../agent/wakeWorker';
import status from '../agent/$route_$id_status_GET';

async function fixture() {
    const ctx=await mkModelsTestCtx();
    const db=ctx.fns.procs.db;
    ctx.state.registry.goal.enabled=async()=>true;
    const root=await ctx.fns.agent.start({model:'mock/default:test'});
    const child=await ctx.fns.agent.start({model:'mock/default:test',visibility:'team'});
    const g=await ctx.fns.goal.persist({agentId:root.id,expectedGoalId:null,expectedRevision:null,command:{kind:'set',objective:'Test delegated work',status:'active'}});
    const goalId=g.goalId, reservationId=crypto.randomUUID(), capabilityId=crypto.randomUUID(), now=Date.now();
    child.scratchpad.delegateTask={status:'running',parentId:root.id};
    await ctx.fns.session.updateScratchpad({id:child.id,scratchpad:child.scratchpad});
    await db.run({sql:"UPDATE agents SET goal_delegation_required=true,parent_id=? WHERE id=?",params:[root.id,child.id]});
    await db.run({sql:`INSERT INTO goal_delegation_reservations(reservation_id,root_agent_id,goal_id,source_agent_id,delegator_agent_id,delegator_run_id,created_at,task_state,authorized_through_idx)
        VALUES(?::uuid,?,?::uuid,?,?,'root-claim',?,'waiting',0)`,params:[reservationId,root.id,goalId,child.id,root.id,now]});
    await db.run({sql:`INSERT INTO goal_delegations(capability_id,root_agent_id,goal_id,source_agent_id,source_run_id,delegator_agent_id,delegator_run_id,created_at,reservation_id,closed_at)
        VALUES(?::uuid,?,?::uuid,?,'child-claim',?,'root-claim',?,?::uuid,?)`,params:[capabilityId,root.id,goalId,child.id,root.id,now,reservationId,now]});
    const scope={rootAgentId:root.id,goalId,rootRunToken:'root-claim'};
    const trigger=async(kind:'at'|'cron'|'watch')=>{
        const id=crypto.randomUUID();
        await db.run({sql:`INSERT INTO agent_triggers(id,agent_id,kind,prompt,status,mode,claim_token,next_at,created_at,updated_at,task_reservation_id)
            VALUES(?,?,?,'queued task input','checking',?,'fire',?,?,?,?::uuid)`,params:[id,child.id,kind,kind==='watch'?'edge':kind==='cron'?'repeat':'once',now,now,now,reservationId]});return id;
    };
    const fire=(id:string)=>ctx.fns.agent.deliverTriggerPrompt({triggerId:id,claimToken:'fire',prompt:'queued task input',now});
    return {ctx,db,root,child,g,reservationId,capabilityId,scope,trigger,fire};
}

for(const end of ['finish','cancel','revoke'] as const) test(`concurrent ${end} disarms wake, cron and edge-watch; queued firings cannot call model`,async()=>{
    const f=await fixture(), {ctx,db,child}=f;
    // A root worker is required for cancel/revoke. It is not the target of these firings.
    await db.run({sql:"UPDATE agents SET run_state='running',run_token='root-claim',run_started_at=?,run_heartbeat_at=? WHERE id=?",params:[Date.now(),Date.now(),f.root.id]});
    const existing=await Promise.all((['at','cron','watch'] as const).map(f.trigger));
    for(const id of existing) expect(await f.fire(id)).toBe(true);
    const racing=[await f.trigger('watch')];
    const finish=()=>end==='finish'?ctx.fns.agent.finishTask({agent:child,summary:'done',result:{ok:true}}):end==='cancel'?ctx.fns.goal.delegationCancel({...f.scope,reservationId:f.reservationId}):ctx.fns.goal.delegationRevoke({...f.scope,capabilityId:f.capabilityId});
    await Promise.all([finish(),...racing.map(f.fire)]);
    const triggers=await db.select({sql:'SELECT status,claim_token FROM agent_triggers WHERE task_reservation_id=?::uuid',params:[f.reservationId]});
    expect(triggers).toHaveLength(4);
    for(const t of triggers) expect(t).toMatchObject({status:'cancelled',claim_token:null});
    for(const id of racing) expect(await f.fire(id)).toBe(false);
    const receipts=await db.select({sql:'SELECT state FROM agent_trigger_deliveries WHERE reservation_id=?::uuid',params:[f.reservationId]});
    expect(receipts.length).toBeGreaterThanOrEqual(3);
    expect(receipts.every((r:any)=>r.state==='invalidated')).toBe(true);
    let calls=0;
    ctx.state.registry.models.stream=async()=>{calls++;throw Error('Unexpected model request after task end');};
    const running=workerLoop(ctx,null,{});
    try {
        let parked=false;
        for(let n=0;n<120;n++){
            const [owner]=await db.select({sql:'SELECT next_run_at,run_state,last_error FROM agents WHERE id=?',params:[child.id]});
            if(owner.run_state==='idle' && owner.next_run_at==null && owner.last_error){parked=true;break;}
            await Bun.sleep(25);
        }
        expect(parked).toBe(true);expect(calls).toBe(0);
    } finally {ctx.state.workerLoopRunning=false;wakeWorker(ctx,null);await running;}
},15000);

test('settlement closes the old claim, ACKs only successful input and never overrides explicit finish',async()=>{
    const f=await fixture(), {ctx,db,child}=f;
    const ids=[await f.trigger('cron'),await f.trigger('at')];
    const settings=ctx.state.registry.settings.get;
    ctx.state.registry.settings.get=async(c:any,s:any,o:any)=>o.module==='agent' && o.key==='triggerTaskWait'?true:settings(c,s,o);
    const stage=async(token:string)=>{
        await db.run({sql:"UPDATE agents SET run_token=?,run_state='running',last_processed_msg_idx=2,next_run_at=NULL WHERE id=?",params:[token,child.id]});
        await db.run({sql:"UPDATE goal_delegation_reservations SET task_state='open' WHERE reservation_id=?::uuid",params:[f.reservationId]});
        await db.run({sql:`INSERT INTO goal_delegations(capability_id,root_agent_id,goal_id,source_agent_id,source_run_id,delegator_agent_id,delegator_run_id,created_at,reservation_id)
            VALUES(?::uuid,?,?::uuid,?,?,?,'root-claim',?,?::uuid)`,params:[crypto.randomUUID(),f.root.id,f.scope.goalId,child.id,token,f.root.id,Date.now(),f.reservationId]});
        await db.run({sql:`INSERT INTO goal_usage_checkpoints(agent_id,goal_id,source_agent_id,run_id,checkpoint_id,sequence,snapshot,result)
            VALUES(?,?::uuid,?,?,'final',0,'{}','{}')`,params:[f.root.id,f.scope.goalId,child.id,token]});
    };
    const settle=(sourceRunToken:string,outcome:'terminal'|'retry')=>db.transaction({fn:()=>ctx.fns.goal.delegationSettle({sourceAgentId:child.id,sourceRunToken,checkpointId:'final',sequence:0,outcome})});
    const task=async()=>(await db.select({sql:'SELECT task_state,authorized_through_idx FROM goal_delegation_reservations WHERE reservation_id=?::uuid',params:[f.reservationId]}))[0];
    const states=async()=>(await db.select({sql:'SELECT state FROM agent_trigger_deliveries WHERE reservation_id=?::uuid ORDER BY message_idx',params:[f.reservationId]})).map((r:any)=>r.state);
    for(const idx of [2,3]) await db.run({sql:`INSERT INTO agent_trigger_deliveries(trigger_id,firing_key,agent_id,message_idx,reservation_id,state,created_at) VALUES(?,?,?, ?,?::uuid,'pending',?)`,params:[ids[idx-2],idx,child.id,idx,f.reservationId,Date.now()]});
    await stage('first');await settle('first','retry');expect(await states()).toEqual(['pending','pending']);
    await stage('second');await settle('second','terminal');expect(await states()).toEqual(['consumed','pending']);
    expect((await task()).task_state).toBe('waiting');
    const [claim]=await db.select({sql:'SELECT close_reason,settled_checkpoint_id,closed_at FROM goal_delegations WHERE reservation_id=?::uuid AND source_run_id=?',params:[f.reservationId,'second']});
    expect(claim).toMatchObject({close_reason:'waiting',settled_checkpoint_id:'final'});expect(claim.closed_at).not.toBeNull();
    await stage('third');await ctx.fns.agent.finishTask({agent:child,summary:'finished with active cron',result:{ok:true}});
    expect((await task()).task_state).toBe('open'); // live accounting claim retained until final receipt
    expect(await states()).toEqual(['consumed','invalidated']);
    await settle('third','terminal');expect((await task()).task_state).toBe('closed');expect(Number((await task()).authorized_through_idx)).toBe(0);
});

test('durable waiting and blocked tasks remain outstanding and visible after cache loss',async()=>{
    const f=await fixture(),{ctx,db,child,root}=f;
    const id=await f.trigger('cron');
    const opts={agentId:root.id,expectedRunToken:null,expectedGoalId:f.g.goalId,expectedRevision:f.g.revision};
    const reason='trigger_cancelled',at=Date.now();
    for(const s of ['waiting','blocked']){
        if(s==='blocked'){
            await db.run({sql:"UPDATE agent_triggers SET status='cancelled' WHERE id=?",params:[id]});
            await db.run({sql:"UPDATE goal_delegation_reservations SET task_state='blocked',blocked_reason=?,blocked_at=? WHERE reservation_id=?::uuid",params:[reason,at,f.reservationId]});
        }
        delete ctx.state.agent[child.id];
        const expected={taskState:s,blockedReason:s==='waiting'?null:reason,blockedAt:s==='waiting'?null:at,armedTriggerCount:s==='waiting'?1:0};
        const members=await ctx.fns.agent.team({agent:root});
        expect(members[0]).toMatchObject({...expected,id:child.id,status:s==='waiting'?'working':'blocked'});
        const response=await status(ctx,null,{req:new Request('http://localhost/'),params:{id:child.id}});
        expect(await response.json()).toMatchObject({agent:expected});
        await expect(ctx.fns.goal.externalApply({...opts,status:'complete'})).rejects.toThrow('outstanding');
        await expect(ctx.fns.goal.externalClear(opts)).rejects.toThrow('outstanding');
        await expect(ctx.fns.goal.externalResume({...opts,expectedStoppedAt:null,resumeRequestId:crypto.randomUUID()})).rejects.toThrow('outstanding');
        expect((await ctx.fns.goal.read({agentId:root.id})).goal).toMatchObject({goalId:f.g.goalId,status:'active',revision:f.g.revision});
    }
});
