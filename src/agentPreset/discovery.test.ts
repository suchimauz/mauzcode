import { describe, expect, test } from 'bun:test';
import { makeCtx } from '../$main';
import guardFns from './guardFns';
import predicate from './predicate';
import allows from './allows';
import generation from './generation';
import origin from './origin';
import compilePattern from './compilePattern';
import defaults from './defaults';
import coreCatalogue from './coreCatalogue';
import discoveryVisible from './discoveryVisible';
import canvasKinds from '../canvas/kinds';
import canvasSearch from '../canvas/search';
import canvasPrompt from '../canvas/promptSection';
import inputKinds from '../input/kinds';
import inputPrompt from '../input/promptSection';
import list from '../runtime/docs/list';
import get from '../runtime/docs/get';
import search from '../runtime/docs/search';
import toolsList from '../tools/list';
import toolsPermitted from '../tools/permitted';
import toolsRequirements from '../tools/requirements';
import schemas from '../tools/schemas';
import wireTools from '../agent/wireTools';
import fullSystemPrompt from '../agent/fullSystemPrompt';
import pluginDocs from '../plugins/docs';
import pluginRead from '../plugins/read';
import pluginFunctions from '../plugins/functions';
import pluginSearch from '../plugins/search';
import canvasLoader from '../canvas/$loader_canvas';
import inputLoader from '../input/$loader_input';
import agentEval from '../repl/eval';
import processEval from '../procs/repl/eval';
import toolEval from '../tools/eval';
import ghComment from '../../plugins/gh/src/gh/comment';

function fixture() {
 const ctx = makeCtx(); const r = ctx.state.registry as any;
 const plugins = [{name:'external',plugin:true,namespaces:['external','privateAlias'],fns:['external.view','privateAlias.hidden'],routes:[],label:'External',description:'external catalogue'}];
 r.agentPreset={allows,generation,origin,compilePattern,defaults,coreCatalogue,discoveryVisible,guardFns,predicate};
 r.procs={modules:{list:()=>plugins},log:{debug:()=>{}}};
 r.canvas={kinds:canvasKinds,search:canvasSearch,promptSection:canvasPrompt,show:()=>true,list:()=>[],close:()=>{},reopen:()=>{},setState:()=>{}};
 r.input={kinds:inputKinds,promptSection:inputPrompt,request:()=>true};
 r.runtime={docs:{list,get,search}};
 r.tools={list:toolsList,schemas,permitted:toolsPermitted,requirements:toolsRequirements,read:()=>{},bash:()=>{}};
 r.plugins={list:()=>plugins,docs:pluginDocs,read:pluginRead,functions:pluginFunctions,search:pluginSearch};
 r.external={view:()=>{},unrelated:()=>{}}; r.privateAlias={hidden:()=>{}};
 for (const [name,fn] of [['external.view',r.external.view],['privateAlias.hidden',r.privateAlias.hidden],['canvas.show',r.canvas.show],['tools.read',r.tools.read],['tools.bash',r.tools.bash]] as const) fn.meta={name,summary:name,signature:'({})',canvas:name==='external.view'?'external.panel':undefined};
 (ctx.state as any).canvas={kinds:{file:{name:'file',module:'canvas',hint:'file',requires:['canvas.show']},panel:{name:'external.panel',module:'external',hint:'panel',requires:['canvas.show','external.view']},unknown:{name:'external.unknown',module:'external',hint:'unknown'}}};
 (ctx.state as any).input={kinds:{choice:{name:'choice',module:'input',hint:'choose',requires:['input.request']},external:{name:'external-form',module:'external',hint:'form',requires:['input.request','external.view']},unknown:{name:'external-unknown',module:'external',hint:'unknown'}}};
 (ctx.state as any).tools={registry:new Map(['read','bash'].map(name=>[name,{key:'tools.'+name,module:'tools',name,fn:'tools.'+name,description:name,parameters:{type:'object',properties:{}}}]))};
 const snapshot=(deny:string[]=[],pluginGrant=['*']):types.agentPreset.Snapshot=>({presetId:'test',name:'Test',layers:[{id:'test',allow:['*'],deny,plugins:pluginGrant,prompt:'',excludeSections:[]}]});
 const view=(s=snapshot())=>guardFns(ctx,null,{snapshot:s});
 return {ctx,r,snapshot,view};
}

