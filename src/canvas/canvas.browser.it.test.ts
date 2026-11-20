// Real Chrome regression for React surfaces, with an isolated allowlisted fixture server.
// No mkTestCtx, DB, real auth, messages, approval endpoints, or developer browser.
// Chrome runs from the pinned Docker image (test/chrome/headless.ts): without Docker the suite is skipped.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { browserTestsEnabled, startHeadlessChrome, type HeadlessChrome } from '../../test/chrome/headless';
import { resolve } from 'node:path';

let chrome: HeadlessChrome | null;
let server: ReturnType<typeof Bun.serve>;
let assets = new Map<string, Blob>();
const unexpected: string[] = [];
const saves: { body: any; csrf: string | null }[] = [];
let content = 'original fixture text';
let activeItemId = 1;
const enabled = await browserTestsEnabled();
describe.skipIf(!enabled)('React surfaces in Chrome', () => {
beforeAll(async () => {
  const build = await Bun.build({ entrypoints: [resolve(import.meta.dir, '../../test/chrome/react-surfaces.fixture.tsx')], target: 'browser', minify: false, tsconfig: resolve(import.meta.dir, '../../frontend/tsconfig.json'), loader: { '.woff2': 'file' } });
  if (!build.success) throw new Error(build.logs.join('\n'));
  assets = new Map(build.outputs.map(output => ['/' + output.path.split('/').pop(), output]));
  const js = [...assets.keys()].find(path => path.endsWith('.js'))!;
  const css = [...assets.keys()].filter(path => path.endsWith('.css')).map(path => `<link rel="stylesheet" href="${path}">`).join('');
  server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(req) {
    const url = new URL(req.url), path = url.pathname;
    const json = (value: unknown) => Response.json(value);
    if (req.method === 'GET' && path === '/') return new Response(`<!doctype html><html><head>${css}</head><body><div id="root"></div><script type="module" src="${js}"></script></body></html>`, { headers: { 'Content-Type': 'text/html', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self'; img-src 'self' data:; font-src 'self'" } });
    if (req.method === 'GET' && assets.has(path)) return new Response(assets.get(path));
    if (path === '/favicon.ico') return new Response(null, { status: 204 });
    if (req.method === 'GET' && path === '/nav/items') return json({ items: [
      { id: 'fixture', label: 'Fixture application', href: '/fixture-document', group: 'Tests' },
      { id: 'shell', label: 'Forbidden shell', href: '/' }, { id: 'bank', label: 'Forbidden bank', href: '/tbank' },
      { id: 'external', label: 'Forbidden external', href: 'https://example.com' },
    ] });
    if (req.method === 'GET' && path === '/fixture-document') return new Response('<!doctype html><html><body><h1>Isolated application document</h1></body></html>', { headers: { 'Content-Type': 'text/html' } });
    if (req.method === 'GET' && path === '/auth/online') return json({ onlineIds: ['fixture-owner'] });
    if (req.method === 'GET' && path === '/auth/users') return json({ meId: 'fixture-owner', csrfToken: 'fixture-csrf', google: null, users: [{ id: 'fixture-owner', name: 'Fixture Owner', email: 'owner@example.invalid', role: 'owner', disabledAt: null, hasPassword: false, providers: [] }] });
    if (req.method === 'GET' && path === '/canvas/fixture/state') return json({ csrfToken: 'fixture-csrf', items: [1, 2].map(id => ({ id, title: `Fixture ${id}`, icon: 'file-text', active: id === activeItemId, kind: 'file', args: { path: `/fixture/${id}.txt` } })) });
    if (req.method === 'POST' && path === '/canvas/fixture') {
      const body = await req.json() as {activeItemId: number};
      if ([1, 2].includes(body.activeItemId) && Object.keys(body).length === 1) { activeItemId = body.activeItemId; return json({ activeItemId }); }
    }
    if (req.method === 'POST' && /^\/canvas\/fixture\/item\/[12]$/.test(path)) {
      const body = await req.json() as {fileAction: string; content: string};
      // Respond with the item's file path, as the real endpoint does, not the request URL.
      const file = `/fixture/${path.slice(-1)}.txt`;
      if (body.fileAction === 'read') return json({ path: file, content: path.endsWith('/1') ? content : 'second file' });
      if (body.fileAction === 'save' && path.endsWith('/1')) {
        saves.push({ body, csrf: req.headers.get('x-csrf-token') }); content = body.content;
        return json({ path: file, content });
      }
    }
    unexpected.push(`${req.method} ${path}`);
    return new Response('Fixture route not allowlisted', { status: 404 });
  } });
  chrome = await startHeadlessChrome();
  if (!chrome) throw new Error('test Chrome container did not start (see test/chrome/headless.ts)');
}, 30_000);
afterAll(async () => { server?.stop(true); await chrome?.stop(); });

async function open(surface: string) {
  const target = await (await fetch(`${chrome!.url}/json/new?${encodeURIComponent(`http://127.0.0.1:${server.port}/?surface=${surface}`)}`, { method: 'PUT' })).json() as any;
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0;
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  ws.onmessage = event => {
    const message = JSON.parse(String(event.data)); const task = pending.get(message.id); if (!task) return;
    clearTimeout(task.timer); pending.delete(message.id);
    if (message.error || message.result?.exceptionDetails) task.reject(new Error(JSON.stringify(message)));
    else task.resolve(message.result);
  };
  const command = (method: string, params: object = {}) => new Promise<any>((resolve, reject) => {
    const ticket = ++id; const timer = setTimeout(() => { pending.delete(ticket); reject(new Error(`CDP timeout: ${method}`)); }, 5000);
    pending.set(ticket, { resolve, reject, timer }); ws.send(JSON.stringify({ id: ticket, method, params }));
  });
  const evaluate = async (expression: string) => (await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;
  // A condition may throw while the page is still parsing (no body yet): that counts as not yet true.
  const wait = async (expression: string) => { for (let i = 0; i < 100; i++) { if (await evaluate(`(() => { try { return !!(${expression}); } catch { return false; } })()`)) return; await Bun.sleep(50); } throw new Error(`DOM condition timed out: ${expression}; ${await evaluate('document.body.innerText')}`); };
  return { evaluate, wait, command, close: async () => { for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('Tab closed')); } pending.clear(); ws.close(); await fetch(`${chrome!.url}/json/close/${target.id}`); } };
}
const click = (text: string) => `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`;

test('React Applications filters unsafe/native destinations and opens a themed fixture document', async () => {
  const tab = await open('applications');
  try {
    await tab.wait(`document.body.textContent.includes('Fixture application')`);
    expect(await tab.evaluate(`document.body.textContent.includes('Forbidden')`)).toBe(false);
    await tab.evaluate(click('Fixture applicationTests'));
    await tab.wait(`document.querySelector('iframe')?.contentDocument?.body.textContent.includes('Isolated application document')`);
    expect(await tab.evaluate(`document.querySelector('iframe').contentDocument.documentElement.dataset.theme`)).toBe('dark');
    await tab.evaluate(click('Все приложения'));
    await tab.wait(`!!document.querySelector('input[type=search]')`);
    expect(await tab.evaluate(`document.querySelectorAll('[role=alert]').length`)).toBe(0);
    expect(unexpected).toEqual([]);
  } finally { await tab.close(); }
}, 20_000);

test('React Canvas retains unsaved draft across tabs and sends exact optimistic save with CSRF', async () => {
  const tab = await open('canvas');
  try {
    // The file editor is CodeMirror: type through real input events, as a person would.
    await tab.wait(`document.querySelector('.cm-content')?.textContent === 'original fixture text'`);
    await tab.evaluate(`window.fixtureEditor=document.querySelector('.cm-editor'); window.fixtureEditor.querySelector('.cm-content').focus()`);
    await tab.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
    await tab.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
    await tab.command('Input.insertText', { text: 'edited fixture text' });
    await tab.wait(`window.fixtureEditor.querySelector('.cm-content').textContent === 'edited fixture text'`);
    await tab.wait(`document.body.textContent.includes('Сохранить *')`);
    await tab.evaluate(click('Fixture 2'));
    await tab.wait(`document.querySelector('[data-tab-key="item-2"] [role=tab]').getAttribute('aria-selected')==='true'`);
    await tab.wait(`document.querySelectorAll('.cm-editor').length === 2`);
    await tab.evaluate(click('Fixture 1'));
    await tab.wait(`document.querySelector('[data-tab-key="item-1"] [role=tab]').getAttribute('aria-selected')==='true'`);
    expect(await tab.evaluate(`document.querySelector('.canvas-content:not([hidden]) .cm-editor')===window.fixtureEditor && window.fixtureEditor.querySelector('.cm-content').textContent==='edited fixture text'`)).toBe(true);
    await tab.evaluate(`document.querySelector('.canvas-content:not([hidden]) .cf-save').click()`);
    await tab.wait(`document.querySelector('.canvas-content:not([hidden]) .cf-save').disabled && !document.body.textContent.includes('Сохранить *')`);
    expect(saves).toEqual([{ body: { fileAction: 'save', content: 'edited fixture text', expectedContent: 'original fixture text' }, csrf: 'fixture-csrf' }]);
    expect(await tab.evaluate(`document.querySelectorAll('[role=alert]').length`)).toBe(0);
    if (process.env.REACT_BROWSER_SCREENSHOT) { const image = await tab.command('Page.captureScreenshot', { format: 'png' }); await Bun.write(process.env.REACT_BROWSER_SCREENSHOT, Buffer.from(image.data, 'base64')); }
    expect(unexpected).toEqual([]);
  } finally { await tab.close(); }
}, 20_000);

test('React People renders isolated owner account without issuing mutations', async () => {
  const tab = await open('people');
  try {
    await tab.wait(`document.querySelector('table')?.textContent.includes('Fixture Owner')`);
    expect(await tab.evaluate(`document.querySelector('table').textContent.includes('You')`)).toBe(true);
    expect(await tab.evaluate(`document.querySelectorAll('[role=alert]').length`)).toBe(0);
    expect(unexpected).toEqual([]);
  } finally { await tab.close(); }
}, 20_000);
});
