'use strict';
// Sandboxed preload: no general IPC, URLs, notification text or local controls.
const { contextBridge, ipcRenderer } = require('electron');
if (process.isMainFrame) {
  let retry;
  ipcRenderer.on('desktop-live-retry', () => retry?.());
  const valid = x => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x);
  contextBridge.exposeInMainWorld('mauzcodeDesktopLive', Object.freeze({
    capability(scope) { if (scope === null || valid(scope)) ipcRenderer.send('desktop-live-capability', scope); },
    status(state) { if (['connected','disconnected','connecting'].includes(state)) ipcRenderer.send('desktop-live-status', state); },
    hint(scope,id) { if (valid(scope) && valid(id)) ipcRenderer.send('desktop-live-hint', scope,id); },
    onRetry(callback) { if (typeof callback === 'function') retry = callback; },
  }));
}
