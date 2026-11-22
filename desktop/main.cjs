'use strict';
const { app, BrowserWindow, Menu, ipcMain, dialog, shell, session, Tray, nativeImage, powerMonitor, Notification, systemPreferences } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { serverURL, webURL, sameOrigin, needsHttpConsent } = require('./security.cjs');
const { openProfile, partitionFor } = require('./profile.cjs');
const { stageConnection, probeSession, reasonFor } = require('./connection.cjs');
const { createNativeAccess } = require('./native-access.cjs');
const { createNotifications } = require('./notifications.cjs');
const { createUpdates } = require('./updates.cjs');
const { buildShellMenu } = require('./shell-menu.cjs');

app.enableSandbox();
const resource = name => path.join(__dirname, name);
const localURL = pathToFileURL(resource('index.html')).href;
const secure = { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, webviewTag: false };
const profiles = new WeakSet();
let setup, active, candidate, store, native, notices, updates;
let savedURL = '', status = '', generation = 0, externalPrompt = false;
const alive = win => win && !win.isDestroyed();
const lifecycle = require('./lifecycle.cjs')({ app, Tray, Menu, nativeImage, powerMonitor, platform: process.platform,
  assets: name => resource('assets/' + name), getWindows: () => [candidate?.signingIn && candidate.window, setup, active?.window], createWindow: () => showSetup() });
