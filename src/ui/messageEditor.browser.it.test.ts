// Real Chrome regression for the chat message editor: line breaks, the painted caret and clearing.
// Layout and native editing cannot be reproduced in jsdom. No DB, auth, runtime or developer browser.
// Chrome runs from the pinned Docker image (test/chrome/headless.ts): without Docker the suite is skipped.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { browserTestsEnabled, startHeadlessChrome, type HeadlessChrome } from '../../test/chrome/headless';

const enabled = await browserTestsEnabled();
let chrome: HeadlessChrome | null;
let server: ReturnType<typeof Bun.serve>;
describe.skipIf(!enabled)('Message editor in Chrome', () => {
beforeAll(async () => {
  chrome = await startHeadlessChrome();
  if (!chrome) throw new Error('test Chrome container did not start (see test/chrome/headless.ts)');
  const build = await Bun.build({ entrypoints: [resolve(import.meta.dir, '../../test/chrome/message-editor.fixture.tsx')], target: 'browser', minify: false, tsconfig: resolve(import.meta.dir, '../../frontend/tsconfig.json'), loader: { '.woff2': 'file' } });
  if (!build.success) throw new Error(build.logs.join('\n'));
  const assets = new Map(build.outputs.map(output => ['/' + output.path.split('/').pop(), output]));
  const js = [...assets.keys()].find(path => path.endsWith('.js'))!;
  const css = [...assets.keys()].filter(path => path.endsWith('.css')).map(path => `<link rel="stylesheet" href="${path}">`).join('');
  server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === '/') return new Response(`<!doctype html><html><head><meta charset="utf-8">${css}</head><body><div id="root"></div><script type="module" src="${js}"></script></body></html>`, { headers: { 'Content-Type': 'text/html' } });
    if (assets.has(path)) return new Response(assets.get(path));
    return new Response(null, { status: 404 });
  } });
}, 60_000);
afterAll(async () => { server?.stop(true); await chrome?.stop(); });

