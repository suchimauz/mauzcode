import { describe, expect, test } from 'bun:test';
const { buildShellMenu } = require('./shell-menu.cjs');

const Menu = { buildFromTemplate: (template: any[]) => ({ template }) };
function build(platform = 'linux', quit?: () => void) {
  const calls: string[] = [];
  const fn = (name: string) => () => { calls.push(name); };
  const menu: any = buildShellMenu({ Menu, platform, settings: fn('settings'), retry: fn('retry'), back: fn('back'), reload: fn('reload'), quit });
  const items = menu.template.flatMap((top: any) => (top.submenu || []).map((item: any) => ({ ...item, top: top.label })));
  return { menu, calls, item: (id: string) => items.find((item: any) => item.id === id) };
}

describe('desktop shell menu', () => {
  test('exposes settings, retry, back and reload with keyboard accelerators', () => {
    const { calls, item } = build();
    for (const id of ['settings', 'retry', 'back', 'reload']) { expect(item(id).accelerator).toBeTruthy(); item(id).click(); }
    expect(calls).toEqual(['settings', 'retry', 'back', 'reload']);
    expect(item('settings')).toMatchObject({ top: 'Сервер', label: 'Настройки…', accelerator: 'CmdOrCtrl+,' });
    expect(item('retry').label).toBe('Повторить подключение');
    expect(item('back')).toMatchObject({ top: 'Вид', label: 'Назад', accelerator: 'Alt+Left' });
  });
  test('macOS gets the app menu and Cmd+[ for back', () => {
    const mac = build('darwin');
    expect(mac.menu.template[0]).toEqual({ role: 'appMenu' });
    expect(mac.item('back').accelerator).toBe('Cmd+[');
    expect(build('win32').menu.template[0].label).toBe('Сервер');
  });
  test('quit uses the role by default and the injected explicit-quit hook when given', () => {
    expect(build().item('quit')).toMatchObject({ role: 'quit', label: 'Выйти' });
    let quits = 0;
    const custom = build('linux', () => { quits++; }).item('quit');
    expect(custom.role).toBeUndefined(); custom.click(); expect(quits).toBe(1);
  });
  test('a failing action is contained and missing handlers are rejected', async () => {
    const menu: any = buildShellMenu({ Menu, platform: 'linux', settings: () => { throw new Error('x'); }, retry: () => Promise.reject(new Error('y')), back() {}, reload() {} });
    const original = console.error; console.error = () => {};
    try {
      expect(() => menu.template[0].submenu[0].click()).not.toThrow();
      expect(() => menu.template[0].submenu[1].click()).not.toThrow();
      await new Promise(resolve => setTimeout(resolve, 0));
    } finally { console.error = original; }
    expect(() => buildShellMenu({ Menu, platform: 'linux', settings() {}, retry() {}, back() {} })).toThrow(/reload/);
  });
});

describe('title-strip shell popup', () => {
  const { buildShellPopup } = require('./shell-menu.cjs');
  test('offers settings, retry, back, reload, zoom, fullscreen and quit without registering duplicate accelerators', () => {
    const calls: string[] = [];
    const fn = (name: string) => () => { calls.push(name); };
    const menu: any = buildShellPopup({ Menu, platform: 'win32', settings: fn('settings'), retry: fn('retry'), back: fn('back'), reload: fn('reload'), quit: fn('quit') });
    const flat = menu.template.flatMap((item: any) => item.submenu ? [item, ...item.submenu] : [item]).filter((item: any) => item.type !== 'separator');
    expect(flat.map((item: any) => item.id || item.role)).toEqual(['settings', 'retry', 'back', 'reload', 'zoom', 'resetZoom', 'zoomIn', 'zoomOut', 'togglefullscreen', 'quit']);
    expect(flat.filter((item: any) => item.id !== 'zoom').every((item: any) => item.registerAccelerator === false)).toBe(true);
    for (const id of ['settings', 'retry', 'back', 'reload', 'quit']) flat.find((item: any) => item.id === id).click();
    expect(calls).toEqual(['settings', 'retry', 'back', 'reload', 'quit']);
    expect(flat.find((item: any) => item.id === 'settings').accelerator).toBe('CmdOrCtrl+,');
  });
  test('falls back to the quit role and rejects missing handlers', () => {
    const menu: any = buildShellPopup({ Menu, platform: 'linux', settings() {}, retry() {}, back() {}, reload() {} });
    expect(menu.template.at(-1)).toMatchObject({ role: 'quit' });
    expect(() => buildShellPopup({ Menu, platform: 'linux', settings() {}, retry() {}, back() {} })).toThrow();
  });
});
