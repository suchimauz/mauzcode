import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createExtensionRegistry } from '../extensions/registry';
import type { ExtensionModelProviderProps, UiExtension } from '../extensions/types';

const pluginUi = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../extensions/pluginRuntime', () => ({ usePluginUi: () => pluginUi.current }));

import { ModelsPanel, UsageView } from '../components/settings/ModelsPanel';
import { SETTINGS_TABS, SettingsDialog } from '../components/settings/SettingsDialog';

const custom = { id: 'custom', label: 'Custom', description: 'Compatible API', fields: [
  { key: 'baseUrl', label: 'API base URL', type: 'url', required: true },
  { key: 'apiKey', label: 'API key', type: 'secret' },
  { key: 'protocol', label: 'Protocol', type: 'select', required: true, default: 'openai-chat', options: [{ value: 'openai-chat', label: 'OpenAI Chat' }, { value: 'anthropic', label: 'Anthropic' }] },
], transports: ['direct', 'socks', 'ssh-tunnel'], actions: [] };
const acme = { id: 'acme', label: 'Acme', fields: [{ key: 'region', label: 'Region', type: 'text' }], transports: ['direct'], actions: [] };
const stored = { id: 'c1', provider: 'custom', providerRegistered: true, accountName: 'Work', config: { baseUrl: 'https://api.example', protocol: 'anthropic' }, secrets: { apiKey: true }, transport: { kind: 'direct' }, enabled: true, createdAt: 1, updatedAt: 2 };
const context = { agentId: null, theme: 'light' as const, readOnly: false };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function mockApi(connections: unknown[], providers: unknown[] = [custom], usage: unknown = { status: 'configured', reason: 'not-tested', checkedAt: 1 }) {
  const posts: { body: any; headers: any }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit = {}) => {
    if ((init.method || 'GET') === 'GET') return json({ providers, connections, proxies: [{ id: 'p1', name: 'Office', host: 'proxy', port: 1080 }], instances: ['box'], csrfToken: 'csrf' });
    const body = JSON.parse(String(init.body)); posts.push({ body, headers: init.headers });
    if (body.action === 'usage') return json({ usage });
    if (body.action === 'create') return json({ connection: { ...stored, id: 'c2', accountName: body.accountName } }, 201);
    if (body.action === 'update') return json({ connection: { ...stored, ...body } });
    if (body.action === 'remove') return json({ removed: body.id });
    if (body.action === 'test') return json({ result: { status: 'available', reason: 'models-ok', message: 'Model discovery succeeded', checkedAt: 2 } });
    return json({ error: 'unexpected' }, 400);
  }));
  return posts;
}
beforeEach(() => { pluginUi.current = { registry: createExtensionRegistry([], {}), applications: {}, errors: {}, loaded: true }; });
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('lists Models as the only model settings tab', async () => {
  const ids: string[] = SETTINGS_TABS.map(t => t.id);
  expect(ids).toContain('models'); expect(ids).not.toContain('llm-connections');
  expect(SETTINGS_TABS.map(t => t.label).filter(label => /llm|policy|model/i.test(label))).toEqual(['Models']);
  mockApi([]);
  render(<SettingsDialog open tab="models" onTab={() => {}} onOpenChange={() => {}} />);
  expect(screen.queryByRole('button', { name: 'LLM Connections' })).toBeNull();
  expect(screen.queryByRole('button', { name: /LLMs|policy/i })).toBeNull();
  expect(screen.getByRole('button', { name: 'Models' })).toHaveAttribute('aria-current', 'true');
  expect(await screen.findByRole('heading', { name: 'Models' })).toBeVisible();
});

