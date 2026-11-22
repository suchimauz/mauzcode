'use strict';
const hex = x => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x);
const background = w => w.isMinimized() || !w.isVisible();
function createNotifications({ipcMain, Notification, getActive, preferences, changed, restore}) {
  let scope = null, live = 'unknown', epoch = 0;
  const shown = new Set(), pending = new Set(), seen = new Map();
  function invalidate() { epoch++; pending.clear(); for (const n of shown) { try { n.close(); } catch { /* OS may already have discarded it. */ } } shown.clear(); }
  function clear() { invalidate(); scope=null; live='unknown'; changed(); }
  function active(event) {
    const a=getActive();
    if (!a || !a.window || a.window.isDestroyed()) return null;
    const wc=a.window.webContents;
    try {
      if(new URL(wc.getURL()).origin!==a.origin) return null;
      if(event && (event.sender!==wc || event.senderFrame!==wc.mainFrame || new URL(event.senderFrame.url).origin!==a.origin)) return null;
    } catch {return null;}
    return {window:a.window,origin:a.origin,generation:a.generation};
  }
  function enabled(a) { return !!a && !!preferences.get(a.origin,'notifications'); }
  function status() { const a=active(); return {supported:!!a && !!scope && Notification.isSupported(),enabled:enabled(a),live}; }
  function setEnabled(value) {const a=active(); if(!a || typeof value!=='boolean') return false; preferences.set(a.origin,'notifications',value); if(!value) invalidate(); changed(); return true;}
  // Promotion may happen after hello in the candidate. Request a fresh authenticated hello.
  function activate() {const a=active(); if(!a) return false; a.window.webContents.send('desktop-live-retry'); return true;}
  function retry() {return live!=='unknown' && activate();}
  ipcMain.on('desktop-live-capability',(e,s)=>{if(active(e) && (s===null || hex(s)) && s!==scope){invalidate();scope=s;changed();}});
  ipcMain.on('desktop-live-status',(e,s)=>{if(active(e) && ['connected','disconnected','connecting'].includes(s) && s!==live){live=s;changed();}});
  ipcMain.on('desktop-live-hint',async(e,s,id)=>{
    const a=active(e), revision=epoch;
    if(!a || !scope || s!==scope || !hex(id) || !enabled(a) || !Notification.isSupported() || !background(a.window)) return;
    const key=[a.origin,s,id].join('/');
    if((seen.get(key)??0)>Date.now() || pending.has(key) || pending.size>=16) return;
    const current=()=>{const b=active();return b && b.window===a.window && b.generation===a.generation && b.origin===a.origin && revision===epoch && scope===s && enabled(b);};
    async function validate() {
      if(!current()) return null;
      const r=await a.window.webContents.session.fetch(`${a.origin}/events/desktop?id=${id}`,{credentials:'include',cache:'no-store',redirect:'error',bypassCustomProtocolHandlers:true,signal:AbortSignal.timeout(5000)});
      if(!r.ok || !r.headers.get('content-type')?.includes('application/json')) return null;
      const data=await r.json();
      return current() && data?.version===1 && data.scope===s && typeof data.agentId==='string' && /^[a-zA-Z0-9_-]{1,128}$/.test(data.agentId) && ['run-finished','input-pending'].includes(data.kind) ? data : null;
    }
    pending.add(key);
    try {
      const data=await validate();
      if(!data || !background(a.window)) return;
      const n=new Notification({title:'MauzCode',body:data.kind==='input-pending'?'Нужен ваш ответ':'Работа агента завершена'});
      for(const [k,exp] of seen) if(exp<=Date.now()) seen.delete(k);
      seen.set(key,Date.now()+86400000); shown.add(n);
      n.once('close',()=>shown.delete(n));
      n.once('click',async()=>{try {const again=await validate(); if(!again || again.agentId!==data.agentId || again.kind!==data.kind) return; restore(); if(current()) await a.window.loadURL(`${a.origin}/a/${again.agentId}`);}catch{/* Stale session/network. */}});
      n.show();
    } catch {/* Unsupported OS/session must not affect chat. */} finally {if(epoch===revision)pending.delete(key);}
  });
  return {status,clear,activate,retry,setEnabled};
}
module.exports={createNotifications};
