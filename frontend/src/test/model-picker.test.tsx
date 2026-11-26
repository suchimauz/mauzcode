import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModelPicker } from '../components/mauzcode/ModelPicker';
import type { ModelSettings } from '../lib/models';
const icon = { src: 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E', custom: false };
const original: ModelSettings = { agentId:'fixture', model:'openai:gpt-5', label:'gpt-5', icon, models:[{provider:'openai',model:'openai:gpt-4',label:'gpt-4',icon,disabled:false},{provider:'openai',model:'openai:gpt-3',label:'gpt-3',icon,disabled:false},{provider:'openai',model:'openai:gpt-4o',label:'gpt-4o',icon,disabled:false},{provider:'openai',model:'openai:gpt-5',label:'gpt-5',icon,disabled:false},{provider:'remote',model:'ssh/host:anthropic:claude',label:'claude',icon,disabled:false},{provider:'remote',model:'disabled',label:'Disabled model',icon:null,disabled:true}],effort:{requested:'high',applied:'high',supported:['low','medium','high'],mode:'openai-effort'} };
const json = (body: object, status=200) => new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const props = {agentId:'fixture',running:false,busy:false,revision:0,onSaved:vi.fn(),onBusyChange:vi.fn()};
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
it('opens dsh-style two-step grouped search, uses full model route, closes only after native save',async()=>{
 let state=structuredClone(original);
 const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
  if(init?.method==='POST'){const {model}=JSON.parse(init.body as string);state={...state,model,label:'claude'};return json({ok:true,model});}
  return json(state);
 });vi.stubGlobal('fetch',fetcher);
 render(<ModelPicker {...props}/>);
 const trigger=await screen.findByRole('button',{name:'Выбрать модель: gpt-5, openai'});
 expect(trigger.querySelector('.navigation-provider-icon')).not.toBeNull();
 await userEvent.click(trigger);await userEvent.click(await screen.findByRole('menuitem',{name:/Model gpt-5/}));
 expect(screen.queryByRole('menuitemradio',{name:'Disabled model'})).toBeNull();
 await userEvent.type(screen.getByRole('textbox',{name:'Search models'}),'claude');
 expect(screen.queryByRole('menuitemradio',{name:'gpt-5'})).toBeNull();
 await userEvent.click(screen.getByRole('menuitemradio',{name:'claude'}));
 await waitFor(()=>expect(props.onSaved).toHaveBeenCalledOnce());
 const post=fetcher.mock.calls.find(([,init])=>init?.method==='POST');
 expect(post?.[0]).toBe('/api/v1/agents/fixture/model');expect(JSON.parse(post![1]!.body as string)).toEqual({model:'ssh/host:anthropic:claude'});
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 expect(screen.getByRole('button',{name:'Выбрать модель: claude, host · anthropic'})).toHaveFocus();
});
it('keeps menu on native failure; keyboard Escape returns root then restores trigger',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>init?.method==='POST'?json({message:'Agent is running'},400):json(original)));
 render(<ModelPicker {...props}/>);const trigger=await screen.findByRole('button',{name:'Выбрать модель: gpt-5, openai'});
 await userEvent.click(trigger);await userEvent.click(await screen.findByRole('menuitem',{name:/Model gpt-5/}));
 await userEvent.click(screen.getByRole('menuitemradio',{name:'claude'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Agent is running');expect(props.onSaved).not.toHaveBeenCalled();
 await userEvent.keyboard('{Escape}');expect(screen.getByRole('menuitem',{name:/Model gpt-5/})).toBeVisible();
 await userEvent.keyboard('{Escape}');await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(trigger).toHaveFocus();
});
it('uses native effort values and hides unsupported controls',async()=>{
 let state=structuredClone(original);
 const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
  if(url.endsWith('/effort')){expect((init?.body as FormData).get('effort')).toBe('low');state.effort.requested='low';state.effort.applied='low';return new Response(null,{status:204});}return json(state);
 });vi.stubGlobal('fetch',fetcher);
 const view=render(<ModelPicker {...props}/>);await userEvent.click(await screen.findByRole('button',{name:'Выбрать модель: gpt-5, openai'}));
 await userEvent.click(await screen.findByRole('menuitem',{name:'Effort High'}));await userEvent.click(screen.getByRole('menuitemradio',{name:'Low'}));
 await waitFor(()=>expect(props.onSaved).toHaveBeenCalledOnce());
 view.unmount();state={...state,effort:{requested:'auto',applied:'off',supported:[],mode:'none'}};
 render(<ModelPicker {...props}/>);await userEvent.click(await screen.findByRole('button',{name:'Выбрать модель: gpt-5, openai'}));
 expect(screen.queryByRole('menuitem',{name:/Effort/})).toBeNull();
});
it('allows inspection while running but prevents mutations',async()=>{
 const fetcher=vi.fn(async()=>json(original));vi.stubGlobal('fetch',fetcher);
 render(<ModelPicker {...props} running/>);await userEvent.click(await screen.findByRole('button',{name:'Выбрать модель: gpt-5, openai'}));
 await userEvent.click(await screen.findByRole('menuitem',{name:/Model gpt-5/}));expect(screen.getByRole('menuitemradio',{name:'claude'})).toBeDisabled();
 expect(screen.getByText('Смена доступна после завершения ответа.')).toBeVisible();expect(props.onSaved).not.toHaveBeenCalled();
});