it('renders a schema form and creates a connection with a CSRF token, without reload', async () => {
  const posts = mockApi([]);
  render(<ModelsPanel context={context} />);
  const form = await screen.findByRole('form', { name: 'New Custom connection' });
  fireEvent.change(within(form).getByLabelText('Account name'), { target: { value: 'Mine' } });
  fireEvent.change(within(form).getByLabelText('API base URL'), { target: { value: 'https://llm.example' } });
  fireEvent.change(within(form).getByLabelText('API key'), { target: { value: 'sk-123' } });
  expect(within(form).getByLabelText('Protocol')).toHaveValue('openai-chat');
  fireEvent.click(within(form).getByRole('radio', { name: 'SOCKS5 proxy' }));
  expect(within(form).getByLabelText('Saved proxy')).toHaveValue('p1');
  fireEvent.submit(form);
  await waitFor(() => expect(posts.some(p => p.body.action === 'create')).toBe(true));
  const create = posts.find(p => p.body.action === 'create')!;
  expect(create.headers['X-CSRF-Token']).toBe('csrf');
  expect(create.body).toMatchObject({ provider: 'custom', accountName: 'Mine', config: { baseUrl: 'https://llm.example', protocol: 'openai-chat' }, secrets: { apiKey: 'sk-123' }, transport: { kind: 'socks', proxyId: 'p1' } });
});

it('keeps a stored secret write-only: empty input omits it, clearing sends null', async () => {
  const posts = mockApi([stored]);
  render(<ModelsPanel context={context} />);
  const card = await screen.findByRole('article', { name: 'Work' });
  fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
  const form = within(card).getByRole('form', { name: 'Edit Work' });
  const key = within(form).getByLabelText('API key');
  expect(key).toHaveValue(''); expect(key).toHaveAttribute('type', 'password'); expect(key).toHaveAttribute('placeholder', expect.stringContaining('Stored'));
  expect(within(form).getByLabelText('Protocol')).toHaveValue('anthropic');
  expect(document.body.textContent).not.toContain('sk-');
  fireEvent.submit(form);
  await waitFor(() => expect(posts.some(p => p.body.action === 'update')).toBe(true));
  expect(posts.find(p => p.body.action === 'update')!.body.secrets).toEqual({});
  fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
  const again = within(card).getByRole('form', { name: 'Edit Work' });
  fireEvent.click(within(again).getByLabelText('Clear stored API key'));
  fireEvent.submit(again);
  await waitFor(() => expect(posts.filter(p => p.body.action === 'update')).toHaveLength(2));
  expect(posts.filter(p => p.body.action === 'update')[1].body.secrets).toEqual({ apiKey: null });
});

it('removes only after explicit confirmation, with focus on the confirm button', async () => {
  const posts = mockApi([stored]);
  render(<ModelsPanel context={context} />);
  const card = await screen.findByRole('article', { name: 'Work' });
  fireEvent.click(within(card).getByRole('button', { name: 'Remove' }));
  expect(posts.some(p => p.body.action === 'remove')).toBe(false);
  const confirm = within(card).getByRole('button', { name: 'Remove connection' });
  await waitFor(() => expect(confirm).toHaveFocus());
  fireEvent.click(confirm);
  await waitFor(() => expect(posts.find(p => p.body.action === 'remove')?.body).toEqual({ action: 'remove', id: 'c1', confirmed: true }));
});

it('tests a connection and toggles enabled', async () => {
  const posts = mockApi([stored]);
  render(<ModelsPanel context={context} />);
  const card = await screen.findByRole('article', { name: 'Work' });
  fireEvent.click(within(card).getByRole('button', { name: /Test/ }));
  expect(await screen.findByText('Work: Model discovery succeeded')).toBeVisible();
  fireEvent.click(within(card).getByRole('switch', { name: 'Enabled' }));
  await waitFor(() => expect(posts.find(p => p.body.action === 'update')?.body).toEqual({ action: 'update', id: 'c1', enabled: false }));
});