describe('live required-function discovery',()=>{
 test('Standard GitHub grant preserves confirmation before credentials or network access',async()=>{
  const {ctx,r,view}=fixture();
  r.plugins.list()[0].name='gh'; r.plugins.list()[0].namespaces=['gh'];
  r.gh={comment:ghComment};
  const preset=defaults(ctx,null,{})[0]!;
  const standard:types.agentPreset.Snapshot={presetId:preset.id,name:preset.name,layers:[{id:preset.id,allow:preset.allow,plugins:preset.plugins,deny:[],prompt:'',excludeSections:[]}]};
  await expect(view(standard).gh.comment({owner:'fixture',repo:'fixture',n:1,body:'test'})).rejects.toThrow('confirm: true');
 });
 test('Standard discovers granted installed plugins and their input instructions without widening other access',async()=>{
  const {ctx,r,view}=fixture();
  r.plugins.list()[0].name='openspec';
  const preset=defaults(ctx,null,{})[0]!;
  const standard:types.agentPreset.Snapshot={presetId:preset.id,name:preset.name,layers:[{id:preset.id,allow:preset.allow,plugins:preset.plugins,deny:[],prompt:'',excludeSections:[]}]};
  const f=view(standard);
  expect(f.runtime.docs.get({name:'external.view'}).name).toBe('external.view');
  expect(f.plugins.functions({name:'openspec'}).map(x=>x.name)).toContain('external.view');
  expect(f.input.kinds({}).map(x=>x.name)).toEqual(['choice','external-form']);
  expect(f.input.promptSection({})).toContain('external-form');
  const denied=structuredClone(standard); denied.layers[0]!.deny.push('external.view');
  expect(view(denied).input.kinds({}).map(x=>x.name)).toEqual(['choice']);
  expect(view(denied).input.promptSection({})).not.toContain('external-form');
  expect(()=>view(denied).runtime.docs.get({name:'external.view'})).toThrow();
  const restricted=structuredClone(standard); restricted.layers[0]!.plugins=[];
  expect(()=>view(restricted).plugins.functions({name:'openspec'})).toThrow();
 });
 test('Creator requires annotations; internal callers retain unknown kinds; metadata restores visibility without changing actions',async()=>{
  const {ctx,view}=fixture(); const f=view();
  expect((await f.canvas.kinds({})).map(x=>x.name)).toEqual(['external.panel','file']);
  expect(f.input.kinds({}).map(x=>x.name)).toEqual(['choice','external-form']);
  expect((await ctx.fns.canvas.kinds({}))).toHaveLength(3);
  expect(ctx.fns.input.kinds({})).toHaveLength(3);
  expect(await f.canvas.promptSection({})).not.toContain('external.unknown');
  expect(f.input.promptSection({})).not.toContain('external-unknown');
  expect(await ctx.fns.canvas.promptSection({})).toContain('external.unknown');
  expect(ctx.fns.input.promptSection({})).toContain('external-unknown');
  expect(Boolean(await f.canvas.show({kind:'external.unknown',args:{}}))).toBe(true);
  (ctx.state as any).canvas.kinds.unknown.requires=['canvas.show','external.view'];
  (ctx.state as any).input.kinds.unknown.requires=['input.request','external.view'];
  expect(await f.canvas.kinds({})).toHaveLength(3); expect(f.input.kinds({})).toHaveLength(3);
 });
 test('all dependencies must be live and permitted, unrelated grant never suffices; filter before limit',async()=>{
  const {ctx,r,view,snapshot}=fixture(); const f=view(snapshot(['external.view']));
  expect(await f.canvas.search({limit:1})).toMatchObject([{name:'file'}]);
  expect(f.input.kinds({}).map(x=>x.name)).toEqual(['choice']);
  delete r.external.view;
  expect((await view().canvas.kinds({})).map(x=>x.name)).toEqual(['file']);
  expect(await ctx.fns.canvas.kinds({})).toHaveLength(3);
 });
 test('guard overwrites forged predicates for direct prompt/catalogue calls',async()=>{
  const {view,snapshot}=fixture();const f=view(snapshot(['input.request','canvas.close','canvas.setState','external.view']));
  expect(f.input.promptSection({allows:()=>true})).toBe('');
  expect(f.input.kinds({allows:()=>true})).toEqual([]);
  const text=await f.canvas.promptSection({allows:()=>true});
  expect(text).toContain('canvas.show');expect(text).not.toContain('canvas.close');expect(text).not.toContain('canvas.setState');expect(text).not.toContain('external.panel');
 });
 test('Standard and inherited snapshots cannot see plugin entries',async()=>{
  const {view,snapshot}=fixture(); const parent=snapshot([],[]);const child=snapshot();child.layers.unshift(...parent.layers);
  for(const s of [parent,child]) {const f=view(s);expect((await f.canvas.kinds({})).map(x=>x.name)).toEqual(['file']);expect(f.input.kinds({})).toHaveLength(1);}
 });
 test('allowed procedures still call denied internals',async()=>{
  const {r,view,snapshot}=fixture();r.canvas.show=(c:Context)=>(c.fns as unknown as {privateAlias:{hidden(opts:{}):number}}).privateAlias.hidden({});r.privateAlias.hidden=()=>42;
  expect(Number(await view(snapshot(['privateAlias.hidden'])).canvas.show({kind:'file',args:{}}))).toBe(42);
 });
});

