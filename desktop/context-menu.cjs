'use strict';
// Native right-click menu. Pure template from Electron's context-menu params so the rules are testable without Electron.
const { webURL } = require('./security.cjs');

/**
 * Build the context menu template for one right-click.
 * @param {{ isEditable?: boolean, selectionText?: string, linkURL?: string, mediaType?: string, hasImageContents?: boolean, srcURL?: string,
 *   x?: number, y?: number, editFlags?: { canCut?: boolean, canCopy?: boolean, canPaste?: boolean, canSelectAll?: boolean } }} params
 *   Electron's context-menu params for the clicked point.
 * @param {{ links?: boolean, images?: boolean, copyText?: (text: string) => void, openLink?: (url: string) => void,
 *   copyImage?: (x: number, y: number) => void }} actions links/images enable those groups (off for the local settings window);
 *   copyText writes plain text to the clipboard; openLink opens an http(s) URL through the confirmed external-link flow;
 *   copyImage copies the image at the given point.
 * @returns {object[]} Menu template; empty when nothing applies, in which case no menu is shown.
 */
function contextTemplate(params, actions = {}) {
  const p = params || {}, flags = p.editFlags || {}, groups = [];
  const hasSelection = typeof p.selectionText === 'string' && p.selectionText.trim() !== '';
  const link = actions.links && p.linkURL ? webURL(p.linkURL) : null;
  if (link && typeof actions.openLink === 'function' && typeof actions.copyText === 'function') {
    const href = link.href;
    groups.push([
      { id: 'open-link', label: 'Открыть ссылку в браузере', click: () => actions.openLink(href) },
      { id: 'copy-link', label: 'Копировать адрес ссылки', click: () => actions.copyText(href) }
    ]);
  }
  if (actions.images && p.mediaType === 'image' && p.hasImageContents !== false && typeof actions.copyImage === 'function') {
    const x = Number.isFinite(p.x) ? p.x : 0, y = Number.isFinite(p.y) ? p.y : 0;
    groups.push([{ id: 'copy-image', label: 'Копировать изображение', click: () => actions.copyImage(x, y) }]);
  }
  if (p.isEditable) {
    groups.push([
      { id: 'cut', role: 'cut', label: 'Вырезать', enabled: !!flags.canCut },
      { id: 'copy', role: 'copy', label: 'Копировать', enabled: !!flags.canCopy },
      { id: 'paste', role: 'paste', label: 'Вставить', enabled: !!flags.canPaste },
      { type: 'separator' },
      { id: 'select-all', role: 'selectAll', label: 'Выделить всё', enabled: flags.canSelectAll !== false }
    ]);
  } else if (hasSelection) {
    groups.push([{ id: 'copy', role: 'copy', label: 'Копировать', enabled: flags.canCopy !== false }]);
  }
  return groups.flatMap((group, index) => index ? [{ type: 'separator' }, ...group] : group);
}

module.exports = { contextTemplate };
