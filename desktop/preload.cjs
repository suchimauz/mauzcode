'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// The settings bridge is installed only in the local file; the remote preload has no setup IPC.
const ACTIONS = new Set(['cancel', 'back', 'retry', 'mic-grant', 'mic-revoke', 'notifications-on', 'notifications-off',
  'update-check', 'update-download', 'update-later', 'update-restart']);
contextBridge.exposeInMainWorld('desktopSetup', {
  getState: () => ipcRenderer.invoke('setup:state'),
  connect: (url, options) => ipcRenderer.invoke('setup:connect', String(url), { allowHttp: options?.allowHttp === true }),
  action: name => ACTIONS.has(name) ? ipcRenderer.invoke('setup:action', name) : Promise.resolve({ ok: false, error: 'Неизвестное действие.' }),
  onState: callback => { ipcRenderer.on('setup:state', (_event, state) => callback(state)); }
});