const getActive = () => !lifecycle.isQuitting() && active?.ready && alive(active.window) ? active : null;
function restore(win) { if (alive(win)) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } }
function state() {
  const mic = native.state(), n = notices.status();
  return { url: savedURL, status, connected: !!active?.ready, connecting: !!candidate, version: app.getVersion(),
    liveStatus: active?.ready ? ({ unknown: 'unsupported', connected: 'connected', connecting: 'reconnecting', disconnected: 'offline' })[n.live] : '',
    permissions: { microphone: mic.microphoneGranted, microphoneSupported: mic.microphoneSupported, microphoneReason: mic.microphoneReason, notifications: n.enabled, notificationSupport: n.supported }, update: updates.state() };
}
function changed() { if (alive(setup) && setup.webContents.getURL() === localURL) setup.webContents.send('setup:state', state()); }
function showSetup(message) {
  if (lifecycle.isQuitting()) return;
  if (message !== undefined) status = message;
  if (alive(setup)) { changed(); restore(setup); return; }
  const win = setup = new BrowserWindow({ width: 720, height: 740, minWidth: 460, minHeight: 410, icon: resource('assets/icon.png'), title: 'MauzCode — настройки', webPreferences: { ...secure, preload: resource('preload.cjs') } });
  lifecycle.attach(win, () => !active && !candidate);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  for (const event of ['will-navigate', 'will-redirect', 'will-attach-webview']) win.webContents.on(event, e => e.preventDefault());
  win.on('close', e => { if (candidate && !lifecycle.isQuitting()) { e.preventDefault(); candidate.control.cancel(); } });
  win.on('closed', () => { if (setup === win) setup = null; if (!lifecycle.isQuitting()) restore(active?.window); });
  void win.loadFile(resource('index.html')).catch(() => { if (alive(win)) { dialog.showErrorBox('MauzCode', 'Не удалось загрузить локальные настройки.'); lifecycle.quit(); } });
}
async function openExternal(record, value) {
  const url = webURL(value);
  if (!url || record !== active || !record.ready || externalPrompt) return;
  const revision = record.generation; externalPrompt = true;
  try {
    const { response } = await dialog.showMessageBox(record.window, { type: 'question', title: 'Внешняя ссылка', message: 'Открыть ссылку в системном браузере?', detail: url.origin, buttons: ['Отмена', 'Открыть'], defaultId: 0, cancelId: 0, noLink: true });
    if (response === 1 && getActive() === record && revision === record.generation) await shell.openExternal(url.href);
  } catch { if (active === record) showSetup('Не удалось открыть системный браузер.'); }
  finally { externalPrompt = false; }
}
function invalidate(record) {
  record.ready = false; record.generation = ++generation;
  native.deactivate(record.window, true); notices.clear();
}
function prepareSession(origin) {
  const partition = partitionFor(origin), profile = session.fromPartition(partition);
  if (!profiles.has(profile)) {
    native.attach(profile);
    profile.cookies.on('changed', (_e, cookie) => {
      // Do not read the cookie value. Session cookie names are configurable on the server.
      const record = getActive(); if (record?.origin !== origin || !cookie.httpOnly) return;
      const domain = (cookie.domain || '').replace(/^\./, ''), host = new URL(origin).hostname;
      if (host !== domain && !host.endsWith('.' + domain)) return;
      notices.clear(); notices.activate();
    });
    profiles.add(profile);
  }
  return { partition, profile };
}
function connect(value, allowHttp = false) {
  if (candidate) return { ok: false, error: 'Сначала завершите или отмените текущую проверку.' };
  let win, url;
  try {
    url = serverURL(value); const origin = new URL(url).origin;
    if (needsHttpConsent(url) && allowHttp !== true) return { ok: false, error: 'Подтвердите подключение без шифрования.' };
    const { partition, profile } = prepareSession(origin);
    win = new BrowserWindow({ width: 1280, height: 850, minWidth: 640, minHeight: 480, show: false, icon: resource('assets/icon.png'), title: 'MauzCode', webPreferences: { ...secure, partition, preload: resource('remote-preload.cjs') } });
    const record = { window: win, origin, generation: ++generation, ready: false, signingIn: false };
    lifecycle.attach(win, () => active === record);
    record.control = stageConnection({ url, profile, window: win,
      signingIn() { record.signingIn = true; status = 'Сервер доступен. Войдите в окне сервера или отмените проверку.'; changed(); restore(win); },
      promote() {
        if (candidate !== record || !alive(win)) throw Error('Candidate no longer active');
        store.save(url); // The only write of server.json. Sync and atomic; the old chat is still intact if it fails.
        const old = active; if (old) { old.control.retire(); invalidate(old); }
        savedURL = url; active = record; candidate = null; record.ready = true; status = '';
        if (alive(old?.window)) old.window.destroy();
        if (alive(setup)) setup.destroy(); restore(win); notices.activate();
      },
      failed(message, quiet) {
        if (candidate !== record) return;
        candidate = null; if (!quiet) showSetup(message);
        if (alive(win)) win.destroy();
      },
      onStart() { invalidate(record); },
      onDocument(href, httpCode) {
        record.ready = httpCode !== 401 && !/^\/auth\//.test(new URL(href).pathname); record.generation = ++generation;
        status = record.ready ? '' : 'Сервер доступен. Нужен вход.'; if (record.ready) notices.activate(); changed();
      },
      pageError(message, http) {
        invalidate(record); status = message;
        if (http) changed(); else showSetup(message); // Preserve HTTP response bodies and the last working address.
      }, openExternal: target => void openExternal(record, target)
    });
    win.once('closed', () => {
      if (candidate === record) record.control.cancel();
      if (active === record) { active = null; record.control.retire(); invalidate(record); }
    });
    candidate = record; status = 'Проверяем сервер…'; changed(); void record.control.start(); return { ok: true };
  } catch (e) { if (alive(win)) win.destroy(); return { ok: false, error: url ? 'Не удалось открыть серверный профиль.' : e.message }; }
}
async function retry() {
  if (candidate) { if (candidate.signingIn) restore(candidate.window); return { ok: true }; }
  const record = getActive();
  if (!record) { if (savedURL) { showSetup(); return connect(savedURL, true); } showSetup(); return { ok: true }; }
  if (notices.retry()) return { ok: true }; // Existing transport resyncs via read-only requests; never reload a healthy draft.
  try {
    const result = await probeSession(record.window.webContents.session, record.origin, AbortSignal.timeout(10000));
    if (record === getActive()) { if (result === 'login') { showSetup(); return connect(savedURL, true); } status = 'Сервер доступен.'; changed(); }
  } catch (e) { if (record === getActive()) showSetup(reasonFor(e)); }
  return { ok: true };
}
function trusted(event) { return alive(setup) && event.sender === setup.webContents && event.senderFrame === setup.webContents.mainFrame && event.senderFrame?.url === localURL; }
function local(channel, fn) { ipcMain.handle(channel, (event, ...args) => { if (!trusted(event)) throw Error('Forbidden'); return fn(...args); }); }
async function action(name) {
  switch (name) {
    case 'cancel': candidate?.control.cancel(); return { ok: true };
    case 'back': if (candidate) candidate.control.cancel(true); if (alive(active?.window)) { setup.destroy(); restore(active.window); return { ok: true }; } return retry();
    case 'retry': return retry();
    case 'mic-grant': return { ok: await native.grantMicrophone() };
    case 'mic-revoke': return { ok: native.revokeMicrophone() };
    case 'notifications-on': return { ok: notices.status().supported && notices.setEnabled(true) };
    case 'notifications-off': return { ok: notices.setEnabled(false) };
    case 'update-check': case 'update-download': case 'update-later': case 'update-restart': await updates.action(name.slice(7)); return { ok: true };
    default: return { ok: false, error: 'Неизвестное действие.' };
  }
}
if (lifecycle.primary) app.whenReady().then(() => {
  store = openProfile(app.getPath('userData'));
  native = createNativeAccess({ dialog, systemPreferences, platform: process.platform, getActive, preferences: store, changed });
  notices = createNotifications({ ipcMain, Notification, getActive, preferences: store, changed, restore: () => restore(active?.window) });
  updates = createUpdates({ app, changed });
  // Squirrel may still decline an update. Enter quit mode only once Electron actually starts quitting.
  if (process.platform === 'darwin') require('electron').autoUpdater.on('before-quit-for-update', lifecycle.beginQuit);
  local('setup:state', state); local('setup:connect', (url, options) => connect(url, options?.allowHttp === true)); local('setup:action', action);
  app.on('before-quit', () => { candidate?.control.cancel(true); if (active) { active.control.retire(); invalidate(active); } });
  lifecycle.start();
  Menu.setApplicationMenu(buildShellMenu({ Menu, platform: process.platform, settings: () => showSetup(),
    retry: () => void retry(), back: () => { const history = (candidate?.signingIn ? candidate : active)?.window.webContents.navigationHistory; if (history?.canGoBack()) history.goBack(); },
    reload: () => { if (!candidate && alive(active?.window)) active.window.webContents.reload(); }, quit: lifecycle.quit }));
  try { savedURL = store.saved(); } catch { status = 'Не удалось прочитать сохранённый адрес. Введите его заново.'; }
  showSetup(); if (savedURL) { const result = connect(savedURL, true); if (!result.ok) showSetup(result.error); }
}).catch(() => { dialog.showErrorBox('MauzCode', 'Не удалось запустить клиент.'); app.quit(); });
