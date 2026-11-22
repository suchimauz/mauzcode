'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { sameOrigin } = require('./security.cjs');

function secure(origin) {
  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === 'https:' || (protocol === 'http:' && (hostname === 'localhost' || hostname === '[::1]' || /^127\./.test(hostname) && /^\d+\.\d+\.\d+\.\d+$/.test(hostname)));
  } catch { return false; }
}
function allowedLink(url, origin) {
  if (typeof url !== 'string' || url.length > 16384) return false;
  return sameOrigin(url, origin) || (url.startsWith('blob:' + origin + '/') && sameOrigin(url.slice(5), origin));
}
function suggested(name) {
  const base = String(name || '').split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f<>:"|?*\u202a-\u202e\u2066-\u2069]/g, '_').slice(0, 160).replace(/^\.+|[. ]+$/g, '');
  return !base || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base) ? 'export' : base;
}
function createNativeAccess({ dialog, systemPreferences, platform, getActive, preferences, changed = () => {} }) {
  const attached = new WeakSet(), captures = new WeakSet();
  let epoch = 0, job = null, prompt = null;
  function active() {
    try {
      const a = getActive();
      if (!a || a.window.isDestroyed() || a.generation == null) return null;
      const wc = a.window.webContents, frame = wc.mainFrame;
      return !wc.isDestroyed() && frame && sameOrigin(frame.url, a.origin) && sameOrigin(wc.getURL(), a.origin) ? { ...a, wc, frame, epoch } : null;
    } catch { return null; }
  }
  function live(a) {
    const b = active();
    return !!a && !!b && a.window === b.window && a.frame === b.frame && a.generation === b.generation && a.origin === b.origin && a.epoch === b.epoch;
  }
  function os() {
    if (!['darwin', 'win32'].includes(platform)) return 'granted'; // Linux enforces device/portal access on acquisition.
    try { return systemPreferences.getMediaAccessStatus('microphone'); } catch { return 'unknown'; }
  }
  function state() {
    const a = active(), status = os();
    const reason = !a ? 'Нет активной страницы.' : !secure(a.origin) ? 'Для микрофона нужен HTTPS или localhost.' : ['denied','restricted','unknown'].includes(status) ? 'Разрешите доступ к микрофону в настройках системы.' : '';
    return { microphoneSupported: !reason, microphoneGranted: !!a && !reason && status === 'granted' && preferences.get(a.origin, 'microphone') === true, microphoneReason: reason };
  }
  async function grant(a = active()) {
    if (!live(a) || !state().microphoneSupported) return false;
    if (state().microphoneGranted) return true;
    if (prompt) return false;
    const token = prompt = {};
    try {
      const { response } = await dialog.showMessageBox(a.window, { type: 'question', title: 'Микрофон', message: `Разрешить диктовку на ${a.origin}?`, buttons: ['Отмена','Разрешить'], defaultId: 0, cancelId: 0, noLink: true });
      if (!live(a) || response !== 1) return false;
      if (platform === 'darwin' && os() === 'not-determined' && !await systemPreferences.askForMediaAccess('microphone')) return false;
      if (!live(a) || os() !== 'granted') return false;
      preferences.set(a.origin, 'microphone', true); changed(); return true;
    } catch { return false; } finally { if (prompt === token) prompt = null; }
  }
  function stop(w) {
    if (!w || !captures.delete(w) || w.isDestroyed() || w.webContents.isDestroyed()) return;
    const wc = w.webContents;
    const forceUnload = event => event.preventDefault(); // Electron: ignore the document's beforeunload veto.
    wc.on('will-prevent-unload', forceUnload);
    wc.once('did-navigate', () => wc.removeListener('will-prevent-unload', forceUnload));
    wc.reloadIgnoringCache();
  }
  function deactivate(w, replacingDocument = false) {
    epoch++; prompt = null;
    const old = job; job = null;
    if (old?.started) { try { old.item.cancel(); } catch { /* already completed or destroyed */ } finally { cleanup(old); } }
    const target = w?.window || w || active()?.window;
    // Navigation/destruction tears down the old document; don't re-load it a second time.
    if (replacingDocument) captures.delete(target); else stop(target);
  }
  function revokeMicrophone() {
    const a = active(); if (!a) return false;
    preferences.set(a.origin, 'microphone', false); deactivate(a.window); changed(); return true;
  }
  function media(wc, permission, d) {
    const a = active();
    return a && a.wc === wc && permission === 'media' && d?.isMainFrame === true && sameOrigin(d.requestingUrl, a.origin) && (!d.securityOrigin || sameOrigin(d.securityOrigin, a.origin)) && secure(a.origin) ? a : null;
  }
  function attach(profile) {
    if (attached.has(profile)) return; attached.add(profile);
    profile.on('will-download', (event, item, wc, frame) => download(profile, event, item, wc, frame));
    profile.setPermissionCheckHandler((wc, perm, origin, d) => {
      const a = media(wc, perm, d);
      const ok = !!a && sameOrigin(origin, a.origin) && d.mediaType === 'audio' && state().microphoneGranted;
      if (ok) captures.add(a.window); return ok;
    });
    profile.setPermissionRequestHandler((wc, perm, callback, d) => {
      const a = media(wc, perm, d);
      if (!a || d.mediaTypes?.length !== 1 || d.mediaTypes[0] !== 'audio') return callback(false);
      grant(a).then(ok => { const allow = ok && live(a) && state().microphoneGranted; if (allow) captures.add(a.window); callback(allow); }, () => callback(false));
    });
  }
  function cleanup(j) {
    if (j.dir) { try { fs.rmSync(j.dir, { recursive: true, force: true }); } catch { /* retry on done after cancellation */ } }
  }
  function snapshot(file) {
    const s = fs.lstatSync(file, { bigint: true, throwIfNoEntry: false });
    if (!s) return null;
    if (!s.isFile()) throw Error('Not a regular file');
    return `${s.dev}:${s.ino}:${s.ctimeNs}:${s.size}`;
  }
  function download(profile, event, item, wc, frame) {
    const a = active();
    const current = () => live(a) && wc === a.wc && frame === a.frame && wc.session === profile;
    const permitted = () => {
      const chain = item.getURLChain();
      return current() && item.hasUserGesture() && item.getInitiatorOrigin() === a.origin &&
        Array.isArray(chain) && chain.length > 0 && chain.every(url => allowedLink(url, a.origin)) && allowedLink(item.getURL(), a.origin);
    };
    let j;
    try {
      if (job || !permitted()) throw Error();
      job = j = { item }; // Reserve before entering the native modal event loop.
      const destination = dialog.showSaveDialogSync(a.window, { title: 'Сохранить как', defaultPath: suggested(item.getFilename()), properties: ['showOverwriteConfirmation'] });
      if (!path.isAbsolute(destination || '') || job !== j || !permitted()) throw Error();
      const original = snapshot(destination);
      if (original && dialog.showMessageBoxSync(a.window, { type: 'question', message: `Заменить файл ${destination}?`, buttons: ['Отмена', 'Заменить'], cancelId: 0, defaultId: 0 }) !== 1) throw Error();
      if (job !== j || !permitted()) throw Error();
      j.dir = fs.mkdtempSync(path.join(path.dirname(destination), '.mauzcode-'));
      const partial = path.join(j.dir, 'download');
      item.setSavePath(partial);
      item.once('done', (_event, state) => {
        try {
          if (state !== 'completed' || job !== j || !permitted() || item.getSavePath() !== partial || !snapshot(partial)) return;
          if (!original) fs.linkSync(partial, destination); // atomic publication; never clobber a later arrival
          else if (snapshot(destination) === original) fs.renameSync(partial, destination);
        } catch { /* destination unavailable or changed: discard staging */ }
        finally { if (job === j) job = null; cleanup(j); }
      });
      j.started = true;
    } catch {
      event.preventDefault();
      if (j) { if (job === j) job = null; cleanup(j); }
    }
  }
  return { attach, state, grantMicrophone: () => grant(), revokeMicrophone, deactivate };
}
module.exports = { createNativeAccess };