it('keeps draft model and effort local without agent writes; a model switch resets effort to Default', async () => {
 const fetcher = vi.fn(async () => json({ ...original, defaultModel: original.model })); vi.stubGlobal('fetch', fetcher);
 const onChange = vi.fn();
 const view = render(<ModelPicker draft={{ model: original.model, effort: 'high', onChange }} />);
 await userEvent.click(await screen.findByRole('button', { name: 'Выбрать модель: gpt-5, openai' }));
 await userEvent.click(await screen.findByRole('menuitem', { name: /Model gpt-5/ }));
 // Reselecting the same route keeps the explicit effort and emits nothing.
 await userEvent.click(screen.getByRole('menuitemradio', { name: 'gpt-5' }));
 expect(onChange).not.toHaveBeenCalledWith(original.model, 'auto');
 await userEvent.click(await screen.findByRole('button', { name: 'Выбрать модель: gpt-5, openai' }));
 await userEvent.click(await screen.findByRole('menuitem', { name: /Model gpt-5/ }));
 await userEvent.click(screen.getByRole('menuitemradio', { name: 'claude' }));
 expect(onChange).toHaveBeenLastCalledWith('ssh/host:anthropic:claude', 'auto');
 view.rerender(<ModelPicker draft={{ model: 'ssh/host:anthropic:claude', effort: 'auto', onChange }} />);
 await userEvent.click(await screen.findByRole('button', { name: 'Выбрать модель: claude, host · anthropic' }));
 // The draft shows Default; a manual level after the switch replaces it.
 await userEvent.click(await screen.findByRole('menuitem', { name: 'Effort Default' }));
 await userEvent.click(screen.getByRole('menuitemradio', { name: 'Low' }));
 expect(onChange).toHaveBeenLastCalledWith('ssh/host:anthropic:claude', 'low');
 expect(fetcher.mock.calls.every(call => !((call as unknown as [string, RequestInit?])[1]?.method))).toBe(true);
 expect(fetcher.mock.calls.every(call => !(call as unknown as [string])[0].includes('agentId='))).toBe(true);
 expect(props.onSaved).not.toHaveBeenCalled();
});


it('reports draft config errors and retries using a read-only model projection', async () => {
 let failing = true;
 const fetcher = vi.fn(async () => failing ? json({ message: 'Config unavailable' }, 503) : json({ ...original, defaultModel: original.model }));
 vi.stubGlobal('fetch', fetcher);
 render(<ModelPicker draft={{ model: original.model, effort: 'low', onChange: vi.fn() }} />);
 await userEvent.click(screen.getByRole('button', { name: 'Выбрать модель: Model' }));
 expect(await screen.findByRole('alert')).toHaveTextContent('Config unavailable');
 failing = false;
 await userEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
 expect(await screen.findByRole('menuitem', { name: /Model gpt-5/ })).toBeEnabled();
 expect(screen.queryByRole('alert')).toBeNull();
 const url = new URL((fetcher.mock.calls[0] as unknown as [string])[0], 'http://localhost');
 expect(url.pathname).toBe('/ui-lab-api/new-session');
 expect(url.searchParams.get('model')).toBeNull(); // catalogue first, so removed remembered models recover
 expect(url.searchParams.get('effort')).toBeNull();
});