it('shows quota windows, or only status and reason without windows', () => {
  const { rerender } = render(<UsageView usage={{ status: 'available', plan: 'max', checkedAt: 1, windows: [{ label: '5h', usedPercent: 42, resetAt: 2 }] }} />);
  expect(screen.getByText('Plan: max')).toBeVisible();
  expect(screen.getByRole('meter', { name: '5h used' })).toHaveAttribute('aria-valuenow', '42');
  expect(screen.getByText(/42% used · resets/)).toBeVisible();
  rerender(<UsageView usage={{ status: 'unavailable', reason: 'models-failed', checkedAt: 1 }} />);
  expect(screen.queryByText(/^Plan:/)).not.toBeInTheDocument();
  expect(screen.queryByRole('list', { name: 'Quota windows' })).toBeNull();
  expect(screen.getByText('Unavailable')).toBeVisible(); expect(screen.getByText('Model list request failed')).toHaveAttribute('title', 'models-failed');
});

it('uses a granted plugin component for its provider and the schema form otherwise', async () => {
  const seen: ExtensionModelProviderProps[] = [];
  const AcmeForm = (props: ExtensionModelProviderProps) => { seen.push(props); return <p>Acme plugin form</p>; };
  const extension: UiExtension = { id: 'acme', apiVersion: 1, modelProviders: [{ provider: 'acme', component: AcmeForm }] };
  pluginUi.current = { registry: createExtensionRegistry([extension], { acme: { modelProviders: ['acme'] } }), applications: {}, errors: {}, loaded: true };
  mockApi([], [custom, acme]);
  render(<ModelsPanel context={context} />);
  await screen.findByRole('form', { name: 'New Custom connection' });
  fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'acme' } });
  expect(await screen.findByText('Acme plugin form')).toBeVisible();
  expect(seen.at(-1)?.provider.id).toBe('acme');
  pluginUi.current = { registry: createExtensionRegistry([extension], {}), applications: {}, errors: {}, loaded: true };
  fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'custom' } });
  fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'acme' } });
  expect(await screen.findByRole('form', { name: 'New Acme connection' })).toBeVisible();
});

it('reports owner-only access', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Only owners can manage model connections' }, 403)));
  render(<ModelsPanel context={context} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Только владелец');
});