describe('catalogues and exact lookup',()=>{
 test('tools schemas and docs list use represented functions, not helper grant; internal results unchanged',()=>{
  const {ctx,view,snapshot}=fixture();const f=view(snapshot(['tools.bash','privateAlias.hidden']));
  expect(f.tools.list({allows:()=>true}).map(x=>x.name)).toEqual(['read']);
  for(const api of ['openai','responses','anthropic']) expect(f.tools.schemas({api,allows:()=>true})).toHaveLength(1);
  expect(f.runtime.docs.list({namespace:'privateAlias',allows:()=>true})).toEqual([]);
  expect(ctx.fns.tools.list({})).toHaveLength(2);expect(ctx.fns.runtime.docs.list({namespace:'privateAlias'})).toHaveLength(1);
  expect(wireTools(ctx,null,{agent:{preset:snapshot(['tools.bash'])} as any})).toHaveLength(1);
 });
 test('exact docs/plugin lookups and partial plugin results hide denied structured entries',async()=>{
  const {ctx,view,snapshot}=fixture();const f=view(snapshot(['privateAlias.hidden']));
  expect(()=>f.runtime.docs.get({name:'privateAlias.hidden',allows:()=>true})).toThrow();
  expect(await f.runtime.docs.search({query:'privateAlias.hidden',mode:'lexical'})).toEqual([]);
  expect(f.plugins.functions({name:'external'}).map(x=>x.name)).toEqual(['external.view']);
  expect((await f.plugins.read({name:'external'})).namespaces).toEqual(['external']);
  expect((await f.plugins.read({name:'external',includeFunctions:false})).namespaces).toEqual(['external']);
  expect((await f.plugins.search({query:'external',mode:'lexical'}))[0]!.functions.map(x=>x.name)).toEqual(['external.view']);
  const denied=view(snapshot([],[]));expect(()=>denied.plugins.functions({name:'external'})).toThrow();
  expect(denied.plugins.read({name:'external'})).rejects.toThrow();
  expect(await denied.plugins.search({query:'external',mode:'lexical'})).toEqual([]);
  expect(ctx.fns.plugins.functions({name:'external'})).toHaveLength(2);
 });
 test('full prompt carries the same predicate and native schemas preserve inherited intersection',async()=>{
  const {ctx,snapshot}=fixture();(ctx.state as any).prompts={registry:new Map([['canvas',{id:'canvas',order:1,requires:['canvas.show'],generator:'canvas.promptSection',body:''}],['input',{id:'input',order:2,requires:[],generator:'input.promptSection',body:''}]])};
  const preset=snapshot(['canvas.close','canvas.setState','input.request','tools.bash']);
  const text=await fullSystemPrompt(ctx,null,{agent:{preset} as any});
  expect(text).toContain('canvas.show');expect(text).not.toContain('canvas.close');expect(text).not.toContain('canvas.setState');expect(text).not.toContain('input.request');
  const child=snapshot(); child.layers.unshift(...preset.layers);expect(wireTools(ctx,null,{agent:{preset:child} as any}).map(x=>x.name)).toEqual(['read']);
 });
});

