import {test,expect} from 'bun:test';
import stream from '../procs/events/$route__GET';

test('desktop handshake is private; neither public topic selection nor another session receives an occurrence',async()=>{
 const owners=new Map([['A','alice'],['B','bob']]);const ctx:any={state:{events:{desktopOccurrences:new Map([['occ',{issued:new Set()}]])}},fns:{events:{desktopAccess:async({req,id}:any)=>{const token=req.headers.get('cookie'),owner=owners.get(token);return owner && (!id || owner==='alice')?{owner,scope:token}:null}},procs:{events:{subscribe:()=>()=>{},join:()=>()=>{}}}}};
 async function attach(token:string,query:string){const req=new Request('http://example.test/procs/events?'+query,{headers:{cookie:token}});const r=await stream(ctx,{} as any,{req}); const reader=r.body!.getReader(); const read=async()=>JSON.parse(new TextDecoder().decode((await reader.read()).value).slice(6).trim());return {reader,read,hello:await read()};}
 const a=await attach('A','desktop=1'),b=await attach('B','desktop=1'),browser=await attach('A','topics=desktop:alice'),unbound=await attach('none','desktop=1');
 try{expect(a.hello.desktop).toEqual({version:1,scope:'A'});expect(b.hello.desktop.scope).toBe('B');expect(browser.hello.desktop).toBeUndefined();expect(unbound.hello.desktop).toBeUndefined();const listeners=ctx.state.events.desktopListeners;expect(listeners.get('alice').size).toBe(1);expect(listeners.get('bob').size).toBe(1);
 await [...listeners.get('alice')][0]('occ');expect(await a.read()).toEqual({type:'desktop.occurrence',id:'occ',scope:'A'});
 owners.delete('A');await [...listeners.get('alice')][0]('stale');await a.reader.cancel();expect(listeners.has('alice')).toBe(false);
 }finally{await Promise.all([a,b,browser,unbound].map(x=>x.reader.cancel()))}
});
