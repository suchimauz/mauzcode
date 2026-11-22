import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoicePanel } from '../components/settings/VoicePanel';
import { VoiceRoutePicker, OPEN_SETTINGS_EVENT } from '../components/mauzcode/VoiceRoutePicker';
import { SettingsDialog } from '../components/settings/SettingsDialog';
import type { VoiceChatRoute, VoiceState } from '../lib/voice';

// Task 3.1: voice settings and the per-chat route selector. The browser never sees a key and these surfaces never
// touch the microphone or open a voice socket; both are asserted with spies on every test.
vi.mock('../extensions/pluginRuntime', () => ({ usePluginUi: () => ({ registry: { settingsTabs: [], modelProviders: [] }, loaded: true }) }));

const KEY = 'sk-fixture-never-echoed-0123456789';
const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const provider = {
  id: 'openai-realtime', label: 'OpenAI Realtime transcription', description: 'Streams audio.', destination: { kind: 'cloud' as const, label: 'OpenAI Realtime (api.openai.com or the host of the configured Base URL)' },
  transports: ['direct' as const, 'socks' as const, 'ssh-tunnel' as const],
  fields: [
    { key: 'apiKey', label: 'API key', type: 'secret' as const, required: true },
    { key: 'baseUrl', label: 'Base URL', type: 'url' as const, default: 'https://api.openai.com/v1' },
    { key: 'delay', label: 'Transcription delay', type: 'select' as const, options: [{ value: 'low', label: 'low' }] },
  ],
  models: [{ id: 'gpt-live-transcribe', label: 'GPT Live Transcribe', description: 'Metered per audio minute.' }],
};
// Shapes as the backend projects them for the built-in adapter: each connection discloses the host and port of
// the endpoint it actually uses (standard vs. a custom Base URL), never its path, query or other configuration.
const standard = { kind: 'cloud' as const, label: 'OpenAI Realtime (api.openai.com)' };
const custom = { kind: 'cloud' as const, label: 'Configured endpoint (voice.example.test:8443)' };
const connection = { id: 'c1', provider: 'openai-realtime', providerRegistered: true, accountName: 'work', config: { baseUrl: 'https://api.openai.com/v1' }, transport: { kind: 'direct' as const }, secrets: { apiKey: true }, destination: standard, createdAt: 1, updatedAt: 1 };
const homeConnection = { ...connection, id: 'c2', accountName: 'home', config: { baseUrl: 'https://voice.example.test:8443/private/v1' }, destination: custom };
const route = { route: 'openai-realtime/work:gpt-live-transcribe', provider: 'openai-realtime', accountName: 'work', connectionId: 'c1', modelId: 'gpt-live-transcribe', label: 'GPT Live Transcribe', description: 'Metered per audio minute.', destination: standard };
const home = { ...route, route: 'openai-realtime/home:gpt-live-transcribe', accountName: 'home', connectionId: 'c2', destination: custom };
const empty: VoiceState = { providers: [provider], connections: [], routes: [], defaultRoute: { route: '', fixed: false }, csrfToken: 'csrf-1' };
const configured: VoiceState = { ...empty, connections: [connection, homeConnection], routes: [route, home], defaultRoute: { route: route.route, fixed: false } };
const ready = (source: 'default' | 'override', r = route): VoiceChatRoute => ({ agentId: 'chat-1', route: r.route, source, status: 'ready', destination: r.destination, model: { id: r.modelId, label: r.label } });

let getUserMedia: ReturnType<typeof vi.fn>;
let socket: ReturnType<typeof vi.fn>;
beforeEach(() => {
  getUserMedia = vi.fn(); socket = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  vi.stubGlobal('WebSocket', socket);
});
afterEach(() => {
  // No surface of this task may request the microphone or open a voice session.
  expect(getUserMedia).not.toHaveBeenCalled();
  expect(socket).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

type Call = { url: string; init?: RequestInit; body?: Record<string, unknown> };
function server(handler: (call: Call) => Response | undefined, initial: VoiceState) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const call: Call = { url, init, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    return handler(call) ?? json(initial);
  });
  vi.stubGlobal('fetch', fetch);
  return calls;
}