test('canvas metadata loader validates exact names and mandatory public entrypoint',async()=>{
 const {ctx}=fixture(); const entry={name:'fixture',moduleDir:'external',rel:'fixture',mod:{default:{render:()=>'',requires:['external.view']}}};
 await expect(canvasLoader(ctx,null,{entries:[entry]})).rejects.toThrow('canvas.show');
 entry.mod.default.requires=['canvas.show','external.*'];await expect(canvasLoader(ctx,null,{entries:[entry]})).rejects.toThrow('exact');
 entry.mod.default.requires=['canvas.show','external.view'];await canvasLoader(ctx,null,{entries:[entry]});
});

test('input metadata loader validates public entrypoint without altering ownership',async()=>{
 const {ctx,r}=fixture();r.procs.modules.list=()=>[{name:'core',dir:'/fixture'}];
 const entry={name:'choice',moduleDir:'input',rel:'input/choice',root:'core',rootDir:'/fixture',abs:'/fixture/choice.ts',mod:{default:{open:()=>'',submit:()=>({}),done:()=>'',requires:['external.view']}}};
 (ctx.state as any).input.kinds={};
 await expect(inputLoader(ctx,null,{entries:[entry]})).rejects.toThrow('input.request');
 entry.mod.default.requires=['input.request'];await inputLoader(ctx,null,{entries:[entry]});
});

test('compatibility prompt splits advertise only granted functions; markdown renderer remains independent',async()=>{
 const {ctx,r,snapshot}=fixture();
 r.ui={eval:()=>{},action:()=>{},createAgent:()=>{},sendToAgent:()=>{}};
 r.screen={eval:()=>{},openTab:()=>{}};r.browser={navigate:()=>{}};
 const sections=[];
 for(const suffix of ['compatibility','compatibilityAction','compatibilityAgents','compatibilityScreen','compatibilityBrowser']) {
  const source=await Bun.file(`${import.meta.dir}/../agent/$prompt_${suffix}.md`).text();
  sections.push({id:suffix,order:25,requires:source.match(/requires: \[([^\]]+)\]/)![1]!.split(',').map(x=>x.trim()),body:source.split('---')[2]});
 }
 (ctx.state as any).prompts={registry:new Map(sections.map(s=>[s.id,s]))};
 const preset=snapshot(['ui.action','ui.createAgent','ui.sendToAgent','screen.*','browser.*']);
 const text=await fullSystemPrompt(ctx,null,{agent:{preset} as any});
 expect(text).toContain('ui.eval');for(const denied of ['screen.eval','screen.openTab','browser automation','ui.action','ui.createAgent']) expect(text).not.toContain(denied);
 const creator=await fullSystemPrompt(ctx,null,{agent:{preset:snapshot()} as any});expect(creator).toContain('screen.openTab');expect(creator).toContain('browser automation');
 // This change must not gate markdown.render on renderer-internal dependencies.
 expect(await Bun.file(`${import.meta.dir}/../markdown/promptSection.ts`).text()).not.toContain('discoveryVisible');
});

