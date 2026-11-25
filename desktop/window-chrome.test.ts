import { describe, expect, test } from 'bun:test';
const { chromeOptions, applyChrome, resolveTheme, titleBarInfo, fallbackCSS, PALETTE } = require('./window-chrome.cjs');

const tokens = await Bun.file(new URL('../frontend/src/styles/tokens.css', import.meta.url)).text();
const block = (selector: string) => tokens.slice(tokens.indexOf(selector), tokens.indexOf('}', tokens.indexOf(selector)));
const token = (css: string, name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1].toLowerCase();

describe('integrated window frame', () => {
  test('macOS uses inset traffic lights; Windows and Linux overlay native controls on a themed 40 px strip', () => {
    for (const theme of ['light', 'dark'] as const) {
      expect(chromeOptions({ platform: 'darwin', theme })).toEqual({ titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 13 }, backgroundColor: PALETTE[theme].background });
      for (const platform of ['win32', 'linux']) {
        expect(chromeOptions({ platform, theme })).toEqual({ titleBarStyle: 'hidden', autoHideMenuBar: false, backgroundColor: PALETTE[theme].background,
          titleBarOverlay: { color: PALETTE[theme].strip, symbolColor: PALETTE[theme].symbol, height: platform === 'win32' ? 39 : 40 } });
        const heights: number[] = [];
        applyChrome({ setTitleBarOverlay: ({ height }: { height: number }) => heights.push(height) }, { platform, theme });
        expect(heights).toEqual([platform === 'win32' ? 39 : 40]);
      }
    }
    expect(titleBarInfo('darwin')).toEqual({ height: 40, controls: 'left' });
    expect(titleBarInfo('win32')).toEqual({ height: 40, controls: 'right' });
  });
  test('stored server theme wins over the system appearance; unknown values fall back', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('<script>', true)).toBe('dark');
  });
  test('applyChrome hides the menu bar and recolours controls only off macOS; overlay errors are contained', () => {
    const calls: string[] = [];
    const win = { setBackgroundColor: (c: string) => calls.push('bg ' + c), setMenuBarVisibility: (v: boolean) => calls.push('menu ' + v),
      setTitleBarOverlay: (o: any) => { calls.push('overlay ' + o.color); throw new Error('unsupported WM'); } };
    expect(() => applyChrome(win, { platform: 'linux', theme: 'dark' })).not.toThrow();
    expect(calls).toEqual(['bg #191919', 'menu false', 'overlay #1f1f1f']);
    calls.length = 0; applyChrome(win, { platform: 'darwin', theme: 'light' });
    expect(calls).toEqual(['bg #ffffff']);
  });
  test('fallback strip is opt-out for pages that draw their own title strip', () => {
    const css = fallbackCSS('win32');
    expect(css).toContain('html:not(.mauzcode-desktop-frame)'); expect(css).toContain('-webkit-app-region: drag'); expect(css).toContain('padding-right: 140px');
    expect(fallbackCSS('darwin')).toContain('padding-left: 78px');
  });
  test('palette matches the product tokens', () => {
    const light = block(":root, [data-theme='light']"), dark = block("[data-theme='dark']");
    expect(PALETTE.light).toEqual({ strip: token(light, 'sidebar'), symbol: token(light, 'text'), background: token(light, 'bg') });
    expect(PALETTE.dark).toEqual({ strip: token(dark, 'sidebar'), symbol: token(dark, 'text'), background: token(dark, 'bg') });
  });
});
