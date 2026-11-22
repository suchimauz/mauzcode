import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// DOM-level checks of the local settings window (happy-dom). This is not an Electron/GUI run.
const { Window } = require('happy-dom');

const html = readFileSync(join(__dirname, 'index.html'), 'utf8');
const script = readFileSync(join(__dirname, 'renderer.js'), 'utf8');
const preloadSource = readFileSync(join(__dirname, 'preload.cjs'), 'utf8');
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

async function mount(initial: any = {}, responses: Record<string, any> = {}) {
  const window = new Window({ url: 'file:///app/index.html' });
  const document = window.document;
  document.write(html.replace(/<script[^>]*><\/script>/, ''));
  const calls: any[] = [];
  let listener: (state: any) => void = () => {};
  window.desktopSetup = {
    getState: async () => initial,
    connect: async (url: string, options: any) => { calls.push(['connect', url, options]); return responses.connect || { ok: true }; },
    action: async (name: string) => { calls.push(['action', name]); return responses[name] || { ok: true }; },
    onState: (fn: any) => { listener = fn; }
  };
  window.eval(script);
  await flush();
  const $ = (id: string) => document.getElementById(id) as any;
  const visible = (id: string) => !$(id).hidden && !$(id).closest('[hidden]');
  const type = (value: string) => { $('server').value = value; $('server').dispatchEvent(new window.Event('input', { bubbles: true })); };
  const submit = async () => { $('connection').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await flush(); await flush(); };
  return { window, document, $, calls, visible, type, submit, push: (state: any) => listener(state) };
}

const base = { url: 'https://chat.example.com', status: '', connected: true, connecting: false, version: '1.2.3', liveStatus: 'online',
  permissions: { microphone: false, microphoneSupported: true, notifications: false, notificationSupport: true }, update: { state: 'idle' } };

describe('settings window markup', () => {
  test('every form control and button has an accessible name and the page keeps a strict CSP', async () => {
    const { document } = await mount(base);
    for (const el of document.querySelectorAll('input')) {
      const id = el.getAttribute('id');
      const named = document.querySelector(`label[for="${id}"]`) || el.closest('label') || el.getAttribute('aria-label');
      expect(Boolean(named)).toBe(true);
    }
    for (const button of document.querySelectorAll('button')) expect([button.id, button.textContent.trim().length > 0]).toEqual([button.id, true]);
    expect(html).toContain("script-src 'self'");
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(document.querySelector('[role="status"][aria-live="polite"]')).toBeTruthy();
  });
  test('first run shows HTTPS, LAN/VPN and localhost examples', async () => {
    const { $, visible } = await mount({ url: '', permissions: {}, update: { state: 'idle' } });
    const examples = $('examples').textContent;
    expect(examples).toContain('https://');
    expect(examples).toContain('VPN');
    expect(examples).toContain('localhost');
    expect(visible('current')).toBe(false);
    expect(visible('back')).toBe(false);
    expect($('connection-state').textContent).toBe('Сервер не выбран');
  });
  test('styles provide light/dark tokens, visible focus and reduced motion', () => {
    const css = readFileSync(join(__dirname, 'styles.css'), 'utf8');
    expect(css).toContain('color-scheme: light'); expect(css).toContain('color-scheme: dark');
    expect(css).toContain('prefers-color-scheme: dark');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('prefers-contrast: more');
  });
});

