import {expect,test} from 'bun:test';
import {EventEmitter} from 'node:events';
const {createNotifications}=require('./notifications.cjs');
function fixture({origin='http://localhost:3010',kind='input-pending',fetchResponse}:{origin?:string;kind?:string;fetchResponse?:(url:string,init:RequestInit)=>Promise<Response>}={}){const scope='a'.repeat(64),id='b'.repeat(64);let auth:string|null=scope,allow=false,visible=false,minimized=false,restored=0;
 const ipc=new EventEmitter(),alerts:any[]=[],urls:string[]=[],frame={url:origin+'/'};
 class Notification extends EventEmitter{constructor(readonly options:object){super();} static isSupported(){return true} show(){alerts.push(this)} close(){this.emit('close')}}
 const wc={getURL:()=>frame.url,mainFrame:frame,send:()=>{},session:{fetch:async(url:string,init:RequestInit)=>{expect(url).toBe(origin+'/events/desktop?id='+id);if(fetchResponse)return fetchResponse(url,init);return auth?Response.json({version:1,scope:auth,kind,agentId:'chat'}):new Response(null,{status:401})}}};
 const a={origin,generation:1,window:{webContents:wc,isDestroyed:()=>false,isVisible:()=>visible,isMinimized:()=>minimized,loadURL:async(u:string)=>urls.push(u)}};
 const api=createNotifications({ipcMain:ipc,Notification,getActive:()=>a,preferences:{get:()=>allow,set:(_o:string,_k:string,v:boolean)=>allow=v},changed:()=>{},restore:()=>restored++});
 const event={sender:wc,senderFrame:frame}; ipc.emit('desktop-live-capability',event,scope);
 const hint=async(e:any=event)=>{await (ipc.listeners('desktop-live-hint')[0] as Function)(e,scope,id)};
 return {api,alerts,urls,scope,origin,event,hint,a,setUser:(v:string|null)=>auth=v,setVisible:(v:boolean)=>visible=v,setMinimized:(v:boolean)=>minimized=v,restored:()=>restored};}
test('loopback server validates both minimized notifications and their click destinations',async()=>{
 const scope='a'.repeat(64); let kind='input-pending', reads=0;
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){reads++;return req.headers.get('cookie')==='fixture=session' ? Response.json({version:1,scope,kind,agentId:'chat'}):new Response(null,{status:401});}});
 try{for(const event of ['input-pending','run-finished']){
   kind=event;
   const f=fixture({origin:server.url.origin,kind,fetchResponse:(url,init)=>{expect(init.credentials).toBe('include');expect(init.redirect).toBe('error');return fetch(url,{...init,headers:{cookie:'fixture=session'}});}});
   f.api.setEnabled(true);f.setVisible(true);f.setMinimized(true);await f.hint();
   expect(f.alerts[0].options.body).toBe(kind==='input-pending'?'Нужен ваш ответ':'Работа агента завершена');
   await f.alerts[0].listeners('click')[0]();expect(f.urls).toEqual([server.url.origin+'/a/chat']);
 }expect(reads).toBe(4);}finally{server.stop(true);}
});
for(const mode of ['valid','logout','other-user','switch','clear','opt-out']) test('click validates current occurrence: '+mode,async()=>{const f=fixture();f.api.setEnabled(true);await Promise.all([f.hint(),f.hint()]);await f.hint();expect(f.alerts.length).toBe(1);
 switch(mode){case 'logout':f.setUser(null);break;case 'other-user':f.setUser('f'.repeat(64));break;case 'switch':f.a.generation++;break;case 'clear':f.api.clear();break;case 'opt-out':f.api.setEnabled(false);}
 await f.alerts[0].listeners('click')[0]();expect(f.urls).toEqual(mode==='valid'?[f.origin+'/a/chat']:[]);expect(f.restored()).toBe(mode==='valid'?1:0);});
test('requires background, opt-in, matching main frame + authorized identity',async()=>{const f=fixture();await f.hint();f.api.setEnabled(true);f.setVisible(true);await f.hint();f.setVisible(false);await f.hint({...f.event,senderFrame:{url:f.origin}});f.setUser(null);await f.hint();expect(f.alerts).toHaveLength(0)});