it('toggles models by clicking the row, saving all changes with one Save button', async () => {
  const posts = mockApi([stored]);
  const fetchMock = vi.mocked(fetch);
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url: any, init: RequestInit = {}) => {
    if ((init.method || 'GET') !== 'GET') {
      const body = JSON.parse(String(init.body));
      if (body.action === 'models') { posts.push({ body, headers: init.headers }); return json({ models: body.refresh ? [{ id: 'm1', disabled: true }, { id: 'm2', disabled: true }, { id: 'm3', disabled: false }] : [{ id: 'm1', disabled: false }, { id: 'm2', disabled: true }], source: 'provider', cachedAt: body.refresh ? 2_000_000 : 1_000_000 }); }
      if (body.action === 'setModelEnabled') { posts.push({ body, headers: init.headers }); return json({ connection: { ...stored, disabledModels: ['m1', 'm2'] } }); }
    }
    return base(url, init);
  });
  render(<ModelsPanel context={context} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Models' }));
  const m1 = await screen.findByRole('switch', { name: 'Enabled m1' });
  const m2 = screen.getByRole('switch', { name: 'Enabled m2' });
  // The model draft is initialized by an effect after the async catalogue arrives.
  await waitFor(() => { expect(m1).toBeChecked(); expect(m2).not.toBeChecked(); });
  expect(m2.closest('li')).toHaveAttribute('data-model-disabled', 'true');
  // Clicking the row text toggles the draft only; nothing is sent until Save.
  fireEvent.click(screen.getByText('m1'));
  expect(m1).not.toBeChecked();
  expect(m1.closest('li')).toHaveAttribute('data-model-disabled', 'true');
  expect(posts.some(p => p.body.action === 'setModelEnabled')).toBe(false);
  fireEvent.click(m1); fireEvent.click(m1);
  expect(posts.some(p => p.body.action === 'setModelEnabled')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Save (1)' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull());
  expect(screen.getByRole('switch', { name: 'Enabled m1' })).not.toBeChecked();
  expect(posts.filter(p => p.body.action === 'setModelEnabled')).toHaveLength(1);
  const call = posts.find(p => p.body.action === 'setModelEnabled')!;
  expect(call.body).toEqual({ action: 'setModelEnabled', id: 'c1', model: 'm1', enabled: false });
  expect(call.headers).toMatchObject({ 'X-CSRF-Token': 'csrf' });
  // Opening the list reads the cache; only Update models asks the provider.
  expect(posts.filter(p => p.body.action === 'models').map(p => p.body.refresh)).toEqual([false]);
  expect(screen.getByText(/refreshes hourly/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Update models' }));
  expect(await screen.findByRole('switch', { name: 'Enabled m3' })).toBeChecked();
  expect(posts.filter(p => p.body.action === 'models').map(p => p.body.refresh)).toEqual([false, true]);
});

it('runs the Codex device login: code, copy, polling, cancel and confirmed logout', async () => {
  const codexProvider = { id: 'codex', label: 'Codex', fields: [{ key: 'clientVersion', label: 'Client version', type: 'text' }], transports: ['direct', 'socks', 'ssh-tunnel'], actions: [] };
  const conn = { ...stored, id: 'cx', provider: 'codex', accountName: 'GPT', config: {}, secrets: {} };
  const posts = mockApi([conn], [codexProvider]);
  const fetchMock = vi.mocked(fetch);
  const base = fetchMock.getMockImplementation()!;
  let loggedIn = false;
  const flow = { flowId: 'f1', status: 'pending', verificationUri: 'https://auth.openai.com/codex/device', userCode: 'ABCD-1234', expiresAt: Date.now() + 60000 };
  let current: any = null;
  fetchMock.mockImplementation(async (url: any, init: RequestInit = {}) => {
    if ((init.method || 'GET') !== 'GET') {
      const body = JSON.parse(String(init.body));
      if (body.action === 'action') {
        posts.push({ body, headers: init.headers });
        if (body.name === 'login') { current = flow; return json({ result: flow }); }
        if (body.name === 'loginStatus') return json({ result: { loggedIn, needsLogin: !loggedIn, expiresAt: null, flow: current } });
        if (body.name === 'cancelLogin') { current = { ...flow, status: 'failed', message: 'Login cancelled' }; return json({ result: current }); }
        if (body.name === 'logout') { loggedIn = false; return json({ result: { loggedIn: false, needsLogin: true } }); }
      }
    }
    return base(url, init);
  });
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  render(<ModelsPanel context={context} />);
  const region = await screen.findByRole('region', { name: 'Codex login for GPT' });
  await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent('Not logged in'));
  fireEvent.click(within(region).getByRole('button', { name: 'Log in' }));
  const link = await within(region).findByRole('link', { name: flow.verificationUri });
  expect(link).toHaveAttribute('target', '_blank'); expect(link.getAttribute('rel')).toContain('noopener');
  expect(within(region).getByLabelText('One-time code')).toHaveTextContent('ABCD-1234');
  expect(within(region).getByRole('status')).toHaveTextContent('Waiting for authorization');
  fireEvent.click(within(region).getByRole('button', { name: 'Copy code' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('ABCD-1234'));
  fireEvent.click(within(region).getByRole('button', { name: 'Cancel login' }));
  await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent('Login cancelled'));
  expect(posts.filter(p => p.body.action === 'action').map(p => p.body.name)).toEqual(expect.arrayContaining(['loginStatus', 'login', 'cancelLogin']));

  // Polling picks up a successful login.
  loggedIn = false; current = flow;
  fireEvent.click(within(region).getByRole('button', { name: 'Log in' }));
  await within(region).findByLabelText('One-time code');
  loggedIn = true; current = { ...flow, status: 'succeeded' };
  await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent('Logged in'), { timeout: 4000 });

  fireEvent.click(within(region).getByRole('button', { name: 'Log out' }));
  const confirm = within(region).getByRole('group', { name: 'Confirm logout' });
  expect(posts.some(p => p.body.name === 'logout')).toBe(false);
  fireEvent.click(within(confirm).getByRole('button', { name: 'Log out' }));
  await waitFor(() => expect(posts.some(p => p.body.name === 'logout')).toBe(true));
  await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent('Not logged in'));
}, 10000);