describe('connection form', () => {
  test('HTTPS connects without consent and passes allowHttp false', async () => {
    const m = await mount({ ...base, url: '' });
    m.type('https://new.example.com');
    expect(m.visible('http-warning')).toBe(false);
    await m.submit();
    expect(m.calls).toContainEqual(['connect', 'https://new.example.com', { allowHttp: false }]);
  });
  test('LAN HTTP shows the warning and requires explicit consent', async () => {
    const m = await mount({ ...base, url: '' });
    m.type('http://192.168.1.20:3000');
    expect(m.visible('http-warning')).toBe(true);
    await m.submit();
    expect(m.calls.filter(c => c[0] === 'connect')).toHaveLength(0);
    expect(m.$('form-error').textContent).toContain('без шифрования');
    m.$('allow-http').checked = true;
    await m.submit();
    expect(m.calls).toContainEqual(['connect', 'http://192.168.1.20:3000', { allowHttp: true }]);
  });
  test('localhost HTTP needs no warning; credentials and bad schemes are refused locally', async () => {
    const m = await mount({ ...base, url: '' });
    m.type('http://localhost:3000');
    expect(m.visible('http-warning')).toBe(false);
    for (const bad of ['https://user:pw@x.example', 'ftp://x.example', 'not a url', '']) {
      m.type(bad); await m.submit();
      expect(m.visible('form-error')).toBe(true);
      expect(m.$('server').getAttribute('aria-invalid')).toBe('true');
    }
    expect(m.calls.filter(c => c[0] === 'connect')).toHaveLength(0);
  });
  test('a failed check keeps the old server visible with back and retry and shows the reason', async () => {
    const m = await mount(base, { connect: { ok: false, error: 'Сертификат сервера недействителен.' } });
    m.type('https://bad.example.com');
    await m.submit();
    expect(m.$('status').textContent).toBe('Сертификат сервера недействителен.');
    expect(m.$('current-url').textContent).toBe('https://chat.example.com');
    expect(m.visible('back') && m.visible('retry')).toBe(true);
    expect(m.$('server').value).toBe('https://bad.example.com');
    expect(m.document.body.textContent).not.toMatch(/обойти проверку сертификата|продолжить небезопасно/i);
  });
  test('while connecting, cancel is offered (also by Escape) and connect is disabled', async () => {
    const m = await mount(base);
    m.push({ connecting: true });
    expect(m.$('connect').disabled).toBe(true);
    expect(m.visible('cancel')).toBe(true);
    m.document.dispatchEvent(new m.window.KeyboardEvent('keydown', { key: 'Escape' }));
    await flush();
    expect(m.calls).toContainEqual(['action', 'cancel']);
  });
  test('back and retry dispatch whitelisted actions and action errors are announced', async () => {
    const m = await mount(base, { retry: { ok: false, error: 'Сервер недоступен.' } });
    expect(m.$('back').textContent).toBe('Вернуться к чату');
    m.$('back').click(); m.$('retry').click(); await flush();
    expect(m.calls).toContainEqual(['action', 'back']);
    expect(m.calls).toContainEqual(['action', 'retry']);
    expect(m.$('action-error').getAttribute('role')).toBe('alert');
    expect(m.$('action-error').textContent).toBe('Сервер недоступен.');
  });
  test('live status is explained', async () => {
    const m = await mount({ ...base, liveStatus: 'offline' });
    expect(m.$('live-status').textContent).toContain('потеряна');
  });
});

describe('permissions', () => {
  test('microphone and notifications toggle via grant/revoke actions', async () => {
    const m = await mount(base);
    m.$('mic-toggle').click(); m.$('notify-toggle').click(); await flush();
    expect(m.calls).toContainEqual(['action', 'mic-grant']);
    expect(m.calls).toContainEqual(['action', 'notifications-on']);
    m.push({ permissions: { microphone: true, microphoneSupported: true, notifications: true, notificationSupport: true } });
    expect(m.$('mic-toggle').textContent).toBe('Отозвать доступ');
    m.$('mic-toggle').click(); m.$('notify-toggle').click(); await flush();
    expect(m.calls).toContainEqual(['action', 'mic-revoke']);
    expect(m.calls).toContainEqual(['action', 'notifications-off']);
  });
  test('unsupported microphone (LAN HTTP) and notifications are disabled with an explanation', async () => {
    const m = await mount({ ...base, permissions: { microphone: false, microphoneSupported: false, notifications: false, notificationSupport: false } });
    expect(m.$('mic-toggle').disabled).toBe(true);
    expect(m.$('mic-state').textContent).toContain('HTTPS');
    expect(m.$('notify-toggle').disabled).toBe(true);
    m.push({permissions:{microphoneSupported:false, microphoneReason:'Разрешите доступ к микрофону в настройках системы.'}});
    expect(m.$('mic-state').textContent).toContain('настройках системы');
  });
});