async function open(query = '', touch = false) {
  const target = await (await fetch(`${chrome!.url}/json/new?about:blank`, { method: 'PUT' })).json() as any;
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((ok, fail) => { ws.onopen = () => ok(); ws.onerror = () => fail(new Error('CDP attach failed')); });
  let id = 0; const pending = new Map<number, (message: any) => void>();
  ws.onmessage = ({ data }) => { const message = JSON.parse(String(data)); pending.get(message.id)?.(message); pending.delete(message.id); };
  const command = (method: string, params: object = {}) => new Promise<any>((ok, fail) => {
    const ticket = ++id; const timer = setTimeout(() => fail(new Error(`CDP timeout: ${method}`)), 5000);
    pending.set(ticket, message => { clearTimeout(timer); if (message.error) fail(new Error(JSON.stringify(message.error))); else ok(message.result); });
    ws.send(JSON.stringify({ id: ticket, method, params }));
  });
  const evaluate = async (expression: string) => (await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;
  const wait = async (expression: string) => { for (let i = 0; i < 100; i++) { if (await evaluate(`(() => { try { return !!(${expression}); } catch { return false; } })()`)) return; await Bun.sleep(30); } throw new Error(`Condition timed out: ${expression}`); };
  const key = async (key: string, code: string, modifiers = 0, keyCode = 0, text?: string) => {
    await command('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key, code, modifiers, windowsVirtualKeyCode: keyCode, text });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers, windowsVirtualKeyCode: keyCode });
  };
  // The caret glides with an 80 ms transition; reduced motion makes its measured box the final position.
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, ...(touch ? [{ name: 'pointer', value: 'coarse' }, { name: 'any-pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] : [])] });
  if (touch) await command('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await command('Page.navigate', { url: `http://127.0.0.1:${server.port}/${query}` });
  await wait(`document.querySelector('[role=textbox]')`);
  await evaluate(`document.querySelector('[role=textbox]').focus()`);
  return { command, evaluate, wait, key, type: (text: string) => command('Input.insertText', { text }), close: async () => { ws.close(); await fetch(`${chrome!.url}/json/close/${target.id}`); } };
}
type Tab = Awaited<ReturnType<typeof open>>;
const value = (tab: Tab) => tab.evaluate(`JSON.parse(document.querySelector('[data-testid=value]').textContent)`);

// Waits two frames so the caret overlay measured after layout, then returns its line (0-based) and the editor height.
const caretLine = (tab: Tab) => tab.evaluate(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => {
  const editor = document.querySelector('[role=textbox]'), caret = document.querySelector('.input-caret');
  const e = editor.getBoundingClientRect(), c = caret.getBoundingClientRect();
  r({ visible: getComputedStyle(caret).visibility === 'visible', line: Math.floor((c.top + c.height / 2 - e.top) / 24), height: Math.round(e.height) });
})))`);

test('Shift+Enter moves the visible caret to the new line at once (end, empty, middle)', async () => {
  const tab = await open();
  try {
    await tab.type('hello');
    await tab.key('Enter', 'Enter', 8, 13);
    expect(await value(tab)).toBe('hello\n');
    expect(await caretLine(tab)).toEqual({ visible: true, line: 1, height: 48 });
    // Middle: put the caret between "hello" and "world".
    await tab.type('world');
    await tab.evaluate(`(() => { const el = document.querySelector('[role=textbox]'); const r = document.createRange(); r.setStart(el.firstChild, 6); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); })()`);
    await tab.key('Backspace', 'Backspace', 0, 8);
    expect(await value(tab)).toBe('helloworld');
    await tab.key('Enter', 'Enter', 8, 13);
    expect(await value(tab)).toBe('hello\nworld');
    expect(await caretLine(tab)).toMatchObject({ visible: true, line: 1 });
  } finally { await tab.close(); }
}, 20_000);

test('Shift+Enter in an empty draft shows the caret on the second line', async () => {
  const tab = await open();
  try {
    await tab.key('Enter', 'Enter', 8, 13);
    expect(await value(tab)).toBe('\n');
    expect(await caretLine(tab)).toEqual({ visible: true, line: 1, height: 48 });
  } finally { await tab.close(); }
}, 20_000);

test('a native insertParagraph (touch keyboard) adds one newline with a visible caret', async () => {
  const tab = await open();
  try {
    await tab.type('hi');
    // What a touch keyboard does: keyCode 229 keydown, then the editing command.
    await tab.command('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Unidentified', windowsVirtualKeyCode: 229 });
    await tab.evaluate(`document.execCommand('insertParagraph')`);
    expect(await value(tab)).toBe('hi\n');
    expect(await tab.evaluate(`document.querySelector('[role=textbox] div') === null`)).toBe(true);
    expect(await caretLine(tab)).toEqual({ visible: true, line: 1, height: 48 });
  } finally { await tab.close(); }
}, 20_000);

test('a click on empty space in the input bar focuses the editor; a right click or a control does not', async () => {
  const tab = await open();
  try {
    const point = async (selector: string) => tab.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const click = async (selector: string, button: 'left' | 'right' = 'left') => {
      const { x, y } = await point(selector);
      for (const type of ['mousePressed', 'mouseReleased']) await tab.command('Input.dispatchMouseEvent', { type, x, y, button, clickCount: 1 });
    };
    const focused = () => tab.evaluate(`document.activeElement?.getAttribute('role') === 'textbox'`);
    await tab.type('draft');
    await tab.evaluate(`document.activeElement.blur()`);
    await click('.composer-inbar-spacer', 'right');
    expect(await focused()).toBe(false);
    await click('[data-testid=model]');
    expect(await focused()).toBe(false);
    await click('.composer-inbar-spacer');
    expect(await focused()).toBe(true);
    // The caret goes to the end of the draft, and typing continues there.
    await tab.type('!');
    expect(await value(tab)).toBe('draft!');
  } finally { await tab.close(); }
}, 20_000);

for (const initial of ['hello\nworld', 'abc\n']) test(`select-all + delete leaves an empty one-line draft: ${JSON.stringify(initial)}`, async () => {
  const tab = await open();
  try {
    const [first, second] = initial.split('\n');
    await tab.type(first!); await tab.key('Enter', 'Enter', 8, 13); if (second) await tab.type(second);
    expect(await value(tab)).toBe(initial);
    await tab.key('a', 'KeyA', 2, 65); // Ctrl+A
    await tab.key('Backspace', 'Backspace', 0, 8);
    expect(await value(tab)).toBe('');
    expect(await tab.evaluate(`document.querySelector('[role=textbox]').dataset.empty`)).toBe('true');
    expect(await tab.evaluate(`Math.round(document.querySelector('[role=textbox]').getBoundingClientRect().height)`)).toBe(24);
    expect(await tab.evaluate(`getComputedStyle(document.querySelector('[role=textbox]'), '::before').content`)).toContain('Напишите');
  } finally { await tab.close(); }
}, 20_000);

for (const width of [680, 375, 320]) for (const touch of [false, true]) test(`input frame at ${width}px${touch ? ' (touch)' : ''}: first-line add button, one bar line, no overlap or sideways scroll`, async () => {
  const tab = await open(`?layout=${width}`, touch);
  try {
    const layout = await tab.evaluate(`new Promise(r => requestAnimationFrame(() => {
      const box = s => document.querySelector(s).getBoundingClientRect();
      const editor = box('[role=textbox]'), add = box('.composer-add'), bar = box('.composer-inbar'), form = box('form.message-input');
      const range = document.createRange(); const text = document.querySelector('[role=textbox]').firstChild;
      range.setStart(text, 0); range.setEnd(text, text.length); const lines = [...range.getClientRects()];
      const first = lines[0], last = lines[lines.length - 1];
      const items = [...document.querySelectorAll('.composer-inbar > *:not(.composer-inbar-spacer), .composer-inbar .voice-entry')].map(e => e.getBoundingClientRect());
      const overlap = items.some((a, i) => items.some((b, j) => j > i && !(a.right <= b.left + .5 || b.right <= a.left + .5 || a.bottom <= b.top + .5 || b.bottom <= a.top + .5) && !(a.left <= b.left && a.right >= b.right)));
      const row = document.querySelector('.composer-metrics-row');
      const targets = [...document.querySelectorAll('.composer-inbar button, .composer-add')].map(e => e.getBoundingClientRect()).map(r => Math.min(r.width, r.height));
      r({ addFirstLine: Math.abs((add.top + add.height / 2) - (first.top + first.height / 2)) < 12, textAfterAdd: first.left >= add.right - 4, wrappedUnderAdd: last.left < add.right - 4, lines: new Set(lines.map(l => Math.round(l.top))).size,
        barOneLine: items.every(i => Math.abs((i.top + i.height / 2) - (bar.top + bar.height / 2)) < 2), barInside: bar.left >= form.left && bar.right <= form.right + .5 && bar.bottom <= form.bottom,
        overlap, rowScroll: row.scrollWidth > row.clientWidth + 1, pageScroll: document.documentElement.scrollWidth > innerWidth,
        rowOneLine: [...row.children].every(c => Math.round(c.getBoundingClientRect().height) <= ${touch ? 44 : 24}), cache: getComputedStyle(document.querySelector('.composer-cache-hit')).display !== 'none',
        minTarget: Math.min(...targets), coarse: matchMedia('(pointer: coarse)').matches, small: [...document.querySelectorAll('.composer-inbar button, .composer-add')].filter(e => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height) < 44; }).map(e => e.className + ':' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)) });
    }))`);
    expect(layout).toMatchObject({ addFirstLine: true, textAfterAdd: true, wrappedUnderAdd: true, barOneLine: true, barInside: true, overlap: false, rowScroll: false, pageScroll: false, rowOneLine: true, cache: true });
    expect(layout.lines).toBeGreaterThan(1);
    if (touch) expect(layout.small).toEqual([]);
  } finally { await tab.close(); }
}, 20_000);
});
