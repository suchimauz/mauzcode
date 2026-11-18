import { expect, test } from 'bun:test';
import { mkModelsTestCtx } from './modelsTestCtx.entry';
import workerLoop from './workerLoop';
import wakeWorker from './wakeWorker';

type Kind = 'wake' | 'cron' | 'watch';
const prompt = 'Inspect scheduled result';
const human = 'private instruction from a human';

async function fixture(kind: Kind = 'wake', enabled = true) {
    const ctx = await mkModelsTestCtx(), { agent, goal, session, settings } = ctx.fns;
    const db = ctx.fns.procs.db;
    const rows = (sql: string, ...params: any[]): Promise<any[]> => db.select({sql, params});
    const run = (sql: string, ...params: any[]) => db.run({sql, params});
    await settings.set({module:'goal', scopeType:'global', key:'enabled', value:true});
    await settings.set({module:'agent', scopeType:'global', key:'triggerTaskWait', value:enabled});
    const root = await agent.start({model:'mock/default:test'}), rootToken = crypto.randomUUID();
    const g = await goal.persist({agentId:root.id, expectedGoalId:null, expectedRevision:null,
        command:{kind:'set', objective:'Inspect later', status:'active'}});
    // Only the publishing root lease is fixture state. Every child claim and checkpoint is real.
    await run("UPDATE agents SET run_state='running',run_token=?,run_started_at=? WHERE id=?", rootToken, Date.now(), root.id);
    async function publish() {
        const child = await agent.start({model:'mock/default:test'});
        const {reservationId} = await db.transaction({fn:async()=>{
            const grant = await goal.delegationReserve({rootAgentId:root.id, goalId:g.goalId, sourceAgentId:child.id,
                delegatorAgentId:root.id, delegatorRunToken:rootToken});
            const msg = await session.appendMessage({id:child.id, message:{role:'user', author:`agent:${root.id}`, message_type:'delegation_task', content:'Check later'}});
            await goal.delegationPublish({reservationId:grant.reservationId, delegatorRunToken:rootToken, authorizedThroughIdx:msg.idx});
            await run('UPDATE agents SET next_run_at=? WHERE id=?', Date.now(), child.id);
            return grant;
        }});
        child.scratchpad.mockLLM = {turns:[{toolCalls:[{name:'eval',args:{code:'schedule'}}]}],defaultText:'waiting for work'};
        return {child, reservationId};
    }
    const {child, reservationId} = await publish();
    if (kind === 'watch') await run('CREATE TABLE test_watch_result (answer integer)');
    // mkModelsTestCtx stubs repl.eval. Execute a fixed command there, INSIDE the real tool scope.
    // Tool calls from a sibling deliberately target the first child rather than themselves.
    ctx.state.registry.repl.eval = async () => {
        const opts = {id:child.id, prompt};
        if (kind === 'wake') return JSON.stringify(await agent.wake({...opts, inMs:600000}));
        // Keep the next real cron well outside this test, even across a minute boundary.
        if (kind === 'cron') return JSON.stringify(await agent.cron({...opts, expression:`0 ${(new Date().getUTCHours()+2)%24} * * *`,timezone:'UTC'}));
        return JSON.stringify(await agent.watch({...opts, predicate:'db.rows', opts:{sql:'SELECT answer FROM test_watch_result'}, mode:'edge',everyMs:600000}));
    };
    const requests: {id:string; messages:any[]}[] = [];
    const stream = ctx.state.registry.models.stream;
    let intercept: ((o:any)=>Promise<void>) | undefined;
    ctx.state.registry.models.stream = async (c:any,s:any,o:any) => {
        requests.push({id:o.sessionId, messages:structuredClone(o.messages)});
        const once = intercept; intercept = undefined;
        if (once) await once(o);
        return stream(c,s,o);
    };
    async function drain(id = child.id) {
        const loop = workerLoop(ctx,null,{});
        try {
            const until = Date.now()+7000;
            do {
                const [state] = await rows('SELECT run_state,next_run_at,last_error,last_processed_msg_idx FROM agents WHERE id=?', id);
                if (state.run_state==='idle' && state.next_run_at==null) return state;
                await Bun.sleep(15);
            } while (Date.now()<until);
            throw Error('Child worker did not settle');
        } finally {ctx.state.workerLoopRunning=false; wakeWorker(ctx,null); await loop;}
    }
    async function fire(id:string, expected='fired') {
        await run('UPDATE agent_triggers SET next_at=? WHERE id=?', Date.now()-1, id);
        const pending: Promise<any>[] = [], process = ctx.state.registry.agent.processTrigger;
        ctx.state.registry.agent.processTrigger = (c:any,s:any,o:any) => {
            const result = process(c,s,o); pending.push(result); return result;
        };
        try {
            await agent.pollTriggers({now:Date.now()});
            expect((await Promise.all(pending)).map(x=>x.outcome)).toEqual([expected]);
        } finally {ctx.state.registry.agent.processTrigger=process;}
    }
    const state = async () => (await rows('SELECT * FROM goal_delegation_reservations WHERE reservation_id=?',reservationId))[0];
    const caps = () => rows('SELECT * FROM goal_delegations WHERE source_agent_id=? ORDER BY created_at', child.id);
    const receipts = () => rows('SELECT * FROM agent_trigger_deliveries WHERE agent_id=? ORDER BY message_idx',child.id);
    const submitHuman = async () => {
        const response = await agent.acceptMessage({params:{id:child.id}, req:new Request('http://localhost/chat?debounceSeconds=0',{method:'POST',body:human})});
        expect(response.status).toBe(200);
    };
    const initial = await drain();
    expect(initial.last_error).toBeNull();
    const triggers = await rows('SELECT id,task_reservation_id FROM agent_triggers WHERE agent_id=?',child.id);
    expect(triggers, JSON.stringify(await rows("SELECT role,left(content,400) AS message FROM messages WHERE agent_id=? AND role IN ('assistant','tool') ORDER BY idx",child.id))).toHaveLength(1);
    expect(triggers[0].task_reservation_id).toBe(enabled ? reservationId : null);
    expect((await state()).task_state).toBe(enabled ? 'waiting' : 'closed');
    expect(requests).toHaveLength(2);
    return {ctx, child, root, rootToken, goalId:g.goalId, reservationId, initial, trigger:triggers[0].id, rows, run,
        state, receipts, caps, requests, drain, fire, publish, submitHuman, onStream:(fn:(o:any)=>Promise<void>)=>{intercept=fn;}};
}