it('groups models by provider and connection account, shows enabled unavailable connections and saves the model route',async()=>{
 let state=structuredClone(original);
 const model='claude/work:claude-opus-5';
 state.models.push({provider:'claude',model,label:'Opus 5',groupLabel:'work',connectionId:'c3',disabled:false,icon:null});
 state.groups=[{connectionId:'c3',provider:'claude',accountName:'work',enabled:true,unavailable:false},{connectionId:'c2',provider:'codex',accountName:'broken',enabled:true,unavailable:true}];
 const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>{
  if(init?.method==='POST'){state={...state,model:JSON.parse(init.body as string).model,label:'Opus 5'};return json({ok:true,model});}
  return json(state);
 });
 vi.stubGlobal('fetch',fetcher);
 render(<ModelPicker {...props}/>);
 await userEvent.click(await screen.findByRole('button',{name:'Выбрать модель: gpt-5, openai'}));
 await userEvent.click(await screen.findByRole('menuitem',{name:/Model gpt-5/}));
 expect(screen.getByRole('group',{name:'claude · work'})).toBeVisible();
 expect(screen.getByRole('group',{name:'codex · broken'})).toHaveTextContent('Недоступно');
 await userEvent.type(screen.getByRole('textbox',{name:'Search models'}),'work');
 expect(screen.queryByRole('menuitemradio',{name:'gpt-5'})).toBeNull();
 await userEvent.click(screen.getByRole('menuitemradio',{name:'Opus 5'}));
 await waitFor(()=>expect(props.onSaved).toHaveBeenCalledOnce());
 const post=fetcher.mock.calls.find(([,init])=>init?.method==='POST');
 expect(JSON.parse(post![1]!.body as string)).toEqual({model});
});
it('keeps same-named accounts of different providers in separate groups and shows the unavailable one with its error',async()=>{
 const state=structuredClone(original);
 state.models.push({provider:'claude',model:'claude/team:opus',label:'opus',groupLabel:'team',connectionId:'c1',disabled:false,icon:null});
 state.groups=[{connectionId:'c1',provider:'claude',accountName:'team',enabled:true,unavailable:false},{connectionId:'c2',provider:'codex',accountName:'team',enabled:true,unavailable:true,error:'HTTP 401'}];
 vi.stubGlobal('fetch',vi.fn(async()=>json(state)));
 render(<ModelPicker {...props}/>);
 await userEvent.click(await screen.findByRole('button',{name:'Выбрать модель: gpt-5, openai'}));
 await userEvent.click(await screen.findByRole('menuitem',{name:/Model gpt-5/}));
 expect(screen.queryAllByRole('group',{name:'team'})).toHaveLength(0);
 const teams=screen.getByRole('group',{name:'claude · team'});
 expect(teams).toContainElement(screen.getByRole('menuitemradio',{name:'opus'}));
 const broken=screen.getByRole('group',{name:'codex · team'});
 expect(broken).toHaveTextContent('Недоступно');
 expect(broken).toHaveTextContent('HTTP 401');
});
it('hides disabled models and disabled connections from the list, the headings and search',async()=>{
 const state=structuredClone(original);
 state.models.push({provider:'claude',model:'claude/off:opus',label:'Off connection model',groupLabel:'off',connectionId:'c2',disabled:false,icon:null});
 state.models.push({provider:'claude',model:'claude/on:hidden',label:'Hidden model',groupLabel:'on',connectionId:'c1',disabled:true,icon:null});
 // Only the connection's enabled flag disqualifies its models; the group must not appear as a notice either.
 state.groups=[{connectionId:'c1',provider:'claude',accountName:'on',enabled:true,unavailable:false},{connectionId:'c2',provider:'claude',accountName:'off',enabled:false,unavailable:true,error:'HTTP 500'}];
 vi.stubGlobal('fetch',vi.fn(async()=>json(state)));
 render(<ModelPicker {...props}/>);
 await userEvent.click(await screen.findByRole('button',{name:'Выбрать модель: gpt-5, openai'}));
 await userEvent.click(await screen.findByRole('menuitem',{name:/Model gpt-5/}));
 expect(screen.queryByRole('menuitemradio',{name:'Hidden model'})).toBeNull();
 expect(screen.queryByRole('menuitemradio',{name:'Off connection model'})).toBeNull();
 expect(screen.queryByRole('group',{name:'claude · off'})).toBeNull();
 expect(screen.queryByText(/HTTP 500/)).toBeNull();
 await userEvent.type(screen.getByRole('textbox',{name:'Search models'}),'hidden');
 expect(screen.queryByRole('menuitemradio',{name:'Hidden model'})).toBeNull();
});
it('keeps local and remote connections with the same provider and account in separate groups',async()=>{
 const state=structuredClone(original);
 state.models.push({provider:'codex',model:'ssh/host:codex/me:gpt-6',label:'gpt-6',connectionId:'r1',disabled:false,icon:null});
 state.models.push({provider:'codex',model:'codex/me:gpt-6',label:'gpt-6',connectionId:'l1',disabled:false,icon:null});
 vi.stubGlobal('fetch',vi.fn(async()=>json(state)));
 render(<ModelPicker {...props}/>);
 await userEvent.click(await screen.findByRole('button',{name:'Выбрать модель: gpt-5, openai'}));
 await userEvent.click(await screen.findByRole('menuitem',{name:/Model gpt-5/}));
 expect(within(screen.getByRole('group',{name:'host · codex · me'})).getByRole('menuitemradio',{name:'gpt-6'})).toBeVisible();
 expect(within(screen.getByRole('group',{name:'codex · me'})).getByRole('menuitemradio',{name:'gpt-6'})).toBeVisible();
});
it('offers a re-enabled model again after the catalogue is reloaded',async()=>{
 const state=structuredClone(original);
 const model='codex/me:gpt-6';
 state.models.push({provider:'codex',model,label:'gpt-6',connectionId:'c1',disabled:true,icon:null});
 let enabled=false;
 vi.stubGlobal('fetch',vi.fn(async()=>json(enabled?{...state,models:state.models.map(o=>o.model===model?{...o,disabled:false}:o)}:state)));
 render(<ModelPicker {...props}/>);
 const trigger=await screen.findByRole('button',{name:'Выбрать модель: gpt-5, openai'});
 await userEvent.click(trigger);
 await userEvent.click(await screen.findByRole('menuitem',{name:/Model gpt-5/}));
 expect(screen.queryByRole('menuitemradio',{name:'gpt-6'})).toBeNull();
 // Reopening reloads the catalogue, so an owner re-enable appears without a page reload.
 await userEvent.keyboard('{Escape}');
 await userEvent.keyboard('{Escape}');
 enabled=true;
 await userEvent.click(trigger);
 await userEvent.click(await screen.findByRole('menuitem',{name:/Model gpt-5/}));
 expect(await screen.findByRole('menuitemradio',{name:'gpt-6'})).toBeEnabled();
});
it('keeps keyboard navigation over the filtered choices of every provider group',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>json(original)));
 render(<ModelPicker {...props}/>);
 await userEvent.click(await screen.findByRole('button',{name:'Выбрать модель: gpt-5, openai'}));
 await userEvent.click(await screen.findByRole('menuitem',{name:/Model gpt-5/}));
 // Typing keeps focus in the filter; arrows then walk the selectable rows of the filtered groups.
 await userEvent.type(screen.getByRole('textbox',{name:'Search models'}),'openai');
 await userEvent.keyboard('{ArrowDown}');
 expect(screen.getByRole('menuitemradio',{name:'gpt-4'})).toHaveFocus();
 await userEvent.keyboard('{ArrowDown}');
 expect(screen.getByRole('menuitemradio',{name:'gpt-3'})).toHaveFocus();
 // Home and End jump within the visible rows; typed text in the filter is never rewritten.
 await userEvent.keyboard('{End}');
 expect(screen.getByRole('menuitemradio',{name:'gpt-5'})).toHaveFocus();
 await userEvent.keyboard('{Home}');
 expect(screen.getByRole('menuitemradio',{name:'gpt-4'})).toHaveFocus();
 expect(screen.getByRole('textbox',{name:'Search models'})).toHaveValue('openai');
});
it('shows an empty state when nothing is selectable and no enabled connection is unavailable',async()=>{
 const state:ModelSettings={...structuredClone(original),models:[{provider:'openai',model:'openai:gpt-4',label:'gpt-4',icon,disabled:true}],groups:[]};
 vi.stubGlobal('fetch',vi.fn(async()=>json(state)));
 render(<ModelPicker {...props}/>);
 await userEvent.click(await screen.findByRole('button',{name:'Выбрать модель: gpt-5, openai'}));
 await userEvent.click(await screen.findByRole('menuitem',{name:/Model gpt-5/}));
 expect(screen.getByText('Модели не найдены')).toBeVisible();
});
it('shows the route provider beside the selected name, even when that route is disabled',async()=>{
 const state:ModelSettings={...structuredClone(original),model:'custom/gateway:anthropic/claude-opus-5',label:'Claude Opus 5'};
 state.models.push({provider:'custom',model:'custom/gateway:anthropic/claude-opus-5',label:'Claude Opus 5',disabled:true,icon:null});
 vi.stubGlobal('fetch',vi.fn(async()=>json(state)));
 render(<ModelPicker {...props}/>);
 const trigger=await screen.findByRole('button',{name:'Выбрать модель: Claude Opus 5, custom · gateway'});
 expect(trigger.textContent).toContain('Claude Opus 5');
 expect(trigger.querySelector('.model-picker-tech')?.textContent).toBe('custom · gateway');
 await userEvent.click(trigger);
 await userEvent.click(await screen.findByRole('menuitem',{name:/Model/}));
 expect(screen.queryByRole('menuitemradio',{name:'Claude Opus 5'})).toBeNull();
 expect(props.onSaved).not.toHaveBeenCalled();
});
it('updates the provider caption when two providers offer the same model name',async()=>{
 let state:ModelSettings=structuredClone(original);
 // The same human-readable name arrives from two providers: only the provider distinguishes them.
 state.models.push({provider:'claude',model:'claude/work:gpt-5',label:'gpt-5',connectionId:'c9',disabled:false,icon:null});
 const fetcher=vi.fn(async(_url:string,init?:RequestInit)=>{
  if(init?.method==='POST'){const {model}=JSON.parse(init.body as string);state={...state,model};return json({ok:true,model});}
  return json(state);
 });
 vi.stubGlobal('fetch',fetcher);
 render(<ModelPicker {...props}/>);
 await userEvent.click(await screen.findByRole('button',{name:'Выбрать модель: gpt-5, openai'}));
 await userEvent.click(await screen.findByRole('menuitem',{name:/Model gpt-5/}));
 // Both entries carry the same label; only their group tells them apart.
 const claudeGroup=screen.getByRole('group',{name:'claude · work'});
 await userEvent.click(within(claudeGroup).getByRole('menuitemradio',{name:'gpt-5'}));
 await waitFor(()=>expect(props.onSaved).toHaveBeenCalledOnce());
 const caption=await screen.findByRole('button',{name:'Выбрать модель: gpt-5, claude · work'});
 expect(caption.querySelector('.model-picker-tech')?.textContent).toBe('claude · work');
});
it('keeps the fallback name and provider when the route is missing from the catalogue',async()=>{
 const state:ModelSettings={...structuredClone(original),model:'codex/me:retired-model',label:''};
 vi.stubGlobal('fetch',vi.fn(async()=>json(state)));
 render(<ModelPicker {...props}/>);
 const trigger=await screen.findByRole('button',{name:'Выбрать модель: codex/me:retired-model, codex · me'});
 expect(trigger.querySelector('.model-picker-tech')?.textContent).toBe('codex · me');
});