it('shows a brand logo for known providers and always a generic plug for custom connections', async () => {
  const logo = { src: 'data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E', custom: false };
  const codexProvider = { id: 'codex', label: 'Codex', fields: [], transports: ['direct'], actions: [] };
  const plain = { ...stored, id: 'c9', accountName: 'Local', config: { baseUrl: 'http://localhost:1', protocol: 'gemini' } };
  const cx = { ...stored, id: 'cx', provider: 'codex', accountName: 'GPT', config: {} };
  const claudeProvider = { ...codexProvider, id: 'claude', label: 'Claude' };
  const cl = { ...cx, id: 'cl', provider: 'claude', accountName: 'Claude' };
  mockApi([stored, plain, cx, cl], [custom, codexProvider, claudeProvider]);
  const fetchMock = vi.mocked(fetch);
  const base = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation(async (url: any, init: RequestInit = {}) => {
    if ((init.method || 'GET') === 'GET') return json({ providers: [custom, codexProvider, claudeProvider], connections: [stored, plain, cx, cl], providerLogos: { codex: logo, claude: logo, custom: null }, proxies: [], instances: [], csrfToken: 'csrf' });
    if (JSON.parse(String(init.body)).action === 'action') return json({ result: { loggedIn: true, needsLogin: false, flow: null } });
    return base(url, init);
  });
  render(<ModelsPanel context={context} />);
  const card = (name: string) => screen.findByRole('article', { name });
  expect((await card('Work')).querySelector('[data-provider-logo]')).toHaveAttribute('data-provider-logo', 'custom');
  expect((await card('Local')).querySelector('[data-provider-logo]')).toHaveAttribute('data-provider-logo', 'custom');
  expect((await card('GPT')).querySelector('[data-provider-logo]')).toHaveAttribute('data-provider-logo', 'brand');
  expect((await card('Claude')).querySelector('[data-provider-logo]')).toHaveAttribute('data-provider-logo', 'brand');
});

it.each([true, false])('supports Claude authorization paste, rejection and retry (callback listening: %s)', async (callbackListening) => {
  const provider = { id: 'claude', label: 'Claude', fields: [], transports: ['direct'], actions: [] };
  const conn = { ...stored, id: 'cl', provider: 'claude', accountName: 'Claude work', config: {}, secrets: {} };
  const posts = mockApi([conn], [provider]);
  const base = vi.mocked(fetch).getMockImplementation()!;
  const flow = { flowId: 'cf1', kind: 'authorization-code', status: 'pending', authorizationUrl: 'https://claude.ai/oauth/authorize?state=test', callbackListening, expiresAt: Date.now() + 60000 };
  let current: any = null;
  let loggedIn = false;
  vi.mocked(fetch).mockImplementation(async (url: any, init: RequestInit = {}) => {
    if ((init.method || 'GET') !== 'GET') {
      const body = JSON.parse(String(init.body));
      if (body.action === 'action') {
        posts.push({ body, headers: init.headers });
        if (body.name === 'loginStatus') return json({ result: { loggedIn, needsLogin: !loggedIn, expiresAt: null, flow: current } });
        if (body.name === 'login') { current = flow; return json({ result: current }); }
        if (body.name === 'submitLogin') {
          loggedIn = body.input.code === 'valid-code';
          current = loggedIn ? { ...flow, status: 'succeeded' } : { ...flow, message: 'Authorization state does not match. Paste the callback URL again.' };
          return json({ result: current });
        }
        if (body.name === 'cancelLogin') { current = { ...flow, status: 'failed', message: 'Login cancelled' }; return json({ result: current }); }
      }
    }
    return base(url, init);
  });
  render(<ModelsPanel context={context} />);
  const region = await screen.findByRole('region', { name: 'Claude login for Claude work' });
  await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent('Not logged in'));
  fireEvent.click(within(region).getByRole('button', { name: 'Log in' }));
  const field = await within(region).findByRole('textbox', { name: 'Callback URL or authorization code' });
  expect(within(region).getByRole('link', { name: 'Open Claude authorization' })).toHaveAttribute('href', flow.authorizationUrl);
  expect(within(region).getByText(callbackListening ? /Local callback is listening/ : /Local callback is unavailable/)).toBeInTheDocument();
  expect(within(region).queryByLabelText('One-time code')).not.toBeInTheDocument();
  expect(within(region).getByRole('button', { name: 'Submit code' })).toBeDisabled();
  fireEvent.change(field, { target: { value: 'http://localhost:53692/callback?code=bad&state=wrong' } });
  fireEvent.click(within(region).getByRole('button', { name: 'Submit code' }));
  expect(await within(region).findByRole('alert')).toHaveTextContent('Authorization state does not match');
  expect(field).toHaveValue('http://localhost:53692/callback?code=bad&state=wrong');
  expect(within(region).getByRole('status')).toHaveTextContent('Waiting for authorization');
  expect(posts.find(p => p.body.name === 'submitLogin')?.body.input).toEqual({ flowId: 'cf1', code: 'http://localhost:53692/callback?code=bad&state=wrong' });
  fireEvent.change(field, { target: { value: 'valid-code' } });
  fireEvent.click(within(region).getByRole('button', { name: 'Submit code' }));
  await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent('Logged in'));
  expect(within(region).queryByRole('textbox')).not.toBeInTheDocument();
  fireEvent.click(within(region).getByRole('button', { name: 'Log in again' }));
  await within(region).findByRole('textbox');
  fireEvent.click(within(region).getByRole('button', { name: 'Cancel login' }));
  await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent('Login cancelled'));
});

