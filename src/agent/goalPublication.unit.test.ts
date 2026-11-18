import delegate from './delegate';
import {test,expect} from 'bun:test';
import publish from './publishGoalDelegation';
import capture from '../goal/delegationCapture';
import scope from '../goal/delegationScope';
import delegateTask from './delegateTask';
import plan from '../todo/create';
import appendEvent from '../session/appendEvent';
const binding:any={rootAgentId:'root',sourceAgentId:'root',goalId:'goal',runToken:'claim'};
async function fixture(fail='') {
 let active=false;const calls:string[]=[];const rows:string[]=[];
 const child:any={id:'child',scratchpad:{}};
 const fns:any={goal:{},session:{},agent:{},events:{},todo:{},procs:{db:{}},models:{}};
 const ctx:any={state:{agent:{},procs:{db:{transactionStorage:{getStore:()=>active?{active:true}:undefined}}}}};
 // Plain mocks keep their original (opts) shape; only the ctx-taking real validator is wrapped.
 Object.defineProperty(ctx, 'fns', { value: fns, configurable: true });
 const call=(name:string)=>async()=>{calls.push(name);if(name===fail)throw Error(name);if(['reserve','message','publish','event','schedule'].includes(name)){expect(active).toBe(true);rows.push(name);}return {idx:0};};
 ctx.fns.goal.delegationCapture=async()=>binding;ctx.fns.goal.delegationReserve=async()=>{await call('reserve')();return {reservationId:'reservation'};};
 ctx.fns.goal.delegationPublish=async(o:any)=>{expect(active).toBe(true);expect(o).toEqual({reservationId:'reservation',delegatorRunToken:'claim',authorizedThroughIdx:0});expect(calls).toContain('message');expect(calls).not.toContain('schedule');await call('publish')();};
 ctx.fns.procs.db.transaction=async({fn}:any)=>{active=true;try{const result=await fn();calls.push('commit');return result;}catch(e){rows.length=0;throw e;}finally{active=false;}};
 ctx.fns.session.fork=async(o:any)=>{expect(o.deferPublication).toBe(true);expect(active).toBe(true);calls.push('fork');return child;};
 ctx.fns.agent.start=ctx.fns.session.fork;
 ctx.fns.session.updateScratchpad=call('scratchpad');ctx.fns.todo.create=call('todos');ctx.fns.session.appendMessage=async(o:any)=>{expect(o.message.message_type).toBe('delegation_task');return call('message')();};
 ctx.fns.session.appendEvent=async(o:any)=>{expect(o.deferPublication).toBe(true);return call('event')();};
 ctx.fns.procs.db.run=call('schedule');ctx.fns.agent.renderEventHtml=async()=>'';
 // Real shared validator; only its model-provider dependencies are stubbed. The wrapper injects THIS ctx, as $main does.
 const resolveChildModel = await import('./resolveChildModel').then(m => m.default);
 fns.agent.resolveChildModel = (o: any) => resolveChildModel(ctx, null, o);
 fns.agent.requireModel = (o: any) => { const m = String(o?.model ?? ''); if (!m.trim()) throw Error('no model selected'); return m; };
 fns.models.resolveRoute = async (o: any) => { if (!/^mock\/default:m$/.test(String(o?.route ?? ''))) throw Error('unavailable child model ' + o?.route); return { route: o.route, connectionId: 'conn', model: o.route.slice(o.route.lastIndexOf(':') + 1) }; };
 fns.models.listModels = async () => ({ models: [{ id: 'm', reasoning: { supported: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] } }] });
 for(const [ns,key] of [['session','syncAgentState'],['events','emitAgentsChanged'],['events','refreshAgentMeta'],['agent','wakeWorker']] as const)ctx.fns[ns][key]=async()=>{expect(active).toBe(false);calls.push(key);};
 return {ctx,calls,rows};
}
const args:any={parent:{id:'root',model:'mock/default:test'},prompt:'task @someone',scratchpad:{}};
test('publication commits reservation, first message and schedule before visibility',async()=>{const f=await fixture();expect(await publish(f.ctx,null,args)).toEqual({id:'child'});expect(f.rows).toEqual(['reserve','message','publish','event','schedule']);expect(f.calls.indexOf('commit')).toBeLessThan(f.calls.indexOf('emitAgentsChanged'));expect(f.ctx.state.agent.child.id).toBe('child');});
for(const point of ['reserve','message','publish','event','schedule'])test('rollback '+point+' leaves no live child or notification',async()=>{const f=await fixture(point);await expect(publish(f.ctx,null,args)).rejects.toThrow(point);expect(f.rows).toEqual([]);expect(f.ctx.state.agent).toEqual({});expect(f.calls).not.toContain('emitAgentsChanged');expect(f.calls).not.toContain('wakeWorker');});
test('Goal await refusal creates no child',async()=>{const f=await fixture();await expect(delegateTask(f.ctx,null,{parent:args.parent,task:'work'})).rejects.toThrow('await mode');expect(f.calls).toEqual([]);});
test('scope copies immutable authority and isolates concurrent dispatches',async()=>{const ctx:any={state:{}};const b={...binding};await scope(ctx,null,{action:'with',binding:b,fn:async()=>{b.runToken='changed';const a:any=await scope(ctx,null,{action:'read'});expect(a.runToken).toBe('claim');expect(Object.isFrozen(a)).toBe(true);}});expect(await scope(ctx,null,{action:'read'})).toBeUndefined();});
test('capture rejects mismatched registry and source',async()=>{const f=await fixture();f.ctx.fns.goal.delegationScope=async()=>binding;f.ctx.fns.goal.runStopRegistry=async()=>({binding:{...binding,runToken:'later'}});await expect(capture(f.ctx,null,{agentId:'root'})).rejects.toThrow('unavailable');await expect(capture(f.ctx,null,{agentId:'other'})).rejects.toThrow('match');});
test('deferred session APIs reject outside transaction before writes',async()=>{const f=await fixture();await expect(plan(f.ctx,null,{agent:{id:'child'} as any,tasks:[{id:'x',title:'x'}],deferPublication:true})).rejects.toThrow('transaction');await expect(appendEvent(f.ctx,null,{id:'child',event:{type:'user'},deferPublication:true})).rejects.toThrow('transaction');expect(f.calls).toEqual([]);});
test('clear isolates nested dispatch, restores on throw, and does not affect concurrent scope',async()=>{const ctx:any={state:{}};await Promise.all([scope(ctx,null,{action:'with',binding,fn:async()=>{await expect(scope(ctx,null,{action:'clear',fn:async()=>{expect(await scope(ctx,null,{action:'read'})).toBeUndefined();await Promise.resolve();throw Error('nested');}})).rejects.toThrow('nested');expect((await scope(ctx,null,{action:'read'}) as any).runToken).toBe('claim');}}),scope(ctx,null,{action:'with',binding:{...binding,runToken:'parallel'},fn:async()=>{await new Promise(r=>setTimeout(r,1));expect((await scope(ctx,null,{action:'read'}) as any).runToken).toBe('parallel');}})]);expect(await scope(ctx,null,{action:'read'})).toBeUndefined();});
test('delegate and async delegateTask both route through atomic publication, never direct run',async()=>{const f=await fixture();let packet:any;f.ctx.fns.agent.publishGoalDelegation=async(o:any)=>{packet=o;return {id:'queued'};};f.ctx.fns.agent.buildDelegatedTaskPrompt=()=> 'wrapped task';expect(await delegate(f.ctx,null,{agent:args.parent,title:'Plan',tasks:[{id:'x',title:'Work'}]})).toEqual({id:'queued',status:'working'});expect(packet.tasks[0].id).toBe('x');expect(packet.forkContext).toBeUndefined();expect(packet.model).toBeUndefined();expect(packet.reasoningEffort).toBeUndefined();expect(await delegateTask(f.ctx,null,{parent:args.parent,task:'task',mode:'async',forkContext:true})).toEqual({childId:'queued',started:true});expect(packet.forkContext).toBe(true);expect(packet.prompt).toBe('wrapped task');expect(f.calls).toEqual([]);});
test('an explicit child model reaches the fork while an inherited route does not override it',async()=>{
  const fresh = async () => {
    const f=await fixture();const seen:any[]=[];f.ctx.fns.session.fork=async(o:any)=>{expect(o.deferPublication).toBe(true);seen.push(o);return {id:'child',scratchpad:{}};};f.ctx.fns.agent.start=f.ctx.fns.session.fork;
    return { f, seen };
  };
    const g = await fresh();
    await publish(g.f.ctx, null, { ...args, model: 'mock/default:m', reasoningEffort: 'high' });
    expect(g.seen[0]).toMatchObject({ model: 'mock/default:m', reasoningEffort: 'high' });
    const i = await fresh();
    await publish(i.f.ctx, null, { ...args, reasoningEffort: 'low' });
    expect(i.seen[0]).toMatchObject({ model: 'mock/default:test', reasoningEffort: 'low' });
    const r = await fresh();
    await expect(publish(r.f.ctx, null, { ...args, model: 'mock/default:gone' })).rejects.toThrow('unavailable child model');
    expect(r.seen).toEqual([]);expect(r.f.rows).toEqual([]);expect(r.f.ctx.state.agent).toEqual({});
    const b = await fresh();
    await expect(publish(b.f.ctx, null, { ...args, reasoningEffort: 'ultra' })).rejects.toThrow('unsupported reasoning effort');
    expect(b.seen).toEqual([]);expect(b.f.rows).toEqual([]);
});
test('capture ordinary disabled/absent allowed, required marker never fallback',async()=>{const f=await fixture();f.ctx.fns.goal.delegationScope=async()=>undefined;f.ctx.fns.goal.enabled=async()=>false;f.ctx.fns.procs.db.select=async()=>[{required:null}];expect(await capture(f.ctx,null,{agentId:'ordinary'})).toBeUndefined();f.ctx.fns.goal.enabled=async()=>true;f.ctx.fns.goal.read=async()=>({enabled:true,goal:null});expect(await capture(f.ctx,null,{agentId:'ordinary'})).toBeUndefined();f.ctx.fns.procs.db.select=async()=>[{required:'true'}];await expect(capture(f.ctx,null,{agentId:'ordinary'})).rejects.toThrow('captured run');});