it('shows an explicitly unset model as unselected without substituting a default',async()=>{
 const unset:ModelSettings={...structuredClone(original),model:'',label:'',icon:null};
 vi.stubGlobal('fetch',vi.fn(async()=>json(unset)));
 render(<ModelPicker {...props}/>);
 const trigger=await screen.findByRole('button',{name:'Выбрать модель: Model'});
 expect(trigger).toHaveAttribute('title','Выбрать модель');
 expect(trigger.textContent).not.toContain('gpt');
});
it('a live model switch is one mutation and reads back the committed Default effort', async () => {
 let state = structuredClone(original); state.effort = { ...state.effort, requested: 'high', applied: 'high' };
 const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
  if (init?.method === 'POST' && url.endsWith('/model')) { const { model } = JSON.parse(init.body as string); state = { ...state, model, label: 'claude', effort: { ...state.effort, requested: 'auto', applied: 'medium' } }; return json({ ok: true, model }); }
  if (init?.method === 'POST') throw new Error('unexpected second mutation ' + url);
  return json(state);
 }); vi.stubGlobal('fetch', fetcher);
 render(<ModelPicker {...props} />);
 await userEvent.click(await screen.findByRole('button', { name: 'Выбрать модель: gpt-5, openai' }));
 await userEvent.click(await screen.findByRole('menuitem', { name: /Model gpt-5/ }));
 await userEvent.click(screen.getByRole('menuitemradio', { name: 'claude' }));
 await waitFor(() => expect(props.onSaved).toHaveBeenCalledOnce());
 expect(fetcher.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toHaveLength(1);
 await userEvent.click(screen.getByRole('button', { name: 'Выбрать модель: claude, host · anthropic' }));
 expect(await screen.findByRole('menuitem', { name: 'Effort Default' })).toBeVisible();
});
it('reselecting the live route or a failed switch keeps the explicit effort; manual effort uses its own endpoint', async () => {
 let state = structuredClone(original); state.effort = { ...state.effort, requested: 'high', applied: 'high' };
 const posts: string[] = [];
 const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
  if (init?.method === 'POST') { posts.push(url); if (url.endsWith('/model')) return json({ message: 'Agent is running' }, 400); state.effort = { ...state.effort, requested: 'low', applied: 'low' }; return new Response(null, { status: 204 }); }
  return json(state);
 }); vi.stubGlobal('fetch', fetcher);
 render(<ModelPicker {...props} />);
 await userEvent.click(await screen.findByRole('button', { name: 'Выбрать модель: gpt-5, openai' }));
 await userEvent.click(await screen.findByRole('menuitem', { name: /Model gpt-5/ }));
 await userEvent.click(screen.getByRole('menuitemradio', { name: 'gpt-5' }));
 expect(posts).toEqual([]);
 await userEvent.click(await screen.findByRole('button', { name: 'Выбрать модель: gpt-5, openai' }));
 await userEvent.click(await screen.findByRole('menuitem', { name: /Model gpt-5/ }));
 await userEvent.click(screen.getByRole('menuitemradio', { name: 'claude' }));
 expect(await screen.findByRole('alert')).toHaveTextContent('Agent is running');
 expect(posts).toEqual(['/api/v1/agents/fixture/model']);
 await userEvent.keyboard('{Escape}');
 expect(screen.getByRole('menuitem', { name: 'Effort High' })).toBeVisible();
 await userEvent.click(screen.getByRole('menuitem', { name: 'Effort High' }));
 await userEvent.click(screen.getByRole('menuitemradio', { name: 'Low' }));
 await waitFor(() => expect(props.onSaved).toHaveBeenCalledOnce());
 expect(posts).toEqual(['/api/v1/agents/fixture/model', '/agent/fixture/effort']);
});
it('a draft account-only switch keeps the effort; a different slug resets to Default', async () => {
 const accounts: ModelSettings = { ...original, model: 'openai/work:gpt-5', label: 'gpt-5', models: [
  { provider: 'openai', model: 'openai/work:gpt-5', label: 'gpt-5', groupLabel: 'work', icon, disabled: false },
  { provider: 'openai', model: 'openai/home:gpt-5', label: 'gpt-5 home', groupLabel: 'home', icon, disabled: false },
  { provider: 'openai', model: 'openai/work:gpt-4', label: 'gpt-4', groupLabel: 'work', icon, disabled: false }] };
 const fetcher = vi.fn(async () => json({ ...accounts, defaultModel: accounts.model })); vi.stubGlobal('fetch', fetcher);
 const onChange = vi.fn();
 const view = render(<ModelPicker draft={{ model: 'openai/work:gpt-5', effort: 'high', onChange }} />);
 await userEvent.click(await screen.findByRole('button', { name: /Выбрать модель: gpt-5/ }));
 await userEvent.click(await screen.findByRole('menuitem', { name: /Model gpt-5/ }));
 await userEvent.click(screen.getByRole('menuitemradio', { name: 'gpt-5 home' }));
 // Same slug on another account keeps the level; the target catalogue normalizes it on fetch.
 expect(onChange).toHaveBeenLastCalledWith('openai/home:gpt-5', 'high');
 view.rerender(<ModelPicker draft={{ model: 'openai/home:gpt-5', effort: 'high', onChange }} />);
 await userEvent.click(await screen.findByRole('button', { name: /Выбрать модель: gpt-5 home/ }));
 await userEvent.click(await screen.findByRole('menuitem', { name: /Model gpt-5 home/ }));
 await userEvent.click(screen.getByRole('menuitemradio', { name: 'gpt-4' }));
 expect(onChange).toHaveBeenLastCalledWith('openai/work:gpt-4', 'auto');
 expect(fetcher.mock.calls.every(call => !((call as unknown as [string, RequestInit?])[1]?.method))).toBe(true);
});
