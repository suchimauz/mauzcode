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

it('places the single Add connection block before existing connections, collapsed and expanded', async () => {
  const posts = mockApi([stored]);
  const { container } = render(<ModelsPanel context={context} />);
  const toggle = await screen.findByRole('button', { name: 'Add connection' });
  const list = container.querySelector('.ssh-list')!;
  expect(list).toBeTruthy();
  expect(toggle.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const focusable = [...container.querySelectorAll('button, input, select, a[href]')];
  expect(focusable.indexOf(toggle)).toBeLessThan(focusable.findIndex(el => list.contains(el)));
  fireEvent.click(toggle);
  const section = screen.getByRole('region', { name: 'Add connection' });
  expect(screen.getAllByRole('region', { name: 'Add connection' })).toHaveLength(1);
  expect(section.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const form = within(section).getByRole('form', { name: 'New Custom connection' });
  fireEvent.change(within(form).getByLabelText('Account name'), { target: { value: 'Second' } });
  fireEvent.change(within(form).getByLabelText('API base URL'), { target: { value: 'https://llm.example' } });
  fireEvent.submit(form);
  await waitFor(() => expect(posts.some(p => p.body.action === 'create')).toBe(true));
});

it('keeps the expanded first-connection form at the top with no duplicate when empty', async () => {
  mockApi([]);
  const { container } = render(<ModelsPanel context={context} />);
  const section = await screen.findByRole('region', { name: 'Add connection' });
  expect(container.querySelector('.ssh-add-toggle')).toBeNull();
  expect(screen.getAllByRole('region', { name: 'Add connection' })).toHaveLength(1);
  expect(container.querySelector('.ssh-list')).toBeNull();
  expect(section.compareDocumentPosition(screen.getByRole('heading', { name: 'Models' })) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
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

it('shows the Qwen account and plan, and numbered device-code steps', async () => {
  const provider = { id: 'qwen', label: 'Qwen Subscription', fields: [], transports: ['direct'], actions: [] };
  const conn = { ...stored, id: 'qw', provider: 'qwen', accountName: 'qwen', config: {}, secrets: {} };
  mockApi([conn], [provider]);
  const base = vi.mocked(fetch).getMockImplementation()!;
  const flow = { flowId: 'q1', kind: 'device-code', status: 'pending', verificationUri: 'https://chat.qwen.ai/authorize?user_code=QW-1234&client=cli', userCode: 'QW-1234', expiresAt: Date.now() + 60000 };
  let current: any = null;
  let loggedIn = true;
  vi.mocked(fetch).mockImplementation(async (url: any, init: RequestInit = {}) => {
    if ((init.method || 'GET') !== 'GET') {
      const body = JSON.parse(String(init.body));
      if (body.action === 'action') {
        if (body.name === 'loginStatus') return json({ result: { loggedIn, needsLogin: !loggedIn, expiresAt: null, account: loggedIn ? { email: 'me@example.com', plan: 'plus' } : null, flow: current } });
        if (body.name === 'login') { loggedIn = false; current = flow; return json({ result: current }); }
      }
    }
    return base(url, init);
  });
  render(<ModelsPanel context={context} />);
  const region = await screen.findByRole('region', { name: 'Qwen Subscription login for qwen' });
  await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent('Logged in'));
  expect(within(region).getByText('me@example.com · plus plan')).toBeInTheDocument();
  fireEvent.click(within(region).getByRole('button', { name: 'Log in again' }));
  const steps = await within(region).findAllByRole('listitem');
  expect(steps).toHaveLength(3);
  expect(within(steps[0]!).getByRole('link')).toHaveAttribute('href', flow.verificationUri);
  expect(within(steps[1]!).getByLabelText('One-time code')).toHaveTextContent('QW-1234');
});

it('groups connections under provider headers with a switch, including providers without connections', async () => {
  mockApi([stored], [{ ...custom, enabled: true }, { ...acme, enabled: true }]);
  render(<ModelsPanel context={context} />);
  const customGroup = await screen.findByRole('region', { name: 'Custom provider' });
  const acmeGroup = screen.getByRole('region', { name: 'Acme provider' });
  expect(within(customGroup).getByRole('article', { name: 'Work' })).toBeInTheDocument();
  // Acme has no connections but still gets a header row with a switch.
  expect(within(acmeGroup).queryByRole('article')).toBeNull();
  expect(within(acmeGroup).getByRole('switch', { name: 'Enable Acme provider' })).toBeChecked();
  expect(within(customGroup).getByRole('switch', { name: 'Enable Custom provider' })).toBeChecked();
});

it('provider switch posts setProviderEnabled once and reloads the panel', async () => {
  let disabled = false;
  const posts = mockApi([stored], [{ ...custom, enabled: true }]);
  const base = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (url: any, init: RequestInit = {}) => {
    if ((init.method || 'GET') === 'GET') return json({ providers: [{ ...custom, enabled: !disabled }], connections: [stored], proxies: [], instances: [], csrfToken: 'csrf' });
    const body = JSON.parse(String(init.body));
    if (body.action === 'setProviderEnabled') { posts.push({ body, headers: init.headers }); disabled = !body.enabled; return json({ providers: [{ ...custom, enabled: !disabled }] }); }
    return base(url, init);
  });
  render(<ModelsPanel context={context} />);
  const toggle = await screen.findByRole('switch', { name: 'Enable Custom provider' });
  fireEvent.click(toggle);
  await waitFor(() => expect(posts.filter(p => p.body.action === 'setProviderEnabled')).toHaveLength(1));
  expect(posts.find(p => p.body.action === 'setProviderEnabled')!.body).toEqual({ action: 'setProviderEnabled', provider: 'custom', enabled: false });
  expect(posts.find(p => p.body.action === 'setProviderEnabled')!.headers['X-CSRF-Token']).toBe('csrf');
  // After reload the header shows the disabled state and the badge.
  await waitFor(() => expect(screen.getByRole('switch', { name: 'Enable Custom provider' })).not.toBeChecked());
  const group = screen.getByRole('region', { name: 'Custom provider' });
  expect(within(group).getByText('Disabled')).toBeInTheDocument();
});

it('a failed provider toggle announces the error and keeps the stored state', async () => {
  const posts = mockApi([stored], [{ ...custom, enabled: true }]);
  const base = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (url: any, init: RequestInit = {}) => {
    if ((init.method || 'GET') !== 'GET' && JSON.parse(String(init.body)).action === 'setProviderEnabled')
      return json({ error: 'Provider switch failed upstream' }, 422);
    return base(url, init);
  });
  render(<ModelsPanel context={context} />);
  fireEvent.click(await screen.findByRole('switch', { name: 'Enable Custom provider' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Provider switch failed upstream');
  expect(screen.getByRole('switch', { name: 'Enable Custom provider' })).toBeChecked();
  expect(posts.some(p => p.body.action === 'update')).toBe(false);
});

it('disabled provider: dimmed cards, blocked Test/Update models/Login, connection switch operable, hidden from Add connection', async () => {
  const codex = { id: 'codex', label: 'Codex', fields: [], transports: ['direct'], actions: [{ name: 'login', label: 'Log in' }], enabled: false };
  const conn = { ...stored, id: 'cx', provider: 'codex', accountName: 'sub', config: {}, secrets: {} };
  const posts = mockApi([conn, stored], [codex, { ...custom, enabled: true }]);
  const base = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (url: any, init: RequestInit = {}) => {
    if ((init.method || 'GET') !== 'GET' && JSON.parse(String(init.body)).action === 'models')
      return json({ models: [{ id: 'gpt-6' }], source: 'provider', cachedAt: 1 });
    return base(url, init);
  });
  const { container } = render(<ModelsPanel context={context} />);
  const group = await screen.findByRole('region', { name: 'Codex provider' });
  const card = within(group).getByRole('article', { name: 'sub' });
  expect(card.className).toContain('is-provider-disabled');
  expect(within(card).getByRole('button', { name: 'Test' })).toBeDisabled();
  // Connection-level switch stays operable.
  const connSwitch = within(card).getByRole('switch', { name: 'Enabled' });
  expect(connSwitch).not.toBeDisabled();
  fireEvent.click(connSwitch);
  await waitFor(() => expect(posts.some(p => p.body.action === 'update' && p.body.id === 'cx')).toBe(true));
  // Login button blocked and no loginStatus request sent for the disabled provider.
  const login = within(card).getByRole('button', { name: 'Log in' });
  expect(login).toBeDisabled();
  expect(posts.some(p => p.body.action === 'action' && p.body.id === 'cx')).toBe(false);
  // Update models blocked inside the Models section.
  fireEvent.click(within(card).getByRole('button', { name: 'Models' }));
  await waitFor(() => expect(within(card).getByRole('button', { name: 'Update models' })).toBeDisabled());
  // Add connection offers only the enabled provider.
  fireEvent.click(screen.getByRole('button', { name: 'Add connection' }));
  const add = screen.getByRole('region', { name: 'Add connection' });
  const select = within(add).getByLabelText('Provider');
  expect(within(select).queryByRole('option', { name: 'Codex' })).toBeNull();
  expect(within(select).getByRole('option', { name: 'Custom' })).toBeInTheDocument();
  expect(container.querySelector('[data-model-provider="codex"]')).toBeTruthy();
});

it('all providers disabled: creation shows a note instead of an empty selector', async () => {
  mockApi([], [{ ...custom, enabled: false }, { ...acme, enabled: false }]);
  render(<ModelsPanel context={context} />);
  expect(await screen.findByText(/All model providers are disabled/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Provider')).toBeNull();
  expect(screen.getByRole('switch', { name: 'Enable Custom provider' })).not.toBeChecked();
});

it('enabledLocked renders every provider switch disabled with a file hint and sends no request', async () => {
  const posts = mockApi([stored], [{ ...custom, enabled: true, enabledLocked: true }, { ...acme, enabled: false, enabledLocked: true }]);
  const base = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (url: any, init: RequestInit = {}) => {
    if ((init.method || 'GET') !== 'GET' && JSON.parse(String(init.body)).action === 'setProviderEnabled') {
      posts.push({ body: JSON.parse(String(init.body)), headers: init.headers });
      return json({ error: 'should never be sent' }, 400);
    }
    return base(url, init);
  });
  render(<ModelsPanel context={context} />);
  const customSwitch = await screen.findByRole('switch', { name: 'Enable Custom provider' });
  const acmeSwitch = screen.getByRole('switch', { name: 'Enable Acme provider' });
  expect(customSwitch).toBeDisabled();
  expect(acmeSwitch).toBeDisabled();
  const hintId = customSwitch.getAttribute('aria-describedby')!;
  expect(document.getElementById(hintId)?.textContent).toContain('instance settings file');
  fireEvent.click(customSwitch);
  expect(posts.some(p => p.body.action === 'setProviderEnabled')).toBe(false);
});

const versionProvider = (id = 'claude') => ({ id, label: id === 'claude' ? 'Claude' : 'Codex', hasClientVersion: true, fields: [
  { key: 'clientVersion', label: 'Client version', type: 'text' },
  { key: 'detectCliVersion', label: 'Detect CLI version', type: 'boolean', default: id === 'claude' },
], transports: ['direct'], actions: [] });

function mockVersionApi(id = 'claude', config: Record<string, unknown> = {}, report: unknown = { version: '2.1.260', source: 'detected' }) {
  const connections = [{ ...stored, provider: id, config }];
  const posts = mockApi(connections, [versionProvider(id)]);
  const base = vi.mocked(fetch).getMockImplementation()!;
  const lookup = vi.fn(async (_body: any) => json({ clientVersion: report }));
  vi.mocked(fetch).mockImplementation(async (url: any, init: RequestInit = {}) => {
    if (init.method === 'POST') {
      const body = JSON.parse(String(init.body));
      if (body.action === 'clientVersion') { posts.push({ body, headers: init.headers }); return lookup(body); }
      if (body.action === 'update') connections[0] = { ...connections[0], config: body.config, updatedAt: connections[0].updatedAt + 1 };
    }
    return base(url, init);
  });
  return { posts, lookup };
}

it.each([
  ['claude', {}, 'detected', 'detected: claude --version', true],
  ['codex', { detectCliVersion: true }, 'detected', 'detected: codex --version', true],
  ['codex', {}, 'default', 'built-in default', false],
  ['claude', { detectCliVersion: false }, 'fallback', 'built-in fallback', false],
  ['claude', { clientVersion: '1.2.3' }, 'override', 'connection override', false],
])('shows %s client version source %s %s', async (id, config, source, label, reDetect) => {
  mockVersionApi(id as string, config as Record<string, unknown>, { version: '1.2.3', source, detail: 'Version detail' });
  render(<ModelsPanel context={context} />);
  expect(await screen.findByText(`· v1.2.3 (${label})`)).toHaveAttribute('title', 'Version detail');
  expect(!!screen.queryByRole('button', { name: 'Re-detect' })).toBe(reDetect);
});

it('loads lazily, disables re-detect while pending and requests a fresh version with CSRF', async () => {
  const { posts, lookup } = mockVersionApi();
  let resolve!: (value: Response) => void;
  lookup.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
  render(<ModelsPanel context={context} />);
  expect(await screen.findByRole('article', { name: 'Work' })).toBeInTheDocument();
  expect(screen.getByLabelText('Loading client version')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Re-detect' })).toBeDisabled();
  resolve(json({ clientVersion: { version: '2.1.260', source: 'detected' } }));
  await screen.findByText('· v2.1.260 (detected: claude --version)');
  lookup.mockResolvedValueOnce(json({ clientVersion: { version: '2.1.261', source: 'detected' } }));
  fireEvent.click(screen.getByRole('button', { name: 'Re-detect' }));
  await screen.findByText('· v2.1.261 (detected: claude --version)');
  expect(posts.find(p => p.body.action === 'clientVersion' && p.body.refresh === true)?.headers['X-CSRF-Token']).toBe('csrf');
});

it('silently hides failed version lookups but reports explicit re-detect failures', async () => {
  const { lookup } = mockVersionApi();
  lookup.mockImplementation(async () => json({ error: 'Version unavailable' }, 500));
  render(<ModelsPanel context={context} />);
  const button = await screen.findByRole('button', { name: 'Re-detect' });
  await waitFor(() => expect(button).not.toBeDisabled());
  expect(screen.queryByLabelText('Loading client version')).toBeNull();
  expect(screen.queryByText(/Version unavailable/)).toBeNull();
  expect(screen.getByText('Claude · Direct')).toBeInTheDocument();
  fireEvent.click(button);
  expect(await screen.findByText(/Version unavailable/)).toBeInTheDocument();
});

it('does not request versions for a provider without the hook', async () => {
  const posts = mockApi([stored]);
  render(<ModelsPanel context={context} />);
  await screen.findByText('Configured');
  expect(posts.some(p => p.body.action === 'clientVersion')).toBe(false);
  expect(screen.queryByRole('button', { name: 'Re-detect' })).toBeNull();
});

it('unchecks detection when typing an override, saves false and reloads the report', async () => {
  const { posts, lookup } = mockVersionApi();
  render(<ModelsPanel context={context} />);
  await screen.findByText('· v2.1.260 (detected: claude --version)');
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  const form = screen.getByRole('form', { name: 'Edit Work' });
  const detect = within(form).getByRole('checkbox', { name: 'Detect CLI version' });
  expect(detect).toBeChecked();
  fireEvent.change(within(form).getByLabelText('Client version'), { target: { value: '3.0.0' } });
  expect(detect).not.toBeChecked(); expect(detect).toBeDisabled();
  lookup.mockResolvedValue(json({ clientVersion: { version: '3.0.0', source: 'override' } }));
  fireEvent.submit(form);
  await screen.findByText('· v3.0.0 (connection override)');
  expect(posts.find(p => p.body.action === 'update')?.body.config).toEqual({ clientVersion: '3.0.0', detectCliVersion: false });
  expect(screen.queryByRole('button', { name: 'Re-detect' })).toBeNull();
});

it('disables the default detection for a stored override without the detection key', async () => {
  mockVersionApi('claude', { clientVersion: '3.0.0' });
  render(<ModelsPanel context={context} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  const detect = screen.getByRole('checkbox', { name: 'Detect CLI version' });
  expect(detect).not.toBeChecked(); expect(detect).toBeDisabled();
});
