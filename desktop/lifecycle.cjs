'use strict';

// On Linux, constructing Electron.Tray does not prove the desktop has an indicator host.
// Probe on close only. A missing D-Bus utility, timeout, or negative response means normal close.
function linuxTrayHost(run = require('node:child_process').spawnSync) {
  try {
    const r = run('dbus-send', ['--session', '--print-reply', '--reply-timeout=250', '--dest=org.kde.StatusNotifierWatcher', '/StatusNotifierWatcher', 'org.freedesktop.DBus.Properties.Get', 'string:org.kde.StatusNotifierWatcher', 'string:IsStatusNotifierHostRegistered'], { timeout: 350, maxBuffer: 8192, encoding: 'utf8' });
    return r.status === 0 && /\bvariant\s+boolean true\s*$/.test(r.stdout);
  } catch { return false; }
}
module.exports = function createLifecycle({ app, Tray, Menu, nativeImage, powerMonitor, platform, assets, getWindows, createWindow, trayAvailable = () => platform !== 'linux' || linuxTrayHost() }) {
  let quitting = false;
  let tray;
  let ready = false;
  let pendingShow = false;
  const primary = app.requestSingleInstanceLock();
  function show() {
    if (quitting) return;
    if (!ready) { pendingShow = true; return; }
    const windows = getWindows().filter(window => window && !window.isDestroyed());
    const window = windows.find(window => window.isVisible()) || windows[0];
    if (!window) { createWindow(); return; }
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }
  function beginQuit() { quitting = true; }
  function quit() { beginQuit(); app.quit(); }
  function restorable() { return tray && !tray.isDestroyed?.() && trayAvailable(); }
  if (!primary) { quit(); return { primary, attach() {}, start() {}, show, quit }; }
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => { if (tray) { tray.destroy(); tray = null; } });
  app.on('second-instance', show);
  app.on('activate', show);
  app.on('window-all-closed', () => { if (quitting || !restorable()) app.quit(); });
  return {
    primary, show, quit, beginQuit, isQuitting: () => quitting,
    attach(window, canHide = () => true) {
      // Windows session shutdown does not always emit app.before-quit.
      window.webContents.on('will-prevent-unload', event => {
        // Remote pages must not veto an explicit quit or OS shutdown.
        if (quitting) event.preventDefault();
      });
      window.on('query-session-end', () => { quitting = true; });
      window.on('session-end', () => { quitting = true; });
      window.on('close', event => {
        if (!quitting && canHide() && restorable()) { event.preventDefault(); window.hide(); }
      });
    },
    start() {
      try {
        const icon = nativeImage.createFromPath(assets(platform === 'darwin' ? 'trayTemplate.png' : 'tray.png'));
        if (icon.isEmpty()) throw new Error('Missing tray icon');
        if (platform === 'darwin') icon.setTemplateImage(true);
        tray = new Tray(icon);
        tray.setToolTip('MauzCode');
        tray.setContextMenu(Menu.buildFromTemplate([
          { label: 'Показать окно', click: show }, { type: 'separator' }, { label: 'Выйти', click: quit }
        ]));
        tray.on('click', show);
        tray.on('double-click', show);
      } catch {
        tray?.destroy(); tray = null; // A tray is optional. Never strand a hidden process.
      }
      // macOS/Linux shutdown notification: never prevent the OS from ending the session.
      powerMonitor.on('shutdown', () => { quitting = true; });
      ready = true;
      if (pendingShow) { pendingShow = false; show(); }
    }
  };
};
module.exports.linuxTrayHost = linuxTrayHost;