function mockContextApi(opts: { failSave?: boolean } = {}) {
  const posts = mockApi([stored]);
  const fetchMock = vi.mocked(fetch);
  const base = fetchMock.getMockImplementation()!;
  let overrides: Record<string, number> = {};
  let catalogue: { id: string; contextWindow?: number; disabled?: boolean }[] = [{ id: 'qwen', disabled: false }, { id: 'big', contextWindow: 262144, disabled: false }];
  const limit = (m: { id: string; contextWindow?: number }) => {
    const provider = m.contextWindow ?? null, override = overrides[m.id] ?? null;
    return override != null ? { provider, override, effective: override, source: 'override' } : provider != null ? { provider, override, effective: provider, source: 'provider' } : { provider, override, effective: 200000, source: 'fallback' };
  };
  fetchMock.mockImplementation(async (url: any, init: RequestInit = {}) => {
    if ((init.method || 'GET') !== 'GET') {
      const body = JSON.parse(String(init.body));
      if (body.action === 'models') {
        posts.push({ body, headers: init.headers });
        if (body.refresh) catalogue = [{ id: 'big', contextWindow: 300000, disabled: false }];
        return json({ models: catalogue, source: 'provider', cachedAt: 1_000_000, contextOverrides: overrides, contextLimits: Object.fromEntries(catalogue.map(m => [m.id, limit(m)])) });
      }
      if (body.action === 'setContextLimits') {
        posts.push({ body, headers: init.headers });
        if (opts.failSave) return json({ error: 'Storage unavailable' }, 422);
        for (const [k, v] of Object.entries(body.limits as Record<string, number | null>)) { if (v == null) delete overrides[k]; else overrides[k] = v; }
        overrides = { ...overrides };
        return json({ overrides, limits: Object.fromEntries(Object.keys(body.limits).map(k => [k, limit(catalogue.find(m => m.id === k) ?? { id: k })])) });
      }
    }
    return base(url, init);
  });
  return posts;
}

