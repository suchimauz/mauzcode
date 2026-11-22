'use strict';
// Native application menu for the desktop shell. Electron's Menu is injected so the template is testable without Electron.
// Labels here are the user-facing names documented in SETTINGS.md; keep both in sync.
function menuTemplate({ platform, settings, retry, back, reload }) {
  const call = fn => () => { try { const result = fn(); if (result && typeof result.catch === 'function') result.catch(error => console.error('Menu action failed:', error)); } catch (error) { console.error('Menu action failed:', error); } };
  return [
    ...(platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'Сервер', submenu: [
      { id: 'settings', label: 'Настройки…', accelerator: 'CmdOrCtrl+,', click: call(settings) },
      { id: 'retry', label: 'Повторить подключение', accelerator: 'CmdOrCtrl+R', click: call(retry) },
      { type: 'separator' },
      { id: 'quit', role: 'quit', label: 'Выйти' }
    ] },
    { label: 'Правка', submenu: [
      { role: 'undo', label: 'Отменить' }, { role: 'redo', label: 'Повторить' }, { type: 'separator' },
      { role: 'cut', label: 'Вырезать' }, { role: 'copy', label: 'Копировать' }, { role: 'paste', label: 'Вставить' },
      { role: 'selectAll', label: 'Выделить всё' }
    ] },
    { label: 'Вид', submenu: [
      { id: 'back', label: 'Назад', accelerator: platform === 'darwin' ? 'Cmd+[' : 'Alt+Left', click: call(back) },
      { id: 'reload', label: 'Обновить страницу', accelerator: 'CmdOrCtrl+Shift+R', click: call(reload) },
      { type: 'separator' },
      { role: 'resetZoom', label: 'Фактический размер' }, { role: 'zoomIn', label: 'Увеличить' }, { role: 'zoomOut', label: 'Уменьшить' },
      { type: 'separator' }, { role: 'togglefullscreen', label: 'Полный экран' }
    ] },
    { role: 'windowMenu', label: 'Окно' }
  ];
}

/**
 * Build the shell application menu.
 * @param {{ Menu: { buildFromTemplate(template: object[]): unknown }, platform: string, settings: () => unknown, retry: () => unknown,
 *   back: () => unknown, reload: () => unknown, quit?: () => unknown }} opts
 *   Menu is Electron's Menu (injected); settings opens the local settings window; retry re-checks the saved server;
 *   back navigates the chat window back; reload reloads the current server page; quit is an optional explicit-quit hook
 *   used instead of the built-in role so lifecycle can distinguish intentional quit from window close.
 * @returns {unknown} The built Menu.
 */
function buildShellMenu({ Menu, platform, settings, retry, back, reload, quit }) {
  for (const [name, fn] of Object.entries({ settings, retry, back, reload })) if (typeof fn !== 'function') throw new TypeError(`buildShellMenu: ${name} must be a function`);
  const template = menuTemplate({ platform, settings, retry, back, reload });
  if (typeof quit === 'function') {
    const server = template.find(item => item.label === 'Сервер');
    server.submenu = server.submenu.map(item => item.id === 'quit'
      ? { id: 'quit', label: 'Выйти', accelerator: 'CmdOrCtrl+Q', click: () => quit() } : item);
  }
  return Menu.buildFromTemplate(template);
}

/**
 * Build the shell popup opened by the ⋯ button in the title strip (Windows/Linux have no visible menu bar).
 * Shortcuts stay registered by the hidden application menu; here they are shown as hints only.
 * @param {{ Menu: { buildFromTemplate(template: object[]): unknown }, platform: string, settings: () => unknown, retry: () => unknown,
 *   back: () => unknown, reload: () => unknown, quit?: () => unknown }} opts Same handlers as buildShellMenu; quit falls back to the quit role.
 * @returns {unknown} The built Menu, ready for menu.popup({ window, x, y }).
 */
function buildShellPopup({ Menu, platform, settings, retry, back, reload, quit }) {
  for (const [name, fn] of Object.entries({ settings, retry, back, reload })) if (typeof fn !== 'function') throw new TypeError(`buildShellPopup: ${name} must be a function`);
  const items = menuTemplate({ platform, settings, retry, back, reload }).filter(top => top.submenu)
    .flatMap(top => top.submenu).filter(item => item.id || item.role);
  const pick = key => ({ ...items.find(item => item.id === key || item.role === key), registerAccelerator: false });
  const template = [
    pick('settings'), pick('retry'), { type: 'separator' },
    pick('back'), pick('reload'), { type: 'separator' },
    { id: 'zoom', label: 'Масштаб', submenu: [pick('resetZoom'), pick('zoomIn'), pick('zoomOut')] },
    pick('togglefullscreen'), { type: 'separator' },
    typeof quit === 'function' ? { id: 'quit', label: 'Выйти', accelerator: 'CmdOrCtrl+Q', registerAccelerator: false, click: () => quit() } : pick('quit')
  ];
  return Menu.buildFromTemplate(template);
}

module.exports = { buildShellMenu, buildShellPopup, menuTemplate };
