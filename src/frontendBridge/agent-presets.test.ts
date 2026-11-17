import {describe,test,expect} from 'bun:test';
import { mkTestCtx } from '../_testCtx.entry';
import newSession from './newSession';
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

describe('effective preset catalogue across owner and session endpoints', () => {
 for (const stale of [false, true]) test(stale ? 'stale stored Standard cannot shadow code and preserved customs stay visible' : 'empty storage serves shipped presets without writes', async () => {
  const ctx = await mkTestCtx();
  await ctx.fns.procs.db.run({ sql: 'DELETE FROM agent_presets' });
  if (stale) {
   await ctx.fns.procs.db.run({ sql: `INSERT INTO agent_presets (id,name,description,sort_order,builtin,allow,deny,plugins,exclude_sections,prompt,updated_at)
    VALUES ('standard','Old Standard','Legacy description',10,true,'["tools.read"]','[]','["nrepl","openspec"]','[]','Keep old instructions',123)` });
   await ctx.fns.agentPreset.create({ preset: { id: 'standard-custom', name: 'Standard (preserved custom)', sort_order: 10, plugins: ['nrepl','openspec'], prompt: 'Keep old instructions' } });
  }
  const stored = await ctx.fns.procs.db.select({ sql: 'SELECT * FROM agent_presets ORDER BY id' });
  const shipped = ctx.fns.agentPreset.defaults({})[0]!;
  const oldSnapshot = { presetId: 'standard', name: 'Old Standard', layers: [{ id: 'standard', allow: ['tools.read'], deny: [], plugins: ['nrepl'], excludeSections: [], prompt: 'Keep old instructions' }] };
  await ctx.fns.procs.db.run({ sql: 'INSERT INTO agents (id,model,created_at,updated_at,preset_id,preset_snapshot) VALUES (?, ?, 1, 1, ?, ?::jsonb)', params: ['catalogue-old', 'mock/default:test', 'standard', JSON.stringify(oldSnapshot)] });
  const oldBytes = await ctx.fns.procs.db.select({ sql: "SELECT preset_id, preset_snapshot::text AS snapshot FROM agents WHERE id = 'catalogue-old'" });
  ctx.state.registry.projects.principal = async () => 'user:owner';
  ctx.state.registry.frontendBridge.modelCatalogue = async () => ({ groups: [], models: [{ model: 'mock/default:test', label: 'Test', disabled: false }] });
  ctx.state.registry.frontendBridge.iconData = async () => null;
  ctx.state.registry.settings.modelDefault = async () => 'mock/default:test';
  ctx.state.registry.auth.csrfToken = async () => 'test-token';
  for (const defaultId of ['standard', 'missing-custom']) {
   await ctx.fns.settings.set({ module: 'agentPreset', scopeType: 'global', key: 'default', value: defaultId });
   const ownerResponse = await view(ctx, owner as any, { req: req() });
   const menuResponse = await newSession(ctx, owner as any, { req: new Request('https://mauzcode.test/ui-lab-api/new-session') });
   for (const response of [ownerResponse, menuResponse]) {
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('vary')).toBe('Cookie');
   }
   const full = await ownerResponse.json() as any;
   const menu = await menuResponse.json() as any;
   expect(full.defaultPresetId).toBe(defaultId);
   expect(menu.defaultPresetId).toBe(defaultId);
   expect(full.defaultPresetMissing).toBe(defaultId !== 'standard');
   expect(full.presets.map((p:any) => p.id)).toEqual(stale ? ['standard','standard-custom','creator','minimal'] : ['standard','creator','minimal']);
   expect(menu.presets).toEqual(full.presets.map(({id,name,description,sortOrder}:any) => ({id,name,description,sortOrder})));
   const standard = full.presets.find((p:any) => p.id === 'standard');
   expect(standard).toEqual({ id: shipped.id, name: shipped.name, description: shipped.description, sortOrder: shipped.sort_order, builtin: true, allow: shipped.allow, deny: shipped.deny, plugins: shipped.plugins, excludeSections: shipped.exclude_sections, prompt: shipped.prompt, updatedAt: 0 });
   const snapshot = await ctx.fns.agentPreset.resolve({ id: 'standard' });
   expect(snapshot.layers[0]).toEqual({ id: standard.id, allow: standard.allow, deny: standard.deny, plugins: standard.plugins, excludeSections: standard.excludeSections, prompt: standard.prompt });
   if (defaultId === 'missing-custom') await expect(ctx.fns.agentPreset.resolve({})).rejects.toThrow('missing-custom');
   expect(await ctx.fns.settings.getString({ module: 'agentPreset', scopeType: 'global', key: 'default' })).toBe(defaultId);
  }
  expect(await ctx.fns.procs.db.select({ sql: 'SELECT * FROM agent_presets ORDER BY id' })).toEqual(stored);
  expect(await ctx.fns.procs.db.select({ sql: "SELECT preset_id, preset_snapshot::text AS snapshot FROM agents WHERE id = 'catalogue-old'" })).toEqual(oldBytes);
 });
});

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
