import {expect,test} from 'bun:test';
import {EventEmitter} from 'node:events';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {runInNewContext} from 'node:vm';
const localRequire=createRequire(resolve(__dirname,'main.cjs'));
const {partitionFor}=localRequire('./profile.cjs');

// Exercise the real main-process wiring, migration and settings IPC, not a second
// implementation of the switch. Chromium, OS windows and their cookie store are doubles.
test('upgraded shell keeps a legacy session through failed switch, denies non-local IPC and preserves draft on live retry',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'shell-session-')), old='https://prior.example', other='https://other.example';
  const disk=join(dir,'server.json');writeFileSync(disk,JSON.stringify({url:old+'/a/old'}));
  const ipc:any=Object.assign(new EventEmitter(),{handlers:new Map(),handle(key:string,fn:Function){this.handlers.set(key,fn);}});
  const sessions=new Map<string,any>(),windows:any[]=[], probes:any[]=[], errors:string[]=[];let menu:any[]=[];
  const app=Object.assign(new EventEmitter(),{requestSingleInstanceLock:()=>true,enableSandbox(){},isPackaged:false,whenReady:()=>Promise.resolve(),getPath:()=>dir,getVersion:()=>'0.2.0-pilot.1',quit(){this.emit('before-quit');}});
  const fromPartition=(key:string)=>{if(!sessions.has(key))sessions.set(key,Object.assign(new EventEmitter(),{key,cookies:new EventEmitter(),setPermissionCheckHandler(){},setPermissionRequestHandler(){},
    async fetch(url:string,opts:any){const auth=key===partitionFor(old)?'legacy-fixture':null;probes.push({url,auth,credentials:opts.credentials});
      return auth?Response.json({authenticated:true}):new Response('<html>Wi-Fi login</html>',{headers:{'content-type':'text/html'}});}}));return sessions.get(key);};
  class Win extends EventEmitter {
    webContents:any;visible=false;closed=false;draft='';loads=0;isDestroyed=()=>this.closed;isVisible=()=>this.visible;isMinimized=()=>false;show=()=>{this.visible=true;};focus(){}hide=()=>{this.visible=false;};
    constructor(public opts:any){super();windows.push(this);let frame={url:''};this.webContents=Object.assign(new EventEmitter(),{mainFrame:frame,getURL:()=>frame.url,isDestroyed:this.isDestroyed,session:fromPartition(opts.webPreferences.partition||'local'),setWindowOpenHandler(){},sent:[] as any[],send(...msg:any[]){this.sent.push(msg);},executeJavaScriptInIsolatedWorld:async()=>true,reload(){throw Error('Unexpected reload of the draft');}});}
    async loadFile(p:string){this.webContents.mainFrame.url=pathToFileURL(p).href;this.visible=true;}
    async loadURL(url:string){this.loads++;const wc=this.webContents;wc.emit('did-start-navigation',{isMainFrame:true,isSameDocument:false});wc.mainFrame.url=url;wc.emit('did-navigate',{},url,200);wc.emit('did-finish-load');}
    destroy(){this.closed=true;this.emit('closed');}
  }
  const electron={app,ipcMain:ipc,BrowserWindow:Win,session:{fromPartition},nativeImage:{createFromPath:()=>({isEmpty:()=>true})},powerMonitor:new EventEmitter(),Notification:{isSupported:()=>false},systemPreferences:{getMediaAccessStatus:()=> 'granted'},autoUpdater:new EventEmitter(),dialog:{showErrorBox:(_t:string,s:string)=>errors.push(s)},Menu:{buildFromTemplate:(m:any)=>m,setApplicationMenu:(m:any)=>menu=m}};
  const check=async(fn:()=>boolean)=>{for(let n=0;n<60&&!fn();n++) await new Promise(r=>setTimeout(r,3));expect(fn()).toBe(true);};
  const event=(w:Win)=>({sender:w.webContents,senderFrame:w.webContents.mainFrame});
  try{
    runInNewContext(readFileSync(join(__dirname,'main.cjs'),'utf8'),{__dirname,process,require:(id:string)=>id==='electron'?electron:localRequire(id),URL,console,setTimeout,clearTimeout,AbortSignal});
    await check(()=>windows.length>=2 && windows[0].closed);const oldWin=windows[1];oldWin.draft='unfinished';
    expect(oldWin.webContents.session.key).toBe(partitionFor(old));expect(oldWin.opts.webPreferences.sandbox).toBe(true);expect(oldWin.opts.webPreferences.nodeIntegration).toBe(false);
    const settingsMenu=menu.find(m=>m.label==='Сервер').submenu.find((m:any)=>m.label==='Настройки…');settingsMenu.click();
    const setup=windows.at(-1), local=event(setup), open=ipc.handlers.get('setup:connect'), act=ipc.handlers.get('setup:action');
    expect(()=>act(event(oldWin),'update-restart')).toThrow('Forbidden');expect(()=>act({...local,senderFrame:{url:local.senderFrame.url}},'mic-grant')).toThrow('Forbidden');
    expect(open(local,'http://untrusted.lan',{allowHttp:false}).ok).toBe(false);expect(windows).toHaveLength(3);
    expect(open(local,other,{}).ok).toBe(true);await check(()=>windows.at(-1).closed);
    expect(probes.filter(p=>p.url.startsWith(other))).toEqual([{url:other+'/auth/session',auth:null,credentials:'include'}]);
    expect(oldWin.closed).toBe(false);expect(oldWin.draft).toBe('unfinished');expect(JSON.parse(readFileSync(disk,'utf8'))).toEqual({url:old+'/a/old'});
    oldWin.webContents.emit('did-start-navigation',{isMainFrame:true,isSameDocument:false}); // Attachment response: no new document.
    oldWin.webContents.emit('did-fail-load',{},-3,'ERR_ABORTED',old+'/file',true);
    expect(ipc.handlers.get('setup:state')(local).connected).toBe(true);
    ipc.emit('desktop-live-status',event(oldWin),'disconnected');expect(ipc.handlers.get('setup:state')(local).liveStatus).toBe('offline');
    oldWin.webContents.sent=[];await act(local,'retry');expect(oldWin.webContents.sent).toEqual([['desktop-live-retry']]);expect(oldWin.loads).toBe(1);expect(oldWin.draft).toBe('unfinished');
    await act(local,'back');expect(oldWin.visible).toBe(true);expect(setup.closed).toBe(true);expect(errors).toEqual([]);app.quit();
  }finally{rmSync(dir,{recursive:true,force:true});}
});
