import { afterEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModelPicker } from '../components/mauzcode/ModelPicker';

const route = 'codex/team:gpt-test';
const settings = (model: string) => ({agentId:'chat', model, label:'Test', icon:null, models:[{model,provider:model.split('/')[0],label:'Test',icon:null,disabled:false}], effort:{requested:'max',applied:'max',supported:['auto','xhigh','max'],mode:'catalogue'}});
const view = { route, csrfToken: 'cookie-bound', revision:'opaque', speed:'standard', speeds:['standard','fast'], verbosity:null, verbosities:['low','high'], noticePending:false };
const json = (body: object,status=200) => Response.json(body,{status});
const open = async () => userEvent.click(await screen.findByRole('button',{name:/Выбрать модель: Test/}));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('separates max reasoning from accelerated speed and submits only an explicit keyboard choice', async () => {
  const writes: object[] = [];
  vi.stubGlobal('fetch', async (url:string, init?:RequestInit) => {
    if(url === '/ui-lab-api/models?agentId=chat') return json(settings(route));
    if(url !== '/agent/chat/codex-controls') throw Error('unexpected URL');
    if(init?.method === 'POST') writes.push(JSON.parse(String(init.body)));
    return json(view);
  });
  render(<ModelPicker agentId="chat" />); await open();
  await userEvent.click(await screen.findByRole('menuitem',{name:'Effort Max'}));
  expect(screen.getByRole('menuitemradio',{name:'Max',checked:true})).toBeVisible();
  expect(screen.getByRole('menuitemradio',{name:'Extra high'})).toBeVisible();
  await userEvent.keyboard('{Escape}');
  const speed = await screen.findByRole('menuitem',{name:'Speed Standard'}); speed.focus();
  await userEvent.keyboard('{Enter}');
  expect(screen.queryByRole('menuitemradio',{name:'Ultrafast'})).toBeNull();
  const fast = await screen.findByRole('menuitemradio',{name:'Fast'});
  expect(fast).toHaveAccessibleDescription(/additional quota/); expect(writes).toEqual([]);
  await waitFor(() => expect(screen.getByRole('menuitemradio',{name:'Standard'})).toHaveFocus());
  await userEvent.keyboard('{End}'); expect(fast).toHaveFocus(); await userEvent.keyboard('{Enter}');
  await waitFor(()=>expect(writes).toEqual([{action:'save',route,revision:'opaque',speed:'fast',verbosity:null,csrfToken:'cookie-bound'}]));
});
it('rejects a stale verbosity save without retrying or showing it as accepted', async () => {
  let writes=0; const saved=vi.fn();
  vi.stubGlobal('fetch',async(url:string, init?:RequestInit)=>{
    if(!url.includes('codex-controls')) return json(settings(route));
    if(init?.method==='POST'){writes++;expect(JSON.parse(String(init.body))).toMatchObject({verbosity:'high',speed:'standard',revision:'opaque'});return json({error:'Account changed'},409);}
    return json({...view,speeds:[]});
  });
  render(<ModelPicker agentId="chat" onSaved={saved}/>);await open();
  const verbosity=await screen.findByRole('menuitem',{name:'Response verbosity Default'});
  expect(screen.queryByRole('menuitem',{name:/Speed/})).toBeNull();await userEvent.click(verbosity);
  await userEvent.click(screen.getByRole('menuitemradio',{name:'High'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Account changed');expect(writes).toBe(1);expect(saved).not.toHaveBeenCalled();
});
it.each(['draft','other','cold'])('hides paid choices in %s; only local bridge reads, explicit refresh separate',async(kind)=>{
  const model=kind==='other'?'custom/team:test':route;const reads:string[]=[];
  vi.stubGlobal('fetch',async(url:string,init?:RequestInit)=>{
    expect(init?.method??'GET').toBe('GET');reads.push(url);
    if(url.includes('codex-controls')) return json({...view, route:model});
    return json({...settings(model), ...(kind==='cold'?{models:[]}: {})});
  });
  render(<ModelPicker agentId={kind==='draft'?'':'chat'} draft={kind==='draft'?{model,effort:'max',onChange:vi.fn()}:undefined}/>);await open();
  expect(await screen.findByRole('menuitem',{name:'Effort Max'})).toBeVisible();
  expect(screen.queryByRole('menuitem',{name:/Speed|verbosity/})).toBeNull();
  if(kind==='cold') expect(await screen.findByRole('link',{name:/update the catalogue/})).toHaveAttribute('href','/?settings=models');
  expect(reads.every(url=>kind==='draft'?url.startsWith('/ui-lab-api/new-session'):['/ui-lab-api/models?agentId=chat','/agent/chat/codex-controls'].includes(url))).toBe(true);
});
it('interrupted notice stays pending; reconnect acknowledges only after rendering and not again after remount', async()=>{
  let pending=true;const acks:string[]=[];const frames=new Map<number,FrameRequestCallback>();let seq=0;
  vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.set(++seq,cb);return seq;});vi.stubGlobal('cancelAnimationFrame',(n:number)=>frames.delete(n));
  vi.stubGlobal('fetch',async(url:string, init?:RequestInit)=>{
    if(!url.includes('codex-controls'))return json(settings(route));
    if(!init?.body)return json({...view,noticePending:pending});
    const b=JSON.parse(String(init.body));if(b.action==='claim')return json({notice:pending?{id:'reset-1',message:'Speed reset to Standard'}:null});
    if(b.action==='ack'){expect(screen.getByRole('status')).toHaveTextContent('Speed reset to Standard');acks.push(b.noticeId);pending=false;}
    return json({ok:true});
  });
  const first=render(<ModelPicker agentId="chat"/>);await screen.findByText('Speed reset to Standard');first.unmount();expect(acks).toEqual([]);
  const second=render(<ModelPicker agentId="chat"/>);await screen.findByText('Speed reset to Standard');
  const paint=async()=>act(async()=>{const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn(0));});
  await waitFor(()=>expect(frames.size).toBeGreaterThan(0)); await paint();expect(acks).toEqual([]);await paint();await waitFor(()=>expect(acks).toEqual(['reset-1']));
  expect(screen.getByText('Speed reset to Standard')).toBeVisible();second.unmount();render(<ModelPicker agentId="chat"/>);await screen.findByRole('button',{name:/Выбрать модель: Test/});expect(screen.queryByText('Speed reset to Standard')).toBeNull();
});