describe('version and updates', () => {
  const states: Record<string, string[]> = {
    idle: ['update-check'], checking: [], available: ['update-check', 'update-download'], downloading: [],
    ready: ['update-restart', 'update-later'], deferred: ['update-restart'], current: ['update-check'],
    error: ['update-check'], unavailable: []
  };
  for (const [state, buttons] of Object.entries(states)) test(`${state} shows ${buttons.join(', ') || 'no buttons'}`, async () => {
    const m = await mount({ ...base, update: { state, version: '1.3.0' } });
    expect(m.$('version').textContent).toBe('1.2.3');
    expect(m.$('update-state').textContent.length).toBeGreaterThan(0);
    for (const id of ['update-check', 'update-download', 'update-restart', 'update-later']) expect([id, m.visible(id)]).toEqual([id, buttons.includes(id)]);
  });
  test('Later and restart dispatch actions; deferred says it will not install on quit', async () => {
    const m = await mount({ ...base, update: { state: 'ready', version: '1.3.0' } });
    m.$('update-later').click(); m.$('update-restart').click(); await flush();
    expect(m.calls).toContainEqual(['action', 'update-later']);
    expect(m.calls).toContainEqual(['action', 'update-restart']);
    m.push({ update: { state: 'deferred', version: '1.3.0' } });
    expect(m.$('update-state').textContent).toContain('не установится само');
  });
  test('focus moves to a visible control when the focused button disappears', async () => {
    const m = await mount({ ...base, update: { state: 'ready', version: '1.3.0' } });
    m.$('update-later').focus();
    m.push({ update: { state: 'deferred', version: '1.3.0' } });
    const active = m.document.activeElement as any;
    expect(active.hidden).toBe(false);
    expect(active.id).not.toBe('update-later');
  });
});

describe('preload bridge', () => {
  test('exposes only setup calls with an action whitelist matching the contract', () => {
    const exposed: any = {}; const invoked: any[] = [];
    const electron = { contextBridge: { exposeInMainWorld: (name: string, api: any) => { exposed[name] = api; } },
      ipcRenderer: { invoke: (...args: any[]) => { invoked.push(args); return Promise.resolve({ ok: true }); }, on() {} } };
    new Function('require', preloadSource)((name: string) => { if (name !== 'electron') throw new Error(name); return electron; });
    expect(Object.keys(exposed)).toEqual(['desktopSetup']);
    expect(Object.keys(exposed.desktopSetup).sort()).toEqual(['action', 'connect', 'getState', 'onState']);
    exposed.desktopSetup.connect('https://x.example', { allowHttp: 'yes' });
    exposed.desktopSetup.action('update-restart');
    exposed.desktopSetup.action('shell-exec');
    expect(invoked).toEqual([['setup:connect', 'https://x.example', { allowHttp: false }], ['setup:action', 'update-restart']]);
  });
});

describe('settings appearance', () => {
  const css = readFileSync(join(__dirname, 'styles.css'), 'utf8');
  const tokens = readFileSync(join(__dirname, '../frontend/src/styles/tokens.css'), 'utf8');
  const block = (source: string, selector: string) => source.slice(source.indexOf(selector), source.indexOf('}', source.indexOf(selector)));
  const value = (source: string, name: string) => source.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();
  test('follows the server-selected theme and falls back to the system appearance', async () => {
    const { document, push } = await mount({ ...base, theme: 'dark' });
    expect(document.documentElement.dataset.theme).toBe('dark');
    push({ ...base, theme: 'light' }); expect(document.documentElement.dataset.theme).toBe('light');
    push({ ...base, theme: '' }); expect(document.documentElement.dataset.theme).toBe('system');
    push({ ...base, theme: 'neon' }); expect(document.documentElement.dataset.theme).toBe('system');
  });
  test('has the integrated draggable title strip and the product palette', async () => {
    const { document } = await mount(base);
    expect(document.querySelector('.titlebar')?.textContent).toContain('MauzCode');
    expect(css).toMatch(/\.titlebar \{[^}]*-webkit-app-region: drag/);
    for (const theme of [":root, [data-theme='light']", "[data-theme='dark']"]) {
      for (const name of ['bg', 'sidebar', 'settings-group', 'text', 'text-secondary', 'line', 'accent', 'accent-hover', 'on-accent', 'success', 'tool-error']) {
        expect([theme, name, value(block(css, theme), name)]).toEqual([theme, name, value(block(tokens, theme), name)]);
      }
    }
  });
});
