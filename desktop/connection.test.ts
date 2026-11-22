import { afterEach, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
const { stageConnection, probeSession } = require('./connection.cjs');
const { openProfile, partitionFor } = require('./profile.cjs');
const { needsHttpConsent } = require('./security.cjs');
const cleanups: (() => void)[] = [];
afterEach(() => { for (const undo of cleanups.splice(0).reverse()) undo(); });
function temp() { const dir = mkdtempSync(join(tmpdir(), 'desktop-fixture-')); cleanups.push(() => rmSync(dir, {recursive:true, force:true})); return dir; }
const oldURL = 'https://old.example/a/previous';
function fixture(sessionResponse: (r: Request) => Response | Promise<Response>, options: any = {}) {
  const dir = temp(); writeFileSync(join(dir, 'server.json'), JSON.stringify({url:oldURL})); // legacy format, independent of new writer
  const store = openProfile(dir); const old = {open:true,draft:'unfinished'}; let cookie = '', loadedURL = '', html = true;
  let closed = false, logins = 0, message = '', pageErrors: string[] = [], calls: string[] = [];
  const server = Bun.serve({ hostname:'127.0.0.1',port:0, idleTimeout:2, fetch(req) {
    const path = new URL(req.url).pathname; calls.push(path);
    if (path === '/auth/session') { expect(req.headers.get('accept')).toBe('application/json'); return sessionResponse(req); }
    if (path === '/fixture-sign-in') return new Response(null,{headers:{'set-cookie':'session=fixture; HttpOnly; Path=/'}});
    return options.document?.(req) ?? new Response('<!doctype html><title>fixture</title>',{headers:{'content-type':'text/html'}});
  } }); cleanups.push(()=>server.stop(true));
  const url = server.url.origin + '/chat';
  const profile = { async fetch(href: string, init: RequestInit = {}) {
    if (options.fetch) return options.fetch(href, init);
    const headers = new Headers(init.headers); if (cookie) headers.set('cookie',cookie);
    const r = await fetch(href, {...init, headers}); const entry = r.headers.get('set-cookie'); if (entry) cookie = entry.split(';')[0]; return r;
  } };
  const wc = Object.assign(new EventEmitter(), { getURL:()=>loadedURL, setWindowOpenHandler() {} });
  const win = { webContents: wc, isDestroyed:()=>closed, async loadURL(href:string) {
    wc.emit('did-start-navigation',{isMainFrame:true,isSameDocument:false});
    const r = await profile.fetch(href,{redirect:'manual'}); if(closed) return;
    if (r.status >= 300 && r.status < 400) { const dest=new URL(r.headers.get('location')!, href).href; let blocked=false; wc.emit('will-redirect',{isMainFrame:true,url:dest,preventDefault(){blocked=true;}}); if(!blocked) await win.loadURL(dest); return; }
    loadedURL=href; html=r.headers.get('content-type')?.includes('text/html') ?? false;
    wc.emit('did-navigate',{},href,r.status); wc.emit('did-finish-load');
  } };
  const settled = Promise.withResolvers<void>(), login = Promise.withResolvers<void>(); let timer: any;
  const control = stageConnection({ url, profile, window:win, verifyDocument:async()=>html, timeoutMs:options.timeoutMs??1500, loginTimeoutMs:1500, loginPollMs:40,
    failed(reason:string){message=reason; closed=true; settled.resolve();}, signingIn(){logins++;login.resolve();},
    promote(){store.save(url);old.open=false;settled.resolve();}, onStart(){},onDocument(){},pageError(s:string){pageErrors.push(s);}, openExternal(){throw Error('candidate must not open an external browser');} });
  cleanups.push(()=>{control.retire(); clearTimeout(timer);});
  function kept() { expect(old).toEqual({open:true,draft:'unfinished'}); expect(openProfile(dir).saved()).toBe(oldURL); expect(closed).toBe(true); }
  function done() { return Promise.race([settled.promise, new Promise((_,rej)=>{timer=setTimeout(()=>rej(Error('stage did not settle')),2000);})]); }
  return { old,dir,server,profile,calls,wc,win,url,control,login,kept,done,get message(){return message;},get logins(){return logins;},get loadedURL(){return loadedURL;},pageErrors };
}
for (const body of [{authenticated:true}, {authenticated:true,user:{name:'legacy'}}, {authenticated:false,required:false}]) test(`stage confirms session ${JSON.stringify(body)} and HTML, then atomically promotes`,async()=>{
  const f=fixture(()=>Response.json(body)); await f.control.start(); await f.done(); expect(f.old.open).toBe(false); expect(f.logins).toBe(0); expect(openProfile(f.dir).saved()).toBe(f.url); expect(f.calls).toEqual(['/auth/session','/chat','/auth/session']);
});
for(const [name, reply] of [
  ['HTML placeholder',()=>new Response('<html>portal</html>',{headers:{'content-type':'text/html'}})],
  ['invalid JSON',()=>new Response('{',{headers:{'content-type':'application/json'}})], ['wrong schema',()=>Response.json({ok:true})],
  ['unrecognized 401',()=>Response.json({error:'else'},{status:401})],['unknown required mode',()=>Response.json({authenticated:false})],
  ['missing endpoint',()=>new Response('',{status:404})],['server error',()=>new Response('',{status:503})],['access denied',()=>new Response('',{status:403})],
  ['redirect',()=>Response.redirect('https://forbidden.invalid')],['oversized input',()=>new Response(' '.repeat(65537),{headers:{'content-type':'application/json'}})]
] as const) test(`reject ${name}; working chat and address survive restart`,async()=>{ const f=fixture(reply);await f.control.start();await f.done();f.kept();expect(f.message.length).toBeGreaterThan(0); });
for(const code of [401,403,404,500]) test(`valid session but UI HTTP ${code}: no promotion`,async()=>{const f=fixture(()=>Response.json({authenticated:true}),{document:()=>new Response('Denied',{status:code})});await f.control.start();await f.done();f.kept();expect(f.message).toContain(String(code));});
test('reject non-HTML document despite good session; reject foreign document redirect',async()=>{
  for(const document of [()=>Response.json({hello:'world'}),()=>Response.redirect('https://external.invalid/chat')]){const f=fixture(()=>Response.json({authenticated:true}),{document});await f.control.start();await f.done();f.kept();}
});
for(const body of [{authenticated:false},{error:'unauthorized',message:'Authentication required'}]) test(`401 ${Object.keys(body)[0]} → same-origin login → UI and second session check`,async()=>{
  const f=fixture(r=>r.headers.get('cookie')==='session=fixture'?Response.json({authenticated:true}):Response.json(body,{status:401}));
  await f.control.start();await f.login.promise;expect(f.old.open).toBe(true);expect(openProfile(f.dir).saved()).toBe(oldURL);
  await f.profile.fetch(f.server.url.origin+'/fixture-sign-in');await f.win.loadURL(f.url);await f.done();expect(f.old.open).toBe(false);expect(f.logins).toBe(1);expect(openProfile(f.dir).saved()).toBe(f.url);
});
test('OIDC-only login redirect to identity provider fails closed; return to original session',async()=>{
  const f=fixture(()=>Response.json({authenticated:false},{status:401}),{document:()=>Response.redirect('https://identity.invalid/authorize')});await f.control.start();await f.done();expect(f.message).toContain('OIDC');expect(f.logins).toBe(1);f.kept();
});
test('timeout, cancelled in-flight or crashed renderer never promote late responses',async()=>{
  for(const which of ['timeout','cancel','renderer']) { const held=Promise.withResolvers<Response>();const f=fixture(()=>held.promise,{timeoutMs:35});
    const started=f.control.start();if(which==='cancel') f.control.cancel();if(which==='renderer') f.wc.emit('render-process-gone',{},{});await f.done();held.resolve(Response.json({authenticated:true}));await started;f.kept(); }
});
test('legacy profile maps to identical partition, different ports get no old credentials; HTTP consent is exact',async()=>{
  const legacy=(origin:string)=>'persist:mauzcode-'+createHash('sha256').update(origin).digest('hex');const f=fixture(r=>Response.json({authenticated:r.headers.has('cookie')},{status:r.headers.has('cookie')?200:401}));
  const g=fixture(r=>Response.json({authenticated:r.headers.has('cookie')},{status:r.headers.has('cookie')?200:401}));
  const jars=new Map([[legacy(f.server.url.origin), f.profile],[partitionFor(g.server.url.origin),g.profile]]); await f.profile.fetch(f.server.url.origin+'/fixture-sign-in');
  writeFileSync(join(f.dir,'server.json'),JSON.stringify({url:f.url}));const origin=new URL(openProfile(f.dir).saved()).origin;
  expect(await probeSession(jars.get(partitionFor(origin)),origin)).toBe('ok');expect(await probeSession(jars.get(partitionFor(g.server.url.origin)),g.server.url.origin)).toBe('login');
  const p=openProfile(f.dir);p.set(origin,'microphone',true);expect(openProfile(f.dir).get(origin,'microphone')).toBe(true);expect(p.get(g.server.url.origin,'microphone')).toBe(false);
  for(const url of ['http://localhost:50','https://lan.local','http://127.3.2.1','http://[::1]'])expect(needsHttpConsent(url)).toBe(false); expect(needsHttpConsent('http://localhost.example')).toBe(true);
});
test('real invalid TLS certificate rejected without bypass; previous selection survives',async()=>{
  const dir=temp(), key=join(dir,'ephemeral.key'), cert=join(dir,'ephemeral.crt');const proc=Bun.spawnSync(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',key,'-out',cert,'-subj','/CN=localhost']);expect(proc.exitCode).toBe(0);
  const tls=Bun.serve({port:0,hostname:'127.0.0.1',tls:{cert:readFileSync(cert),key:readFileSync(key)},fetch:()=>Response.json({authenticated:true})});cleanups.push(()=>tls.stop(true));
  const f=fixture(()=>Response.json({}),{fetch:(_href:string,init:RequestInit)=>fetch(new URL('/auth/session',tls.url), init)});await f.control.start();await f.done();f.kept();expect(f.message).toContain('TLS');
});
