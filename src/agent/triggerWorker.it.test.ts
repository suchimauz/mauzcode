import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mkModelsTestCtx } from './modelsTestCtx.entry';
import workerLoop from './workerLoop';
import wakeWorker from './wakeWorker';

// Real claims, delivery, cursor and run; capture only the neutral mock provider boundary.
async function fixture() {
    const ctx = await mkModelsTestCtx();
    const agent = await ctx.fns.agent.start({model:'mock/default:test'});
    const requests: any[][] = [];
    const stream = ctx.state.registry.models.stream;
    ctx.state.registry.models.stream = async (c:any,s:any,o:any) => {
        requests.push(structuredClone(o.messages));
        return stream(c,s,o);
    };
    const db = ctx.fns.procs.db;
    async function fire(trigger: {id:string}) {
        // Simulate a due occurrence without sleeping until the next cron minute.
        await db.run({sql:'UPDATE agent_triggers SET next_at=? WHERE id=?',params:[Date.now()-1,trigger.id]});
        const pending: Promise<any>[] = [];
        const process = ctx.state.registry.agent.processTrigger;
        ctx.state.registry.agent.processTrigger = (c:any,s:any,o:any) => {
            const work = process(c,s,o); pending.push(work); return work;
        };
        try {
            await ctx.fns.agent.pollTriggers({now:Date.now()});
            expect((await Promise.all(pending)).map(o=>o.outcome)).toEqual(['fired']);
        } finally { ctx.state.registry.agent.processTrigger = process; }
    }
    async function run(count=1) {
        const loop = workerLoop(ctx,null,{});
        try {
            const until = Date.now()+5000;
            let settled = false;
            do {
                const [row] = await db.select({sql:'SELECT run_state,next_run_at,last_processed_msg_idx,last_error FROM agents WHERE id=?',params:[agent.id]});
                if (row.last_error) throw new Error(String(row.last_error));
                const [input] = await db.select({sql:"SELECT MAX(idx) AS idx FROM messages WHERE agent_id=? AND role='user' AND excluded_from_cursor=0",params:[agent.id]});
                settled = requests.length>=count && row.run_state==='idle' && row.next_run_at==null && input.idx!=null && Number(row.last_processed_msg_idx)>=Number(input.idx);
                if (!settled) await Bun.sleep(10);
            } while (!settled && Date.now()<until);
            expect(settled).toBe(true);
        } finally { ctx.state.workerLoopRunning=false; wakeWorker(ctx,null); await loop; }
        expect(requests).toHaveLength(count);
    }
    const wake = (prompt:string) => ctx.fns.agent.wake({id:agent.id,inMs:60000,prompt});
    return {ctx,agent,db,requests,fire,run,wake};
}

for (const kind of ['wake','cron'] as const) test(`${kind} starts a mock model turn and advances the cursor`,async()=>{
    const h=await fixture(), prompt=`scheduled ${kind}`;
    h.ctx.state.registry.auth.listUsers=async()=>[{id:'alice',name:'Alice'},{id:'bob',name:'Bob'}];
    h.ctx.state.registry.auth.actorId=async()=>'alice';
    const reasons: string[]=[];
    if(kind==='wake') {
        h.ctx.state.registry.goal.enabled=async()=>true;
        await h.ctx.fns.goal.persist({agentId:h.agent.id,expectedGoalId:null,expectedRevision:null,command:{kind:'set',objective:'Work',status:'active'}});
        // The mock provider has no goal tools; no synthetic continuation should be scheduled.
        h.ctx.state.registry.goal.nativeCapability=async()=>({available:false,reason:'mock_no_goal_tools'});
        const validate=h.ctx.state.registry.goal.continuationValidateStart;
        h.ctx.state.registry.goal.continuationValidateStart=async(c:any,s:any,o:any)=>{const out=await validate(c,s,o); reasons.push(out.reason); return out;};
    }
    const trigger=kind==='wake'?await h.wake(prompt):await h.ctx.fns.agent.cron({id:h.agent.id,prompt,expression:'* * * * *',timezone:'UTC'});
    await h.fire(trigger); await h.run();
    expect(h.requests[0]).toContainEqual(expect.objectContaining({role:'user',content:prompt}));
    if(kind==='wake') expect(reasons).toEqual(['ordinary_input']);
},15000);

test('trigger delivered after the last model request gets its own follow-up turn',async()=>{
    const h=await fixture();
    await h.fire(await h.wake('first turn'));
    const next=await h.wake('follow up');
    const run=h.ctx.state.registry.agent.run;
    let runs=0;
    h.ctx.state.registry.agent.run=async(c:any,s:any,o:any)=>{
        const result=await run(c,s,o);
        if (++runs===1) await h.fire(next); // claim still running, model frontier already frozen
        return result;
    };
    await h.run(2);
    expect(runs).toBe(2);
    expect(h.requests[0]!.some(m=>m.content==='follow up')).toBe(false);
    expect(h.requests[1]).toContainEqual(expect.objectContaining({role:'user',content:'follow up'}));
},15000);

