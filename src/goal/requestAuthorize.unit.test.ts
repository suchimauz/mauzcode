import {test,expect} from 'bun:test';
import authorize from './requestAuthorize';
const authority={rootAgentId:'root',goalId:'goal',sourceAgentId:'child',sourceRunId:'claim',capabilityId:'cap',authorizedThroughIdx:7,allowContinuation:false};
test('ordinary dispatch has no feature or SQL calls',async()=>{await authorize({fns:{}} as any,null,{});});
test('guard fails closed disabled, invalid frontier and durable denial; one read-only snapshot',async()=>{
 for(const variant of ['disabled','frontier','denied','allowed']){
 let calls=0;
 const ctx:any={goalRequestContext:{agentId:'child',authority:{...authority,...(variant==='frontier'?{authorizedThroughIdx:undefined}:{})}},fns:{goal:{enabled:async()=>variant!=='disabled'},procs:{db:{select:async(o:any)=>{calls++;expect(o.sql).toContain('WITH RECURSIVE');expect(o.sql).not.toContain('FOR UPDATE');expect(o.params).toEqual(['cap','root','goal','child','claim',7]);return [{allowed:variant==='allowed'}];}}}}};
 if(variant==='allowed') await authorize(ctx,null,{}); else await expect(authorize(ctx,null,{})).rejects.toMatchObject({goalRequestDenied:true});
 expect(calls).toBe(variant==='disabled'||variant==='frontier'?0:1);
 }
});
// Dispatch authorization now belongs to agent.run; runGoal.unit.test.ts covers
// denial before models.stream. Retired provider adapters are not imported here.