for (const kind of ['wake','cron','watch'] as const) test(`${kind}: own firing gets a fresh claim under the same grant`, async()=>{
    const h = await fixture(kind);
    // Stop the worker (drain above), remove the live session and reload it from PG on the next claim.
    delete h.ctx.state.agent[h.child.id];
    const count = kind === 'wake' ? 1 : 2;
    for (let i=1; i<=count; i++) {
        if (kind==='watch') {
            if (i>1) {await h.run('DELETE FROM test_watch_result'); await h.fire(h.trigger,'rearmed');}
            await h.run('INSERT INTO test_watch_result VALUES (?)',i);
        }
        await h.fire(h.trigger);
        const pending = (await h.receipts()).at(-1);
        expect(pending).toMatchObject({state:'pending',reservation_id:h.reservationId});
        const settled = await h.drain();
        expect(settled.last_error).toBeNull();
        expect(Number(settled.last_processed_msg_idx)).toBe(Number(pending.message_idx));
        expect((await h.receipts()).map(x=>x.state)).toEqual(Array(i).fill('consumed'));
        const scheduled = h.requests.at(-1)!.messages.filter(m=>m.role==='user' && String(m.content).startsWith(prompt));
        expect(scheduled).toHaveLength(1); // Previously consumed firings are outside this claim.
        expect(scheduled.at(-1)?.content).toBe(kind==='watch' ? `${prompt}\n\nPredicate result: [{"answer":${i}}]` : prompt);
        expect(h.requests).toHaveLength(2+i);
        const claims = await h.caps();
        expect(claims.map(c=>c.reservation_id)).toEqual(Array(1+i).fill(h.reservationId));
        expect(new Set(claims.map(c=>c.source_run_id)).size).toBe(1+i);
        expect((await h.state()).task_state).toBe(kind==='wake'?'closed':'waiting');
    }
},20000);

test('failed model response does not ACK the firing; explicit retry on fresh claim consumes it once',async()=>{
    const h = await fixture();
    await h.fire(h.trigger);
    h.onStream(async()=>{throw Error('fixture: model unavailable');});
    const failed = await h.drain();
    expect(failed.last_error).toContain('fixture: model unavailable');
    expect(failed.last_processed_msg_idx).toBe(h.initial.last_processed_msg_idx);
    const [pending] = await h.receipts();
    expect(pending.state).toBe('pending');
    await h.run('UPDATE agents SET next_run_at=? WHERE id=?', Date.now(),h.child.id);
    const retried = await h.drain();
    expect(retried.last_error).toBeNull();
    expect(Number(retried.last_processed_msg_idx)).toBe(Number(pending.message_idx));
    expect(await h.receipts()).toEqual([expect.objectContaining({state:'consumed', message_idx:pending.message_idx})]);
    expect(new Set((await h.caps()).map(c=>c.source_run_id)).size).toBe(3);
    expect(h.requests.slice(2).map(r=>r.messages.filter(m=>m.role==='user' && m.content===prompt).length)).toEqual([1,1]);
},20000);

