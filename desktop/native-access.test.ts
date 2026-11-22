import { describe, test, expect, mock } from 'bun:test';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
const { createNativeAccess } = require('./native-access.cjs');
function fixture(origin = 'https://server.test') {
  const wc = Object.assign(new EventEmitter(), { mainFrame: { url: origin + '/chat' }, getURL: () => origin + '/chat', isDestroyed: () => false, reloadIgnoringCache: mock(() => {}) });
  const window = { isDestroyed: () => false, webContents: wc };
  const a = { origin, generation: 1, window }; const prefs = new Map();
  const dialog = { showMessageBox: mock(async () => ({ response: 1 })), showSaveDialogSync: mock((): string | undefined => undefined), showMessageBoxSync: mock(() => 0) };
  const systemPreferences = { getMediaAccessStatus: mock(() => 'granted'), askForMediaAccess: mock(async () => true) };
  const native = createNativeAccess({ platform: 'darwin', dialog, systemPreferences, preferences: { get: (o: string,k: string) => prefs.get(o+k), set: (o: string,k: string,v: boolean) => prefs.set(o+k,v) }, getActive: () => a });
  let check: Function = () => true, request: Function = () => {};
  const profile = Object.assign(new EventEmitter(), {setPermissionCheckHandler: (fn: Function) => check = fn, setPermissionRequestHandler: (fn: Function) => request = fn}); Object.assign(wc,{session:profile}); native.attach(profile); native.attach(profile);
  const event = { sender: wc, senderFrame: wc.mainFrame };
  const d = { requestingUrl: wc.getURL(), isMainFrame: true, securityOrigin: origin, mediaTypes: ['audio'], mediaType: 'audio' };
  return {wc, a, profile, event, native, dialog, systemPreferences, d, check, ask: (details: object = d, perm = 'media', who: unknown = wc) => new Promise(resolve => request(who,perm,resolve,details))};
}
describe('audio permission', () => {
  test('audio only, OS and app consent, revoke reloads the capturing page and ignores its unload veto', async () => {
    const f = fixture(); expect(f.check(f.wc,'media',f.a.origin,f.d)).toBe(false);
    expect(await f.ask()).toBe(true); expect(f.dialog.showMessageBox).toHaveBeenCalledTimes(1);
    expect(f.check(f.wc,'media', f.a.origin, f.d)).toBe(true);
    expect(await f.ask()).toBe(true); expect(f.dialog.showMessageBox).toHaveBeenCalledTimes(1);
    for (const d of [{...f.d,mediaTypes:['audio','video']},{...f.d,isMainFrame:false},{...f.d,securityOrigin:'https://other.test'},{...f.d,requestingUrl:'about:blank'},{}]) expect(await f.ask(d)).toBe(false);
    expect(await f.ask(f.d,'notifications')).toBe(false); expect(await f.ask(f.d,'media',null)).toBe(false);
    expect(f.check(f.wc,'media',f.a.origin,{...f.d,mediaType:'video'})).toBe(false);
    f.native.revokeMicrophone(); expect(f.wc.reloadIgnoringCache).toHaveBeenCalledTimes(1);
    const preventDefault = mock(() => {}); f.wc.emit('will-prevent-unload',{preventDefault}); expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(f.check(f.wc,'media',f.a.origin,f.d)).toBe(false);
  });
  test('trusted context, consent denied, stale OS prompt, server switch', async () => {
    expect(await fixture('http://192.168.1.50').ask()).toBe(false);
    expect(await fixture('http://127.0.0.2').ask()).toBe(true);
    const f = fixture(); f.dialog.showMessageBox.mockResolvedValueOnce({response:0}); expect(await f.ask()).toBe(false);
    f.systemPreferences.getMediaAccessStatus.mockReturnValue('denied'); expect(await f.ask()).toBe(false);
    f.systemPreferences.getMediaAccessStatus.mockReturnValue('not-determined'); f.systemPreferences.askForMediaAccess.mockImplementation(async () => { f.a.generation++; return true; });
    expect(await f.ask()).toBe(false); expect(f.native.state().microphoneGranted).toBe(false);
    f.systemPreferences.getMediaAccessStatus.mockReturnValue('granted'); expect(await f.ask()).toBe(true); f.native.deactivate(f.a.window); expect(f.wc.reloadIgnoringCache).toHaveBeenCalledTimes(1);
    f.a.origin = 'https://elsewhere.test'; expect(f.native.state().microphoneGranted).toBe(false);
  });
});
function transfer(f: ReturnType<typeof fixture>, overrides = {}, frame: unknown = f.wc.mainFrame, wc: unknown = f.wc) {
  const url = f.a.origin + '/attachment'; let partial = '';
  const item = Object.assign(new EventEmitter(), {getURL: () => url, getURLChain: () => [url], getInitiatorOrigin: () => f.a.origin,
    hasUserGesture: () => true, getFilename: () => '../../export.csv', getSavePath: () => partial, setSavePath: (p: string) => { partial = p; }, cancel: mock(() => {}), ...overrides});
  const preventDefault = mock(() => {}); f.profile.emit('will-download',{preventDefault},item,wc,frame); return {item, preventDefault, partial};
}
test('Save As suggests only a sanitized filename and cancelling writes nothing', () => {
  const f = fixture();
  for (const [filename,safe] of [['../../export.csv','export.csv'],['..\\CON.txt','export'],['report\u202e?.txt','report__.txt']]) {
    expect(transfer(f,{getFilename:()=>filename}).preventDefault).toHaveBeenCalledTimes(1);
    expect(f.dialog.showSaveDialogSync).toHaveBeenLastCalledWith(f.a.window,expect.objectContaining({defaultPath:safe}));
  }
});
test('native provenance denies unknown frame, profile, origin, middle redirects and passive requests before dialog', () => {
  const f = fixture(), url = f.a.origin + '/file';
  for (const overrides of [{getURLChain:()=>[]},{getURLChain:()=>[url,'https://other.test/redirect',url]}, {hasUserGesture:()=>false}, {getInitiatorOrigin:()=>''}, {getURL:()=> 'blob:https://other.test/export'}]) expect(transfer(f,overrides).preventDefault).toHaveBeenCalledTimes(1);
  expect(transfer(f,{},null).preventDefault).toHaveBeenCalledTimes(1); expect(transfer(f,{},{url:f.d.requestingUrl}).preventDefault).toHaveBeenCalledTimes(1);
  expect(transfer(f,{},f.wc.mainFrame,{}).preventDefault).toHaveBeenCalledTimes(1); Object.assign(f.wc,{session:{}}); expect(transfer(f).preventDefault).toHaveBeenCalledTimes(1);
  expect(f.dialog.showSaveDialogSync).not.toHaveBeenCalled();
});
test('private staging: cancel, interrupted stream, replacement, stale generation and frame', async () => {
  const f = fixture(), dir = await fs.mkdtemp(path.join(os.tmpdir(),'native-save-')), dest = path.join(dir,'report');
  try {
    expect(transfer(f).preventDefault).toHaveBeenCalledTimes(1);
    f.dialog.showSaveDialogSync.mockReturnValue(dest); await fs.writeFile(dest,'old'); expect(transfer(f).preventDefault).toHaveBeenCalledTimes(1);
    f.dialog.showMessageBoxSync.mockReturnValue(1);
    for (const mode of ['interrupted','switch','frame','generation','changed','completed']) {
      const blob = 'blob:'+f.a.origin+'/123'; const t = transfer(f,{getURL:()=>blob,getURLChain:()=>[blob]});
      expect(t.preventDefault).not.toHaveBeenCalled(); await fs.writeFile(t.partial,'export');
      if(mode==='switch') {f.native.deactivate(f.a.window,true);expect(t.item.cancel).toHaveBeenCalledTimes(1);}
      if(mode==='frame') f.wc.mainFrame = {...f.wc.mainFrame}; if(mode==='generation') f.a.generation++;
      if(mode==='changed') await fs.writeFile(dest,'changed');
      t.item.emit('done',{},mode==='interrupted'?mode:'completed');
      expect(await fs.readFile(dest,'utf8')).toBe(mode==='completed'?'export':mode==='changed'?'changed':'old'); expect(await fs.readdir(dir)).toEqual(['report']);
    }
    await fs.unlink(dest); const t = transfer(f); await fs.writeFile(t.partial,'new'); t.item.emit('done',{},'completed'); expect(await fs.readFile(dest,'utf8')).toBe('new');
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
test('loopback fixture: save authenticated attachment, deny then grant and revoke dictation without replacing chat on denial', async () => {
  const server = Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){
    if(req.headers.get('cookie')!=='fixture=signed-in') return new Response(null,{status:401});
    return new URL(req.url).pathname==='/attachment' ? new Response('export bytes',{headers:{'content-disposition':'attachment; filename=export.csv'}}) : new Response('fixture chat');
  }});
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'desktop-actions-'));
  try {
    const f=fixture(server.url.origin), headers={cookie:'fixture=signed-in'}, dest=path.join(dir,'report.csv');
    const saved=await fetch(f.wc.getURL(),{headers}); expect(await saved.text()).toBe('fixture chat');
    f.dialog.showSaveDialogSync.mockReturnValue(dest); const t=transfer(f);
    const res=await fetch(t.item.getURL(),{headers}); expect(res.headers.get('content-disposition')).toContain('attachment');
    await fs.writeFile(t.partial,new Uint8Array(await res.arrayBuffer())); t.item.emit('done',{},'completed'); expect(await fs.readFile(dest,'utf8')).toBe('export bytes');
    f.dialog.showMessageBox.mockResolvedValueOnce({response:0}); expect(await f.ask()).toBe(false); expect(f.wc.reloadIgnoringCache).not.toHaveBeenCalled();
    expect(await (await fetch(f.wc.getURL(),{headers})).text()).toBe('fixture chat');
    expect(await f.ask()).toBe(true); expect(f.native.revokeMicrophone()).toBe(true); expect(f.wc.reloadIgnoringCache).toHaveBeenCalledTimes(1);
  } finally {server.stop(true);await fs.rm(dir,{recursive:true,force:true});}
});
test('loopback attachment fixture: abort a real streaming response without publishing its prefix', async () => {
  const { createServer } = await import('node:http');
  const server = createServer((_req,res) => { res.writeHead(200,{'Content-Disposition':'attachment; filename=export.csv'}); res.write('prefix'); });
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  const address = server.address() as import('node:net').AddressInfo;
  const f = fixture(`http://127.0.0.1:${address.port}`), dir = await fs.mkdtemp(path.join(os.tmpdir(),'native-stream-'));
  const controller = new AbortController();
  try {
    f.dialog.showSaveDialogSync.mockReturnValue(path.join(dir,'export.csv'));
    const t = transfer(f,{cancel:()=>controller.abort()});
    const response = await fetch(t.item.getURL(),{signal:controller.signal}), stream = response.body!.getReader();
    const {value} = await stream.read(); await fs.writeFile(t.partial,value!);
    f.native.deactivate(f.a.window,true); await expect(stream.read()).rejects.toThrow();
    t.item.emit('done',{},'cancelled'); expect(await fs.readdir(dir)).toEqual([]);
  } finally { controller.abort(); server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); await fs.rm(dir,{recursive:true,force:true}); }
});
