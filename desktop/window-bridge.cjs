'use strict';
// Narrow window bridge for the remote page: report the resolved theme and open the shell popup.
// Accepted only from the top-level frame of the active server origin; nothing else is reachable through it.

/**
 * Wire the window bridge IPC.
 * @param {{ ipcMain: { on(channel: string, fn: Function): void }, getActive: () => ({ window: any, origin: string } | null),
 *   onTheme: (record: { window: any, origin: string }, theme: 'light'|'dark') => void,
 *   openMenu: (record: { window: any, origin: string }, x: number, y: number) => void }} opts
 *   ipcMain is Electron's ipcMain (injected); getActive returns the active chat record or null; onTheme applies and stores a theme
 *   reported by the page; openMenu shows the shell popup at window coordinates.
 * @returns {{ sender: (event: any) => ({ window: any, origin: string } | null) }} The sender check, exported for tests.
 */
function createWindowBridge({ ipcMain, getActive, onTheme, openMenu }) {
  function sender(event) {
    const a = getActive();
    if (!a || !a.window || a.window.isDestroyed()) return null;
    const wc = a.window.webContents;
    try {
      if (!event || event.sender !== wc || event.senderFrame !== wc.mainFrame) return null;
      if (new URL(event.senderFrame.url).origin !== a.origin || new URL(wc.getURL()).origin !== a.origin) return null;
    } catch { return null; }
    return a;
  }
  const coordinate = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000 ? Math.round(value) : null;
  ipcMain.on('desktop-window-theme', (event, theme) => {
    const record = sender(event);
    if (record && (theme === 'light' || theme === 'dark')) onTheme(record, theme);
  });
  ipcMain.on('desktop-window-menu', (event, x, y) => {
    const record = sender(event), px = coordinate(x), py = coordinate(y);
    if (record && px !== null && py !== null) openMenu(record, px, py);
  });
  return { sender };
}

module.exports = { createWindowBridge };