for (const status of ['ready','timeout']) test(`legacy watch ${status} starts a turn`,async()=>{
    const h=await fixture(), now=Date.now();
    h.ctx.state.registry.agent.watchPredicate=async()=>({ready:true,result:'ok'});
    await h.db.run({sql:`INSERT INTO agent_watches(id,agent_id,predicate,reason,interval_ms,next_check_at,timeout_at,created_at) VALUES(?,?,'file.exists','legacy',5000,?,?,?)`,params:['legacy',h.agent.id,now,status==='ready'?now+10000:now,now]});
    expect(await h.ctx.fns.agent.deliverWatch({watchId:'legacy',now})).toMatchObject({status});
    await h.run();
    const content=status==='ready'?'Wake condition met: legacy\n\nResult: "ok"':'Wake condition timed out: legacy';
    expect(h.requests[0]).toContainEqual(expect.objectContaining({role:'user',content}));
    expect(await h.db.select({sql:"SELECT author,excluded_from_cursor FROM messages WHERE agent_id=? AND message_type='wake_up'",params:[h.agent.id]})).toEqual([{author:null,excluded_from_cursor:0}]);
},15000);

for(const mode of ['inline','stored','unavailable']) test(`ready watch model request: ${mode}`,async()=>{
    const h=await fixture(), prompt='predicate done';
    // Serialized UTF-16 length, including JSON quotes; non-BMP text distinguishes units from bytes.
    const value='😀'.repeat(7997)+(mode==='inline'?'tail':'xtail'), full=JSON.stringify(value);
    expect(full.length).toBe(mode==='inline'?16000:16001);
    h.ctx.state.registry.agent.watchPredicate=async()=>({ready:true,result:value});
    await mkdir('.test-tmp',{recursive:true});
    const root=await mkdtemp(resolve('.test-tmp','trigger-result-'));
    h.ctx.state.registry.resultStore.root=async()=>root;
    if(mode==='unavailable') h.ctx.state.registry.resultStore.write=async()=>{throw new Error('private storage diagnostic');};
    try {
        await h.fire(await h.ctx.fns.agent.watch({id:h.agent.id,prompt,predicate:'file.exists',opts:{path:'unused'}}));
        await h.run();
        const body=String(h.requests[0]!.find(m=>m.role==='user'&&String(m.content).startsWith(prompt))?.content);
        const [message]=await h.db.select({sql:"SELECT result_ref FROM messages WHERE agent_id=? AND message_type='trigger'",params:[h.agent.id]});
        if(mode==='inline'){ expect(body.endsWith(full)).toBe(true); expect(message.result_ref).toBeNull(); }
        else {
            expect(body.includes(full.slice(0,2499))).toBe(true); expect(body.includes('xtail')).toBe(false);
            if(mode==='unavailable') { expect(body).toMatch(/full result unavailable/i); expect(body).not.toContain('readResult'); expect(body).not.toContain('private storage diagnostic'); expect(message.result_ref).toBeNull(); }
            else {
                expect(body).toContain(message.result_ref.id);
                h.ctx.state.registry.agent.current=async()=>h.agent;
                const first=await h.ctx.fns.agent.readResult({id:message.result_ref.id,limit:16000});
                const last=await h.ctx.fns.agent.readResult({id:message.result_ref.id,offset:16000});
                expect(first.ok && last.ok && first.text+last.text===full).toBe(true);
            }
        }
    } finally { await rm(root,{recursive:true,force:true}); }
},15000);

// Wake and message are two distinct committed deliveries to the same agent.
test('agent-to-agent hop survives an intervening trigger, a human turn still resets it',async()=>{
    const h=await fixture(), peer=await h.ctx.fns.agent.start({model:'mock/default:test'});
    expect(await h.ctx.fns.agent.message({agent:peer,to:h.agent.id,text:'question',wake:false})).toMatchObject({hop:1});
    await h.fire(await h.wake('keep going'));
    expect(await h.ctx.fns.agent.message({agent:h.agent,to:peer.id,text:'answer',wake:false})).toMatchObject({hop:2});
    await h.ctx.fns.session.appendMessage({id:h.agent.id,message:{role:'user',content:'new question'}});
    expect(await h.ctx.fns.agent.message({agent:h.agent,to:peer.id,text:'fresh exchange',wake:false})).toMatchObject({hop:1});
});

test('pending trigger takes priority over goal continuation and external resume',async()=>{
    const h=await fixture(), {goal}=h.ctx.fns, id=h.agent.id;
    h.ctx.state.registry.goal.enabled=async()=>true;
    h.ctx.state.registry.goal.nativeCapability=async()=>({available:true,reason:'available'});
    const g=await goal.persist({agentId:id,expectedGoalId:null,expectedRevision:null,command:{kind:'set',objective:'Keep working',status:'active'}});
    await h.fire(await h.wake('next step'));
    const opts={agentId:id,expectedGoalId:g.goalId,expectedRevision:g.revision};
    const resumed=await goal.externalResume({...opts,expectedRunToken:null,expectedStoppedAt:null,resumeRequestId:crypto.randomUUID()});
    expect(resumed.resume).toMatchObject({scheduled:false,reason:'pending_user'});
    const token=crypto.randomUUID();
    await h.db.run({sql:"UPDATE agents SET run_state='running',run_token=? WHERE id=?",params:[token,id]});
    expect(await h.db.transaction({fn:()=>goal.continuationAdmit({...opts,expectedRevision:resumed.goal.revision,runToken:token,consumedIdx:-1})})).toMatchObject({admitted:false,reason:'pending_user'});
    const [trigger]=await h.db.select({sql:"SELECT idx FROM messages WHERE agent_id=? AND message_type='trigger'",params:[id]});
    expect(await goal.continuationValidateStart({agentId:id,runToken:token,frontierIdx:trigger.idx})).toMatchObject({action:'run',reason:'ordinary_input'});
});