it('unconfigured settings: explains, offers the add form and saves the key write-only with CSRF', async () => {
  let state = empty;
  const calls = server(call => {
    if (call.body?.action === 'create') { state = { ...configured, connections: [connection], routes: [route], defaultRoute: { route: '', fixed: false } }; return json({ connection }, 201); }
    return json(state);
  }, empty);
  render(<VoicePanel />);
  const picker = await screen.findByLabelText('Voice model for chats');
  expect(picker).toBeDisabled();
  expect(screen.getByText('Add a voice connection first.')).toBeInTheDocument();
  const form = screen.getByRole('form', { name: 'New OpenAI Realtime transcription connection' });
  expect(screen.getByRole('note')).toHaveTextContent('Audio is sent from the MauzCode server to OpenAI Realtime (api.openai.com or the host of the configured Base URL). Metered per audio minute.');
  const key = within(form).getByLabelText('API key');
  expect(key).toHaveAttribute('type', 'password');
  expect(key).toHaveAttribute('autocomplete', 'new-password');
  await userEvent.type(within(form).getByLabelText('Account name'), 'work');
  fireEvent.change(key, { target: { value: KEY } });
  await userEvent.click(within(form).getByRole('button', { name: 'Add connection' }));
  await screen.findByText('work added');
  const create = calls.find(c => c.body?.action === 'create')!;
  expect(create.init?.method).toBe('POST');
  expect((create.init?.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-1');
  expect(create.body).toEqual({ action: 'create', provider: 'openai-realtime', accountName: 'work', config: { baseUrl: 'https://api.openai.com/v1' }, secrets: { apiKey: KEY }, transport: { kind: 'direct' } });
  // The key is not kept in the DOM after a successful save.
  await waitFor(() => expect(document.body.innerHTML).not.toContain(KEY));
  expect(await screen.findByLabelText('Voice model for chats')).toBeEnabled();
});

it('selects, shows and clears the default route; tests and removes a connection after confirmation', async () => {
  let state = configured;
  const calls = server(call => {
    if (call.body?.action === 'setDefaultRoute') { state = { ...state, defaultRoute: { route: String(call.body.route), fixed: false } }; return json({ defaultRoute: state.defaultRoute }); }
    if (call.body?.action === 'test') return json({ result: { status: 'available', reason: 'voice-ok', message: 'Voice connection is ready', checkedAt: 1 } });
    if (call.body?.action === 'remove') { state = { ...state, connections: [state.connections[1]], routes: [home] }; return json({ removed: 'c1' }); }
    return json(state);
  }, configured);
  render(<VoicePanel />);
  const picker = await screen.findByLabelText('Voice model for chats');
  expect(picker).toHaveValue(route.route);
  expect(screen.getByText('Audio is sent from the MauzCode server to OpenAI Realtime (api.openai.com). Metered per audio minute.')).toBeInTheDocument();
  // Each row names where its own connection sends audio: the default endpoint vs. the custom host and port only.
  await userEvent.click(screen.getByRole('button', { name: 'work' }));
  expect(screen.getByRole('article', { name: 'OpenAI Realtime transcription · work' })).toHaveTextContent('Audio is sent from the MauzCode server to OpenAI Realtime (api.openai.com).');
  const own = screen.getByRole('article', { name: 'OpenAI Realtime transcription · home' });
  await userEvent.click(screen.getByRole('button', { name: 'home' }));
  expect(own).toHaveTextContent('Audio is sent from the MauzCode server to Configured endpoint (voice.example.test:8443).');
  expect(own).not.toHaveTextContent('/private');
  fireEvent.change(picker, { target: { value: home.route } });
  await screen.findByText('Default voice route saved');
  await waitFor(() => expect(screen.getByText('Audio is sent from the MauzCode server to Configured endpoint (voice.example.test:8443). Metered per audio minute.')).toBeInTheDocument());
  fireEvent.change(picker, { target: { value: '' } });
  await screen.findByText('Default voice route cleared');
  expect(calls.filter(c => c.body?.action === 'setDefaultRoute').map(c => c.body)).toEqual([{ action: 'setDefaultRoute', route: home.route }, { action: 'setDefaultRoute', route: '' }]);
  await waitFor(() => expect(screen.getByLabelText('Voice model for chats')).toHaveValue(''));
  const card = screen.getByRole('article', { name: 'OpenAI Realtime transcription · work' });
  await userEvent.click(screen.getByRole('button', { name: 'work' }));
  expect(card).not.toHaveTextContent(KEY);
  await userEvent.click(within(card).getByRole('button', { name: 'Test' }));
  expect(await within(card).findByText('Available — Voice connection is ready')).toBeInTheDocument();
  await userEvent.click(within(card).getByRole('button', { name: 'Remove' }));
  const confirm = within(card).getByRole('group', { name: 'Confirm removal' });
  expect(within(confirm).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  await userEvent.keyboard('{Escape}');
  expect(within(card).queryByRole('group', { name: 'Confirm removal' })).toBeNull();
  expect(within(card).getByRole('button', { name: 'Remove' })).toHaveFocus();
  await userEvent.click(within(card).getByRole('button', { name: 'Remove' }));
  await userEvent.click(within(card).getByRole('button', { name: 'Remove connection' }));
  await screen.findByText('work removed');
  expect(calls.find(c => c.body?.action === 'remove')!.body).toEqual({ action: 'remove', id: 'c1', confirmed: true });
});

it('reports an unavailable or file-fixed default honestly and refuses non-owners', async () => {
  server(() => json({ ...configured, defaultRoute: { route: 'openai-realtime/gone:gpt-live-transcribe', fixed: true } }), configured);
  const ui = render(<VoicePanel />);
  const picker = await screen.findByLabelText('Voice model for chats');
  expect(picker).toBeDisabled();
  expect(picker).toHaveValue('openai-realtime/gone:gpt-live-transcribe');
  expect(screen.getByText('Fixed by an instance settings file; change it there.')).toBeInTheDocument();
  ui.unmount();
  server(() => json({ error: 'Only owners can manage voice dictation' }, 403), configured);
  render(<VoicePanel />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Только владелец может управлять голосовым вводом.');
});

it('the Settings dialog lists Voice as a keyboard-reachable built-in tab', async () => {
  server(() => json(empty), empty);
  const onTab = vi.fn();
  const ui = render(<SettingsDialog open tab="agent-presets" onTab={onTab} onOpenChange={() => {}} />);
  const nav = screen.getByRole('navigation', { name: 'Разделы настроек' });
  await userEvent.click(within(nav).getByRole('button', { name: 'Voice' }));
  expect(onTab).toHaveBeenCalledWith('voice');
  ui.rerender(<SettingsDialog open tab="voice" onTab={onTab} onOpenChange={() => {}} />);
  expect(await screen.findByRole('heading', { name: 'Voice' })).toBeInTheDocument();
});

it('chat picker: unconfigured state names the setup step without touching the microphone', async () => {
  server(() => json({ ...empty, chat: { agentId: 'chat-1', route: '', source: 'none', status: 'unconfigured' } }), empty);
  const opened = vi.fn(); window.addEventListener(OPEN_SETTINGS_EVENT, opened);
  render(<VoiceRoutePicker agentId="chat-1" />);
  const trigger = await screen.findByRole('button', { name: /Голосовой ввод не настроен/ });
  await waitFor(() => expect(trigger).toHaveAttribute('data-state', 'unconfigured'));
  trigger.focus(); await userEvent.keyboard('{Enter}');
  const setup = await screen.findByRole('menuitem', { name: 'Настроить голосовой ввод' });
  await waitFor(() => expect(setup).toHaveFocus());
  await userEvent.keyboard('{Enter}');
  expect(opened).toHaveBeenCalledOnce();
  expect((opened.mock.calls[0][0] as CustomEvent).detail).toEqual({ tab: 'voice' });
  window.removeEventListener(OPEN_SETTINGS_EVENT, opened);
});

it('chat picker: shows the destination before capture, saves an override and resets to the default', async () => {
  let chat = ready('default');
  const calls = server(call => {
    if (call.body?.action === 'setChatRoute') { chat = ready('override', home); return json({ chat }); }
    if (call.body?.action === 'clearChatRoute') { chat = ready('default'); return json({ chat }); }
    return json({ ...configured, chat });
  }, configured);
  render(<VoiceRoutePicker agentId="chat-1" />);
  const trigger = await screen.findByRole('button', { name: /GPT Live Transcribe · work, по умолчанию\. Audio is sent from the MauzCode server to OpenAI Realtime \(api\.openai\.com\)\./ });
  expect(calls[0].url).toBe('/voice/api?agentId=chat-1');
  await userEvent.click(trigger);
  const menu = await screen.findByRole('menu', { name: 'Голосовой маршрут чата' });
  expect(within(menu).getByRole('menuitemradio', { name: /По умолчанию/ })).toHaveAttribute('aria-checked', 'true');
  // Before any capture the menu names each route's own destination: host and port only, no path.
  expect(within(menu).getByRole('menuitemradio', { name: /home/ })).toHaveTextContent('home · Configured endpoint (voice.example.test:8443)');
  expect(within(menu).getByRole('menuitemradio', { name: /^GPT Live Transcribe.*work/ })).toHaveTextContent('work · OpenAI Realtime (api.openai.com)');
  expect(menu).not.toHaveTextContent('/private');
  await userEvent.click(within(menu).getByRole('menuitemradio', { name: /home/ }));
  const own = await screen.findByRole('button', { name: /GPT Live Transcribe · home, выбран для этого чата\. Audio is sent from the MauzCode server to Configured endpoint \(voice\.example\.test:8443\)\./ });
  expect(own.getAttribute('aria-label') ?? own.textContent).not.toContain('/private');
  const set = calls.find(c => c.body?.action === 'setChatRoute')!;
  expect(set.body).toEqual({ action: 'setChatRoute', agentId: 'chat-1', route: home.route });
  expect((set.init?.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-1');
  await userEvent.click(screen.getByRole('button', { name: /выбран для этого чата/ }));
  await userEvent.click(within(await screen.findByRole('menu', { name: 'Голосовой маршрут чата' })).getByRole('menuitemradio', { name: /По умолчанию/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: /work, по умолчанию/ })).toBeInTheDocument());
  expect(calls.find(c => c.body?.action === 'clearChatRoute')!.body).toEqual({ action: 'clearChatRoute', agentId: 'chat-1' });
});

it('chat picker: an unavailable selection is reported, not replaced; non-owners see nothing', async () => {
  server(() => json({ ...configured, chat: { agentId: 'chat-1', route: 'openai-realtime/gone:gpt-live-transcribe', source: 'override', status: 'unavailable', reason: 'unknown-connection' } }), configured);
  const ui = render(<VoiceRoutePicker agentId="chat-1" />);
  const trigger = await screen.findByRole('button', { name: /выбран для этого чата недоступен \(подключение удалено\)/ });
  expect(trigger).toHaveAttribute('data-state', 'unavailable');
  ui.unmount();
  server(() => json({ error: 'Only owners can manage voice dictation' }, 403), configured);
  const { container } = render(<VoiceRoutePicker agentId="chat-1" />);
  await waitFor(() => expect(container).toBeEmptyDOMElement());
});

it('transport: offers only declared kinds and saved references, round-trips them and flags an unavailable one', async () => {
  const proxy = { id: '11111111-1111-4111-8111-111111111111', name: 'office', host: '127.0.0.1', port: 1080 };
  const routed = { ...connection, transport: { kind: 'socks' as const, proxyId: proxy.id } };
  const stale = { ...homeConnection, transport: { kind: 'socks' as const, proxyId: '22222222-2222-4222-8222-222222222222' } };
  let state: VoiceState = { ...configured, connections: [routed, stale], proxies: [proxy], instances: ['builder'] };
  const calls = server(call => {
    if (call.body?.action === 'update') return json({ connection: { ...routed, transport: call.body.transport } });
    return json(state);
  }, state);
  render(<VoicePanel />);
  const work = await screen.findByRole('article', { name: 'OpenAI Realtime transcription · work' });
  await userEvent.click(within(work).getByRole('button', { name: 'work' }));
  expect(within(work).getByText('Network: SOCKS5 · office')).toBeInTheDocument();
  const homeCard = screen.getByRole('article', { name: 'OpenAI Realtime transcription · home' });
  await userEvent.click(within(homeCard).getByRole('button', { name: 'home' }));
  expect(within(homeCard).getByText('Network: SOCKS5 · saved proxy unavailable')).toBeInTheDocument();
  // The stale reference stays selected and is explained, not silently replaced.
  await userEvent.click(within(homeCard).getByRole('button', { name: 'Edit' }));
  const staleForm = within(homeCard).getByRole('form', { name: 'Edit home' });
  expect(within(staleForm).getByLabelText('Saved proxy')).toHaveValue(stale.transport.proxyId);
  expect(within(staleForm).getByText(/no longer exists/)).toBeInTheDocument();
  await userEvent.click(within(homeCard).getByRole('button', { name: 'Cancel' }));
  // Reopening the routed connection shows the saved selection; an unrelated edit keeps it.
  await userEvent.click(within(work).getByRole('button', { name: 'work' }));
  await userEvent.click(within(work).getByRole('button', { name: 'Edit' }));
  const form = within(work).getByRole('form', { name: 'Edit work' });
  const radios = within(form).getAllByRole('radio');
  expect(radios.map(r => (r as HTMLInputElement).value)).toEqual(['direct', 'socks', 'ssh-tunnel']);
  expect(within(form).getByRole('radio', { name: 'SOCKS5 proxy' })).toBeChecked();
  expect(within(form).getByLabelText('Saved proxy')).toHaveValue(proxy.id);
  await userEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(calls.some(c => c.body?.action === 'update')).toBe(true));
  expect(calls.find(c => c.body?.action === 'update')!.body!.transport).toEqual({ kind: 'socks', proxyId: proxy.id });
  // Switching to an SSH instance sends only the saved name, never credentials.
  state = { ...state };
  await userEvent.click(within(work).getByRole('button', { name: 'Edit' }));
  const again = within(work).getByRole('form', { name: 'Edit work' });
  await userEvent.click(within(again).getByRole('radio', { name: 'SSH tunnel' }));
  expect(within(again).getByLabelText('SSH instance')).toHaveValue('builder');
  await userEvent.click(within(again).getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(calls.filter(c => c.body?.action === 'update').length).toBe(2));
  expect(calls.filter(c => c.body?.action === 'update')[1]!.body!.transport).toEqual({ kind: 'ssh-tunnel', instance: 'builder' });
});

it('transport: a direct-only provider offers no proxy or tunnel choice', async () => {
  const legacy = { ...provider, id: 'legacy', label: 'Legacy recognizer', transports: ['direct' as const] };
  server(() => undefined, { ...empty, providers: [legacy] });
  render(<VoicePanel />);
  const form = await screen.findByRole('form', { name: 'New Legacy recognizer connection' });
  expect(within(form).getAllByRole('radio').map(r => (r as HTMLInputElement).value)).toEqual(['direct']);
  expect(within(form).queryByLabelText('Saved proxy')).toBeNull();
});

it('shows Default route, Connections and Errors groups in order, with an add row in Connections', async () => {
  server(() => undefined, configured);
  render(<VoicePanel />);
  await screen.findByLabelText('Voice model for chats');
  const titles = [...document.querySelectorAll('.settings-group-title')].map(t => t.textContent);
  expect(titles).toEqual(['Default route', 'Connections', 'Errors']);
  const connections = screen.getByRole('region', { name: 'Connections' });
  expect(within(connections).getAllByRole('article').length).toBe(configured.connections.length);
  expect(within(connections).getByRole('button', { name: 'Add voice connection' })).toBeVisible();
});
