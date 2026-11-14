import {test,expect} from 'bun:test';
import capability from './nativeCapability';
import list from '../tools/list';
import schemas from '../tools/schemas';
import wireTools from '../agent/wireTools';
function fixture(){
 const declarations=[{key:'goal.get_goal',module:'goal',name:'get_goal',fn:'goal.toolGet',parameters:{type:'object',properties:{},required:[],additionalProperties:false}},{key:'goal.update_goal',module:'goal',name:'update_goal',fn:'goal.toolUpdate',parameters:{type:'object',properties:{status:{type:'string',enum:['complete','paused','blocked']}},required:['status'],additionalProperties:false}}];
 const owner:any={id:'a',model:'openai:test'};
 const ctx:any={state:{agent:{a:owner},registry:{goal:{toolGet:()=>{},toolUpdate:()=>{}}},tools:{registry:new Map(declarations.map(t=>[t.key,t]))}},fns:{tools:{validate:()=>({ok:true})},agent:{},models:{resolveRoute:async()=>({api:'openai',provider:'openai'})}}};
 ctx.fns.tools.list=(o:any)=>list(ctx,null,o);ctx.fns.tools.schemas=(o:any)=>schemas(ctx,null,o);ctx.fns.agent.wireTools=(o:any)=>wireTools(ctx,null,o);
 return {ctx,owner,declarations};
}
test('installed handlers and actual registry/wire surface enable capability',async()=>{const f=fixture();expect(await capability(f.ctx,null,{agentId:'a'})).toMatchObject({available:true,reason:'available'});});
test('missing production wrappers fail closed',async()=>{const f=fixture();f.ctx.state.tools.registry.clear();expect((await capability(f.ctx,null,{agentId:'a'})).available).toBe(false);});
test('fabricated proxy function is not loaded implementation',async()=>{const f=fixture();delete f.ctx.state.registry.goal.toolUpdate;f.ctx.fns.goal={toolUpdate:()=>{}};expect((await capability(f.ctx,null,{agentId:'a'})).reason).toBe('native_goal_handler_unavailable');});
test('unsafe active model schema fails closed',async()=>{const f=fixture();f.declarations[1]!.parameters.properties.status!.enum.push('active');expect((await capability(f.ctx,null,{agentId:'a'})).reason).toBe('native_goal_schema_mismatch');});
test('owner filtering fails closed',async()=>{const f=fixture();f.owner.tools=['get_goal'];expect((await capability(f.ctx,null,{agentId:'a'})).reason).toBe('native_goal_tools_filtered');});
test('declared validator must actually be loaded',async()=>{const f=fixture();Object.assign(f.declarations[1]!,{validate:'goal.validateUpdate'});expect((await capability(f.ctx,null,{agentId:'a'})).reason).toBe('native_goal_validator_unavailable');});
const routes = [
 {model:'custom/Asoft LLM Gate:vendor/model:v1',connectionId:'custom-connection'},
 {model:'codex/example-account:gpt-6-astra',connectionId:'codex-connection'},
 {model:'claude/personal:claude-opus-5-5',connectionId:'claude-connection'},
];
for(const route of routes) {
 test(`${route.model}: effective schemas allow goals without provider/transport exclusion`,async()=>{
  const f=fixture(); f.owner.model=route.model; f.ctx.fns.models.resolveRoute=async()=>route;
  const used:(string | undefined)[]=[];
  f.ctx.fns.agent.wireTools=(o:any)=>{used.push(o.api);return wireTools(f.ctx,null,o);};
  expect(await capability(f.ctx,null,{agentId:'a'})).toMatchObject({available:true,reason:'available'});
  expect(used).toEqual([undefined]);
 });
 test(`${route.model}: transport does not bypass owner narrowing or loaded handlers`,async()=>{
  const f=fixture();f.owner.model=route.model;f.ctx.fns.models.resolveRoute=async()=>route;
  f.owner.tools=['get_goal'];
  expect((await capability(f.ctx,null,{agentId:'a'})).reason).toBe('native_goal_tools_filtered');
  delete f.owner.tools; delete f.ctx.state.registry.goal.toolUpdate;
  expect((await capability(f.ctx,null,{agentId:'a'})).reason).toBe('native_goal_handler_unavailable');
 });
}
test('wire schema corruption fails closed',async()=>{
 const f=fixture();f.ctx.fns.agent.wireTools=()=>[{name:'get_goal',parameters:{}}];
 expect((await capability(f.ctx,null,{agentId:'a'})).reason).toBe('native_goal_tools_filtered');
});
