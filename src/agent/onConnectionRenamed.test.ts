import { expect, test } from 'bun:test';
import { mkModelsTestCtx } from './modelsTestCtx.entry';
import start from './$start';

test('rename rewrites exact account prefix, native separators, archived routes and kv idempotently',async()=>{
 const ctx=await mkModelsTestCtx();
 const a=await ctx.fns.agent.start({model:'mock/A 🚀 space:vendor/model:rev'});
 const b=await ctx.fns.agent.start({model:'mock/A 🚀 space extra:vendor/model:rev'});
 const archived=await ctx.fns.agent.start({model:'mock/A 🚀 space:old:with/slashes'});
 await ctx.fns.procs.db.run({sql:'UPDATE agents SET archived_at = ? WHERE id = ?',params:[Date.now(),archived.id]});
 await ctx.fns.procs.db.run({sql:"INSERT INTO kv(key,value) VALUES ('last-model',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params:[a.model]});
 const result=await ctx.fns.agent.onConnectionRenamed({provider:'mock',from:'A 🚀 space',to:'B %_ space'});
 expect(result.agents.sort()).toEqual([a.id,archived.id].sort());expect(result.lastModel).toBe(true);
 expect(ctx.state.agent[a.id].model).toBe('mock/B %_ space:vendor/model:rev');expect(ctx.state.agent[b.id].model).toBe('mock/A 🚀 space extra:vendor/model:rev');
 expect((await ctx.fns.procs.db.select({sql:"SELECT value FROM kv WHERE key='last-model'"}))[0].value).toBe('mock/B %_ space:vendor/model:rev');
 expect(await ctx.fns.agent.onConnectionRenamed({provider:'mock',from:'A 🚀 space',to:'B %_ space'})).toEqual({agents:[],lastModel:false});
 expect(await ctx.fns.agent.onConnectionRenamed({provider:'mock',from:'B %_ space',to:'B %_ space'})).toEqual({agents:[],lastModel:false});
});

test('startup subscribes once even with disabled worker and repeated startup',async()=>{
 const handlers=new Set<(e:any)=>void>();const calls:any[]=[];
 const ctx:any={state:{},env:{AGENT_WORKER:'off'},fns:{session:{loadAll:async()=>({loaded:0})},agent:{onConnectionRenamed:async(o:any)=>{calls.push(o);}},procs:{events:{subscribe:({handler}:any)=>{handlers.add(handler);return()=>handlers.delete(handler);}},log:{info:()=>{},error:()=>{}}}}};
 await start(ctx,null);await start(ctx,null);expect(handlers.size).toBe(1);
 for(const handler of handlers){handler({type:'irrelevant'});handler({type:'models.connectionRenamed',provider:'custom',from:'A',to:'B'});}
 await Promise.resolve();expect(calls).toEqual([{provider:'custom',from:'A',to:'B'}]);
});
