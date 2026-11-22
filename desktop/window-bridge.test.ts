import { describe, expect, test } from 'bun:test';
const { createWindowBridge } = require('./window-bridge.cjs');

function setup() {
  const handlers: Record<string, Function> = {}, calls: any[] = [];
  const mainFrame = { url: 'https://chat.example/a/1' };
  const wc = { mainFrame, getURL: () => 'https://chat.example/a/1' };
  const record = { window: { isDestroyed: () => false, webContents: wc }, origin: 'https://chat.example' };
  let current: any = record;
  createWindowBridge({ ipcMain: { on: (c: string, fn: Function) => { handlers[c] = fn; } }, getActive: () => current,
    onTheme: (_r: any, t: string) => calls.push(['theme', t]), openMenu: (_r: any, x: number, y: number) => calls.push(['menu', x, y]) });
  const top = { sender: wc, senderFrame: mainFrame };
  return { handlers, calls, wc, top, setActive: (r: any) => { current = r; } };
}

describe('window bridge boundary', () => {
  test('the active top frame can report a theme and open the shell menu', () => {
    const b = setup();
    b.handlers['desktop-window-theme'](b.top, 'dark');
    b.handlers['desktop-window-menu'](b.top, 12.4, 30);
    expect(b.calls).toEqual([['theme', 'dark'], ['menu', 12, 30]]);
  });
  test('child frames, foreign origins, other windows and no active chat are ignored', () => {
    const b = setup();
    b.handlers['desktop-window-theme']({ sender: b.wc, senderFrame: { url: 'https://chat.example/frame' } }, 'dark');
    b.handlers['desktop-window-theme']({ sender: b.wc, senderFrame: { ...b.wc.mainFrame, url: 'https://evil.example/' } }, 'dark');
    b.handlers['desktop-window-menu']({ sender: {}, senderFrame: b.wc.mainFrame }, 1, 1);
    b.wc.mainFrame.url = 'https://evil.example/'; b.handlers['desktop-window-menu'](b.top, 1, 1); b.wc.mainFrame.url = 'https://chat.example/a/1';
    b.setActive(null); b.handlers['desktop-window-theme'](b.top, 'dark');
    expect(b.calls).toEqual([]);
  });
  test('invalid arguments are ignored', () => {
    const b = setup();
    for (const theme of ['system', 'DARK', '', null, { toString: () => 'dark' }]) b.handlers['desktop-window-theme'](b.top, theme);
    for (const [x, y] of [[-1, 0], [NaN, 0], [0, Infinity], ['1', 2], [1e9, 1]]) b.handlers['desktop-window-menu'](b.top, x, y);
    expect(b.calls).toEqual([]);
  });
});
