'use strict';
// Integrated window frame: the OS title bar is hidden and native controls are drawn over a 40 px strip
// in MauzCode colours. Pure functions so platform/theme rules are testable without Electron.
// Colour values mirror frontend/src/styles/tokens.css (--sidebar, --text, --bg); window-chrome.test.ts keeps them in sync.

const TITLE_BAR_HEIGHT = 40;
const PALETTE = Object.freeze({
  light: Object.freeze({ strip: '#fafafa', symbol: '#161616', background: '#ffffff' }),
  dark: Object.freeze({ strip: '#1f1f1f', symbol: '#fdfdfd', background: '#191919' })
});
const THEMES = new Set(['light', 'dark']);

/** @param {unknown} value @returns {value is 'light'|'dark'} Whether the value is a resolved theme. */
const isTheme = value => typeof value === 'string' && THEMES.has(value);

/**
 * Resolve the theme a window should use now.
 * @param {unknown} stored Theme last reported by the server page for this origin ('light'|'dark'), or anything else when unknown.
 * @param {boolean} systemDark Whether the operating system currently prefers dark colours.
 * @returns {'light'|'dark'} The stored theme when known, otherwise the system appearance.
 */
function resolveTheme(stored, systemDark) { return isTheme(stored) ? stored : systemDark ? 'dark' : 'light'; }

/**
 * Title-bar overlay colours and height for Windows and Linux.
 * @param {string} platform process.platform.
 * @param {'light'|'dark'} theme Resolved theme.
 * @returns {{ color: string, symbolColor: string, height: number }} Value for BrowserWindow titleBarOverlay / setTitleBarOverlay.
 */
function overlayFor(theme, platform) {
  const p = PALETTE[resolveTheme(theme, false)];
  // Leave the CSS strip's 1px bottom border visible beneath the opaque Windows caption buttons.
  return { color: p.strip, symbolColor: p.symbol, height: platform === 'win32' ? TITLE_BAR_HEIGHT - 1 : TITLE_BAR_HEIGHT };
}

/**
 * BrowserWindow options that replace the OS title bar on every platform.
 * @param {{ platform: string, theme: 'light'|'dark' }} opts platform is process.platform; theme is the resolved theme.
 * @returns {object} Options to spread into the BrowserWindow constructor.
 */
function chromeOptions({ platform, theme }) {
  const resolved = resolveTheme(theme, false), background = PALETTE[resolved].background;
  if (platform === 'darwin') return { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 13 }, backgroundColor: background };
  // Windows and Linux: native caption buttons over our strip; the menu bar stays hidden (Alt must not reveal it).
  return { titleBarStyle: 'hidden', titleBarOverlay: overlayFor(resolved, platform), autoHideMenuBar: false, backgroundColor: background };
}

/**
 * Geometry the page needs to lay out its title strip around the native controls.
 * @param {string} platform process.platform.
 * @returns {{ height: number, controls: 'left'|'right' }} Strip height and the side occupied by native window controls.
 */
function titleBarInfo(platform) { return { height: TITLE_BAR_HEIGHT, controls: platform === 'darwin' ? 'left' : 'right' }; }

/**
 * Apply chrome that cannot be passed to the constructor and recolour it after a theme change.
 * @param {{ setMenuBarVisibility?: (v: boolean) => void, setTitleBarOverlay?: (o: object) => void, setBackgroundColor?: (c: string) => void }} win BrowserWindow.
 * @param {{ platform: string, theme: 'light'|'dark' }} opts platform is process.platform; theme is the resolved theme.
 * @returns {void}
 */
function applyChrome(win, { platform, theme }) {
  const resolved = resolveTheme(theme, false);
  win.setBackgroundColor?.(PALETTE[resolved].background);
  if (platform === 'darwin') return;
  win.setMenuBarVisibility?.(false);
  try { win.setTitleBarOverlay?.(overlayFor(resolved, platform)); } catch { /* A WM without overlay support keeps its own frame. */ }
}

/**
 * Minimal drag strip for server pages that do not render the desktop title strip themselves
 * (older servers, the sign-in page). The page opts out by adding the `mauzcode-desktop-frame` class to <html>.
 * @param {string} platform process.platform.
 * @returns {string} CSS for webContents.insertCSS.
 */
function fallbackCSS(platform) {
  const inset = platform === 'darwin' ? 'padding-left: 78px;' : 'padding-right: 140px;';
  return `html:not(.mauzcode-desktop-frame) { --app-height: calc(100dvh - ${TITLE_BAR_HEIGHT}px) !important; }
html:not(.mauzcode-desktop-frame) body { padding-top: ${TITLE_BAR_HEIGHT}px !important; box-sizing: border-box; }
html:not(.mauzcode-desktop-frame) body::before { content: ''; position: fixed; z-index: 2147483647; inset: 0 0 auto 0; height: ${TITLE_BAR_HEIGHT}px; ${inset} -webkit-app-region: drag; background: transparent; }`;
}

module.exports = { TITLE_BAR_HEIGHT, PALETTE, isTheme, resolveTheme, overlayFor, chromeOptions, titleBarInfo, applyChrome, fallbackCSS };