it('shows fallback limits, saves an override and distinguishes reset from discard without touching availability', async () => {
  const posts = mockContextApi();
  render(<ModelsPanel context={context} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Models' }));
  const field = await screen.findByLabelText('Context limit for qwen');
  expect(field).toHaveValue('');
  const group = screen.getByRole('group', { name: 'Context limit qwen' });
  expect(group).toHaveTextContent('200,000 tokens · Fallback');
  expect(screen.getByRole('group', { name: 'Context limit big' })).toHaveTextContent('262,144 tokens · Provider');
  expect(screen.getByText(/cannot increase what the provider accepts/)).toBeVisible();
  const toggle = screen.getByRole('switch', { name: 'Enabled qwen' });
  await waitFor(() => expect(toggle).toBeChecked());
  // Focusing, typing and clicking context controls never toggles availability.
  fireEvent.click(field); fireEvent.focus(field);
  fireEvent.change(field, { target: { value: '128000' } });
  expect(toggle).toBeChecked();
  expect(screen.queryByRole('button', { name: /^Save \(/ })).toBeNull();
  expect(group).toHaveTextContent('unsaved: 128000');
  fireEvent.click(within(group).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(group).toHaveTextContent('128,000 tokens · Owner override'));
  expect(toggle).toBeChecked();
  const save = posts.filter(p => p.body.action === 'setContextLimits');
  expect(save.map(p => p.body)).toEqual([{ action: 'setContextLimits', id: 'c1', limits: { qwen: 128000 } }]);
  expect(save[0].headers).toMatchObject({ 'X-CSRF-Token': 'csrf' });
  expect(posts.some(p => p.body.action === 'setModelEnabled')).toBe(false);
  // Reset then Discard keeps the stored override; Reset then Save removes it.
  fireEvent.click(within(group).getByRole('button', { name: 'Reset to default' }));
  expect(group).toHaveTextContent('unsaved: reset to default');
  fireEvent.click(within(group).getByRole('button', { name: 'Discard' }));
  expect(field).toHaveValue('128000');
  expect(posts.filter(p => p.body.action === 'setContextLimits')).toHaveLength(1);
  fireEvent.click(within(group).getByRole('button', { name: 'Reset to default' }));
  fireEvent.click(within(group).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(group).toHaveTextContent('200,000 tokens · Fallback'));
  expect(posts.filter(p => p.body.action === 'setContextLimits').at(-1)!.body.limits).toEqual({ qwen: null });
});

it('validates context input locally and keeps the draft after a failed save', async () => {
  const posts = mockContextApi({ failSave: true });
  render(<ModelsPanel context={context} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Models' }));
  const field = await screen.findByLabelText('Context limit for qwen');
  const group = screen.getByRole('group', { name: 'Context limit qwen' });
  for (const bad of ['0', '-5', '1.5', '12k']) {
    fireEvent.change(field, { target: { value: bad } });
    fireEvent.click(within(group).getByRole('button', { name: 'Save' }));
    expect(await within(group).findByRole('alert')).toHaveTextContent(/whole number/);
    expect(field).toHaveAttribute('aria-invalid', 'true');
  }
  expect(posts.some(p => p.body.action === 'setContextLimits')).toBe(false);
  fireEvent.change(field, { target: { value: '64000' } });
  fireEvent.keyDown(field, { key: 'Enter' });
  expect(await within(group).findByRole('alert')).toHaveTextContent('Storage unavailable');
  expect(field).toHaveValue('64000');
  expect(group).toHaveTextContent('200,000 tokens · Fallback');
});

it('keeps context drafts across refresh, including for models that disappeared', async () => {
  mockContextApi();
  render(<ModelsPanel context={context} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Models' }));
  fireEvent.change(await screen.findByLabelText('Context limit for qwen'), { target: { value: '32000' } });
  fireEvent.change(screen.getByLabelText('Context limit for big'), { target: { value: '100000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update models' }));
  await waitFor(() => expect(screen.getByRole('group', { name: 'Context limit big' })).toHaveTextContent('300,000 tokens · Provider'));
  expect(screen.getByLabelText('Context limit for big')).toHaveValue('100000');
  const pending = screen.getByRole('group', { name: /Pending context edits/ });
  expect(within(pending).getByLabelText('Context limit for qwen')).toHaveValue('32000');
  fireEvent.click(within(pending).getByRole('button', { name: 'Discard' }));
  expect(screen.queryByRole('group', { name: /Pending context edits/ })).toBeNull();
});
