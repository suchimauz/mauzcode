import { describe, expect, test } from 'bun:test';
const { contextTemplate } = require('./context-menu.cjs');

const calls: string[] = [];
const actions = { links: true, images: true, copyText: (t: string) => calls.push('copy ' + t), openLink: (u: string) => calls.push('open ' + u), copyImage: (x: number, y: number) => calls.push(`image ${x},${y}`) };
const ids = (template: any[]) => template.map(item => item.id || item.type);

describe('native context menu', () => {
  test('selected chat text offers Copy only', () => {
    expect(ids(contextTemplate({ selectionText: 'hello', editFlags: { canCopy: true } }, actions))).toEqual(['copy']);
    expect(contextTemplate({ selectionText: 'hello', editFlags: { canCopy: true } }, actions)[0]).toMatchObject({ role: 'copy', label: 'Копировать', enabled: true });
  });
  test('editable fields offer cut/copy/paste/select all according to edit flags', () => {
    const t = contextTemplate({ isEditable: true, editFlags: { canCut: false, canCopy: false, canPaste: true, canSelectAll: true } }, actions);
    expect(ids(t)).toEqual(['cut', 'copy', 'paste', 'separator', 'select-all']);
    expect(t.filter((i: any) => i.role).map((i: any) => [i.role, i.enabled])).toEqual([['cut', false], ['copy', false], ['paste', true], ['selectAll', true]]);
  });
  test('http(s) links offer open and copy address; actions receive the normalised URL', () => {
    calls.length = 0;
    const t = contextTemplate({ linkURL: 'https://example.com/a b', selectionText: 'x', editFlags: { canCopy: true } }, actions);
    expect(ids(t)).toEqual(['open-link', 'copy-link', 'separator', 'copy']);
    t[0].click(); t[1].click();
    expect(calls).toEqual(['open https://example.com/a%20b', 'copy https://example.com/a%20b']);
  });
  test('non-web links, credentials and disabled groups give no link items', () => {
    for (const linkURL of ['javascript:alert(1)', 'file:///etc/passwd', 'mailto:a@b.c', 'https://user:pw@example.com/']) expect(contextTemplate({ linkURL }, actions)).toEqual([]);
    expect(contextTemplate({ linkURL: 'https://example.com/' }, {})).toEqual([]);
  });
  test('images offer copy image at the clicked point', () => {
    calls.length = 0;
    const t = contextTemplate({ mediaType: 'image', hasImageContents: true, x: 10, y: 20 }, actions);
    expect(ids(t)).toEqual(['copy-image']); t[0].click(); expect(calls).toEqual(['image 10,20']);
    expect(contextTemplate({ mediaType: 'image', x: 1, y: 1 }, { ...actions, images: false })).toEqual([]);
  });
  test('nothing applicable means no menu', () => {
    expect(contextTemplate({}, actions)).toEqual([]);
    expect(contextTemplate({ selectionText: '   ' }, actions)).toEqual([]);
    expect(contextTemplate(undefined)).toEqual([]);
  });
});
