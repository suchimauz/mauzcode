import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { utilityExtension } from '../core-ui/utilities';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const context={readOnly:false} as any;
const json=(body:object,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const catalogue={defaultModel:'codex/me:gpt-5',models:[
 {provider:'claude',model:'claude/team:opus',label:'Opus',groupLabel:'team',connectionId:'c1',disabled:false},
 {provider:'claude',model:'claude/team:off',label:'Off model',groupLabel:'team',connectionId:'c1',disabled:true},
 {provider:'codex',model:'codex/me:gpt-5',label:'GPT-5',groupLabel:'me',connectionId:'c2',disabled:false},
]};
const View=utilityExtension.pages!.find(p=>p.id==='autotext')!.component;
test('opening the page reads only the connection catalogue and never requests a suggestion',async()=>{
 const fetcher=vi.fn(async(_url:string,_init?:RequestInit)=>json(catalogue));vi.stubGlobal('fetch',fetcher);
 render(<View context={context}/>);
 expect(screen.getByLabelText('Article draft')).toBeTruthy();
 const select=screen.getByLabelText('Model') as HTMLSelectElement;
 await waitFor(()=>expect(select.value).toBe('codex/me:gpt-5'));
 expect(fetcher.mock.calls.map(([url])=>String(url))).toEqual(['/ui-lab-api/new-session']);
 expect(within(select).queryByText('Off model')).toBeNull();
 expect([...select.querySelectorAll('optgroup')].map(g=>g.label)).toEqual(['team','me']);
 expect(within(select).queryByText(/codex:gpt-6-luna|groq:|openrouter:/)).toBeNull();
});
test('suggestion sends the selected enabled connection route',async()=>{
 const meta=document.createElement('meta');meta.name='csrf-token';meta.content='csrf';document.head.append(meta);
 const fetcher=vi.fn(async(url:string,init?:RequestInit)=>String(url).startsWith('/autotext/')?json({text:' more'}):json(catalogue));vi.stubGlobal('fetch',fetcher);
 render(<View context={context}/>);
 const select=screen.getByLabelText('Model') as HTMLSelectElement;
 await waitFor(()=>expect(select.value).toBe('codex/me:gpt-5'));
 fireEvent.change(select,{target:{value:'claude/team:opus'}});
 fireEvent.change(screen.getByLabelText('Article draft'),{target:{value:'Hello world'}});
 fireEvent.click(screen.getByRole('button',{name:'Suggest'}));
 await screen.findByText('Insert at cursor:');
 const post=fetcher.mock.calls.find(([url])=>String(url)==='/autotext/suggest')!;
 expect(JSON.parse(String((post[1] as RequestInit).body))).toMatchObject({model:'claude/team:opus',before:'Hello world'});
 meta.remove();
});
test('no enabled connection disables suggestions and points to Models settings',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>json({defaultModel:'',models:[catalogue.models[1]]})));
 render(<View context={context}/>);
 expect(await screen.findByRole('alert')).toHaveTextContent('Settings → Models');
 fireEvent.change(screen.getByLabelText('Article draft'),{target:{value:'Hello'}});
 expect(screen.getByRole('button',{name:'Suggest'})).toBeDisabled();
});