test('scoped schemas omit unloaded represented functions while internal catalogues stay stable',()=>{
 const {ctx,r,view}=fixture();delete r.tools.bash;
 expect(view().tools.schemas({api:'openai'})).toHaveLength(1);
 expect(ctx.fns.tools.schemas({api:'openai'})).toHaveLength(2);
});

test('HTML survives denied optional state guidance in direct and full prompts',async()=>{
 const {ctx,r,view,snapshot}=fixture();
 const {default:html,hint}=await import('../canvas/$canvas_html');
 r.settings={get:()=>false};
 (ctx.state as any).canvas.kinds.html={...html,name:'html',module:'canvas',hint};
 (ctx.state as any).prompts={registry:new Map([['canvas',{id:'canvas',order:1,requires:['canvas.show'],generator:'canvas.promptSection',body:''}]])};
 const preset=snapshot(['canvas.list','canvas.setState','canvas.close']);
 const direct=await view(preset).canvas.promptSection({allows:()=>true});
 expect((await view(preset).canvas.kinds({})).map(k=>k.name)).toContain('html');
 expect(direct).toContain('- `html`');expect(direct).not.toContain('canvas.setState');expect(direct).not.toContain('canvas.list');
 const full=await fullSystemPrompt(ctx,null,{agent:{preset} as any});expect(full).toContain(direct);
 expect(await view().canvas.promptSection({})).toContain('You can poll the state with canvas.list or change it with canvas.setState');
 expect(await ctx.fns.canvas.promptSection({})).toContain('You can poll the state with canvas.list or change it with canvas.setState');
});

 test('real tools.eval → repl.eval → process eval filters existing snapshots without rewriting them',async()=>{
 const {ctx,r,snapshot}=fixture();
 r.repl={eval:agentEval}; r.procs.repl={eval:processEval}; r.settings={get:()=>false};
 const standard=snapshot([],[]),creator=snapshot();
 const child=snapshot();child.layers.unshift(...standard.layers);
 const partial=snapshot(['input.request','external.view']);
 for(const preset of [standard,creator,child,partial]) {
  const before=JSON.stringify(preset);const agent={id:'fixture',preset,messages:[],events:[]};
  const code=`console.log(JSON.stringify({modules:Object.keys(ctx.fns), keys:Reflect.ownKeys(ctx.fns), canvas:(await ctx.fns.canvas.kinds({})).map(x=>x.name), input:ctx.fns.input.kinds({}).map(x=>x.name), prompt:ctx.fns.input.promptSection({allows:()=>true})}));`;
  // Use the actual native eval handler and both evaluation layers, not a proxy-only assertion.
  const result=JSON.parse(await toolEval(ctx,{agent} as any,{code}) as string);
  expect(result.modules.includes('external')).toBe(preset===creator||preset===partial);
  expect(result.keys).toEqual(result.modules);
  expect(result.canvas).toEqual(preset===creator?['external.panel','file']:['file']);
  expect(result.input).toEqual(preset===partial?[]:preset===creator?['choice','external-form']:['choice']);
  expect(result.prompt).not.toContain('external-unknown');
  if(preset===partial) expect(result.prompt).toBe('');
  expect(JSON.stringify(preset)).toBe(before);expect(agent.preset).toBe(preset);
  expect(agent.messages).toEqual([]);expect(agent.events).toEqual([]);
  // A subsequent eval on the same agent uses the unchanged persisted-policy shape.
  expect(await toolEval(ctx,{agent} as any,{code})).toBe(JSON.stringify(result));
 }
 expect(await ctx.fns.canvas.kinds({})).toHaveLength(3);
 });
