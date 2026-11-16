import {describe,test,expect} from 'bun:test';
import view from './agentPresets';
import middleware from '../$middleware_ui-lab-api';

const owner={user:{id:'owner',role:'owner'}};
const row=(id:string,extra:Record<string,unknown>={})=>({id,name:id.toUpperCase(),description:`${id} preset`,sort_order:0,builtin:false,allow:[],deny:[],plugins:[],exclude_sections:[],prompt:'',updated_at:5,...extra});
function setup(rows=[row('standard',{builtin:true,allow:['files.*'],plugins:['git']}),row('creator',{sort_order:1,builtin:true,allow:['*'],plugins:['*']})],defaultId='standard'){
 const calls:string[]=[];
 const ctx:any={fns:{agentPreset:{list:async()=>{calls.push('list');return rows;}},settings:{getString:async(o:any)=>{calls.push(`setting:${o.module}.${o.key}`);return defaultId;}}}};
 return {ctx,calls};
}
const req=(method='GET')=>new Request('https://mauzcode.test/ui-lab-api/agent-presets',{method});

describe('ui-lab agent presets',()=>{
 test('returns full presets in list order with the default',async()=>{
  const s=setup(),r=await view(s.ctx,owner as any,{req:req()});
  expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');expect(r.headers.get('vary')).toBe('Cookie');
  const body=await r.json() as any;
  expect(body.version).toBe(1);expect(body.defaultPresetId).toBe('standard');expect(body.defaultPresetMissing).toBe(false);
  expect(body.presets.map((p:any)=>p.id)).toEqual(['standard','creator']);
  expect(body.presets[0]).toEqual({id:'standard',name:'STANDARD',description:'standard preset',sortOrder:0,builtin:true,allow:['files.*'],deny:[],plugins:['git'],excludeSections:[],prompt:'',updatedAt:5});
  expect(s.calls).toContain('setting:agentPreset.default');
 });
 test('flags a missing default preset',async()=>{
  const body=await (await view(setup(undefined,'team').ctx,owner as any,{req:req()})).json() as any;
  expect(body.defaultPresetId).toBe('team');expect(body.defaultPresetMissing).toBe(true);expect(body.presets).toHaveLength(2);
 });
 test('requires an owner and GET without reading state',async()=>{
  let s=setup();expect((await view(s.ctx,null,{req:req()})).status).toBe(401);
  expect((await view(s.ctx,{user:{id:'v',role:'member'}} as any,{req:req()})).status).toBe(403);
  for(const m of ['POST','PUT','DELETE']){const r=await view(s.ctx,owner as any,{req:req(m)});expect(r.status).toBe(405);expect(r.headers.get('allow')).toBe('GET');}
  expect(s.calls).toHaveLength(0);
 });
 test('middleware dispatches after authentication',async()=>{let n=0;const ctx:any={fns:{frontendBridge:{agentPresets:async()=>{n++;return Response.json({ok:true})}}}};expect((await middleware(ctx,null,{req:req()})).status).toBe(401);expect((await middleware(ctx,owner as any,{req:req()})).status).toBe(200);expect(n).toBe(1);});
});