for (const timing of ['before','steering'] as const) test(`human input ${timing} a bound turn is never shown or skipped`,async()=>{
    const h = await fixture('cron');
    // A later valid firing must never make an earlier human row admissible.
    if (timing==='before') await h.submitHuman();
    await h.fire(h.trigger);
    let interrupted = false;
    if (timing==='steering') h.onStream(async o=>{
        await h.submitHuman();
        interrupted = o.signal.aborted;
        o.signal.throwIfAborted();
    });
    const settled = await h.drain();
    const [msg] = await h.rows('SELECT idx FROM messages WHERE agent_id=? AND content=?', h.child.id,human);
    expect(Number(settled.last_processed_msg_idx)).toBeLessThan(Number(msg.idx));
    expect(JSON.stringify(h.requests)).not.toContain(human);
    if (timing==='before') {
        expect(h.requests).toHaveLength(2);
        expect(settled.last_processed_msg_idx).toBe(h.initial.last_processed_msg_idx);
        expect((await h.receipts())[0].state).toBe('pending');
    } else {
        expect(interrupted).toBe(true);
        expect(h.requests).toHaveLength(4); // Sampling aborted, the same claim refreshed history and sampled again.
        expect(h.requests.at(-1)!.messages).toContainEqual(expect.objectContaining({role:'user',content:prompt}));
    }
},20000);

for (const source of ['unbound','cross-agent','old-task','setting off'] as const) test(`${source} firing cannot resume a delegated child`,async()=>{
    const h = await fixture('wake',source!=='setting off');
    let trigger = h.trigger;
    if (source==='unbound') trigger=(await h.ctx.fns.agent.wake({id:h.child.id,inMs:600000,prompt:'unbound'})).id;
    if (source==='cross-agent') {
        const {child:sibling} = await h.publish();
        expect((await h.drain(sibling.id)).last_error).toBeNull();
        const [foreign] = await h.rows('SELECT id,task_reservation_id FROM agent_triggers WHERE agent_id=? AND id<>?',h.child.id,h.trigger);
        expect(foreign.task_reservation_id).toBeNull();
        trigger=foreign.id;
    }
    await h.fire(trigger);
    if (source==='old-task') await h.ctx.fns.goal.delegationCancel({rootAgentId:h.root.id,goalId:h.goalId,rootRunToken:h.rootToken,reservationId:h.reservationId});
    const settled = await h.drain();
    expect(settled.last_processed_msg_idx).toBe(h.initial.last_processed_msg_idx);
    expect(h.requests.filter(r=>r.id===h.child.id)).toHaveLength(2);
    expect(await h.caps()).toHaveLength(1);
    expect((await h.receipts())[0].state).toBe(source==='old-task'?'invalidated':'pending');
},20000);

test('finish_task during a resumed cron claim closes the task without another model request',async()=>{
    const h = await fixture('cron');
    h.child.parentId = h.root.id;
    await h.run('UPDATE agents SET parent_id=? WHERE id=?',h.root.id,h.child.id);
    h.child.scratchpad.delegation = {parentId:h.root.id,status:'working'};
    h.child.scratchpad.todos = {tasks:[{id:'inspect',title:'Inspect result',status:'done'}]};
    h.child.scratchpad.mockTurn = 0;
    h.child.scratchpad.mockLLM = {turns:[{toolCalls:[{name:'finish_task',args:{summary:'Inspected',result:{ok:true}}}]}]};
    await h.ctx.fns.session.updateScratchpad({id:h.child.id,scratchpad:h.child.scratchpad});
    await h.fire(h.trigger);
    const settled = await h.drain();
    expect(settled.last_error).toBeNull();
    expect(h.requests).toHaveLength(3);
    expect(h.requests[2]!.messages).toContainEqual(expect.objectContaining({role:'user',content:prompt}));
    expect(await h.state()).toMatchObject({task_state:'closed',close_reason:'terminal'});
    expect((await h.caps()).at(-1)).toMatchObject({close_reason:'terminal',settled_checkpoint_id:expect.any(String)});
    expect(await h.rows('SELECT status,next_at FROM agent_triggers WHERE id=?',h.trigger)).toEqual([{status:'cancelled',next_at:null}]);
    expect((await h.ctx.fns.session.load({id:h.child.id})).scratchpad.delegation).toMatchObject({status:'ready',result:{result:{ok:true}}});
},20000);
