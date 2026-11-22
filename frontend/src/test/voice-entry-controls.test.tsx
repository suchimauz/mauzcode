import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoiceEntryControls, useVoiceEntryHub, type VoiceEntryHandlers } from '../components/mauzcode/VoiceEntryControls';
import { LiveComposer } from '../components/mauzcode/LiveComposer';
import { NewSessionComposer } from '../components/mauzcode/NewSessionComposer';
import type { VoiceCapture } from '../hooks/useVoiceCapture';
import type { VoiceChatRoute, VoiceState } from '../lib/voice';

// Task 3.3: the two footer entry points. No test here may request the microphone or open a voice socket except
// through an explicit handler that starts capture; spies are asserted after every test.
vi.mock('../lib/goal', async importOriginal => ({ ...await importOriginal<typeof import('../lib/goal')>(), getGoal: vi.fn().mockResolvedValue({ version: 1, enabled: false }) }));
vi.mock('../lib/todos', () => ({ getTodos: vi.fn().mockResolvedValue({ todos: null }) }));
vi.mock('../lib/triggers', async importOriginal => ({ ...await importOriginal<typeof import('../lib/triggers')>(), getArmedTriggers: vi.fn().mockResolvedValue({ agentId: '', counts: { at: 0, cron: 0, watch: 0 }, triggers: [] }) }));
vi.mock('../sdk/live', () => ({ subscribeLive: () => () => {} }));
vi.mock('../lib/queue', async importOriginal => ({ ...await importOriginal<typeof import('../lib/queue')>(), getQueue: vi.fn().mockResolvedValue({ items: [] }) }));
vi.mock('../lib/newSession', async importOriginal => ({ ...await importOriginal<typeof import('../lib/newSession')>(), getNewSessionDefaults: vi.fn(async () => ({ defaultModel: 'test:default', csrfToken: 'token' })), submitNewSession: vi.fn() }));
vi.mock('../components/mauzcode/CrabMascot', () => ({ CrabMascot: () => null }));
vi.mock('../lib/live', () => ({ loadLiveClient: async () => {} }));
// The real hook, observed: the test can emit phrase events through the exact `onPhrase` the controls registered.
const hook = vi.hoisted(() => ({ onPhrase: undefined as undefined | ((event: import('../hooks/useVoiceCapture').VoicePhraseEvent) => void) }));
vi.mock('../hooks/useVoiceCapture', async importOriginal => {
  const real = await importOriginal<typeof import('../hooks/useVoiceCapture')>();
  return { ...real, useVoiceCapture: (options: Parameters<typeof real.useVoiceCapture>[0]) => { hook.onPhrase = options.onPhrase; return real.useVoiceCapture(options); } };
});

const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const destination = { kind: 'cloud' as const, label: 'OpenAI Realtime (api.openai.com)' };
const route = { route: 'openai-realtime/work:gpt-live-transcribe', provider: 'openai-realtime', accountName: 'work', connectionId: 'c1', modelId: 'gpt-live-transcribe', label: 'GPT Live Transcribe', destination };
const readyChat: VoiceChatRoute = { agentId: 'chat-1', route: route.route, source: 'default', status: 'ready', destination, model: { id: route.modelId, label: route.label } };
const unconfigured: VoiceChatRoute = { agentId: 'chat-1', route: '', source: 'none', status: 'unconfigured' };
const state = (chat: VoiceChatRoute): VoiceState => ({ providers: [], connections: [], routes: chat.status === 'ready' ? [route] : [], defaultRoute: { route: chat.route, fixed: false }, chat, csrfToken: 't' });
const DEST = /Audio is sent from the MauzCode server to OpenAI Realtime \(api\.openai\.com\)\./;
const INLINE = 'Голосовой ввод в поле сообщения';
const PANEL = 'Голосовой режим';

let getUserMedia: ReturnType<typeof vi.fn>;
let socket: ReturnType<typeof vi.fn>;
let fetcher: ReturnType<typeof vi.fn>;
const original = window.isSecureContext;
function browser({ secure = true, worklet = true } = {}) {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: secure });
  getUserMedia = vi.fn(); socket = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  class Context {} Object.defineProperty(Context.prototype, 'audioWorklet', { value: {} });
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('AudioWorkletNode', worklet ? class {} : undefined);
  vi.stubGlobal('WebSocket', socket);
}
function serve(chat: VoiceChatRoute) {
  fetcher = vi.fn(async (url: string) => {
    if (url.startsWith('/voice/api')) return json(state(chat));
    if (url.includes('/ui-lab-api/models')) return json({ models: [] });
    return json({ budget: null });
  });
  vi.stubGlobal('fetch', fetcher);
}
const voiceRequests = () => fetcher.mock.calls.filter(([url]) => String(url).startsWith('/voice/api')).length;
const handler = () => ({ onActivate: vi.fn(), onPhrase: vi.fn() });

let expectedMicRequests = 0;
beforeEach(() => { browser(); expectedMicRequests = 0; });
afterEach(() => {
  expect(getUserMedia).toHaveBeenCalledTimes(expectedMicRequests);
  expect(socket).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: original });
  sessionStorage.clear();
});

describe('voice entry points in the input bar', () => {
  it('explicit dictation denial leaves the real composer editable and opens no voice socket', async () => {
    serve(readyChat); expectedMicRequests = 1;
    getUserMedia.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));
    render(<LiveComposer agentId="chat-1" running={false} onAccepted={vi.fn()} />);
    const inline = await screen.findByRole('button', { name: INLINE });
    await waitFor(() => expect(inline).not.toHaveAttribute('aria-disabled'));
    const box = screen.getByRole('textbox', { name: 'Сообщение агенту' });
    await userEvent.type(box, 'До отказа'); await userEvent.click(inline);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    await userEvent.click(box); await userEvent.keyboard('{End} и после');
    expect(box).toHaveTextContent('До отказа и после');
    expect(screen.getByRole('button', { name: 'Отправить сообщение' })).toBeEnabled();
  });
  it('sit in the input bar as flat icons before send; DOM and Tab order: settings, voice mode, inline input', async () => {
    serve(readyChat);
    render(<LiveComposer agentId="chat-1" running={false} onAccepted={vi.fn()} />);
    const inline = await screen.findByRole('button', { name: INLINE });
    const panel = screen.getByRole('button', { name: PANEL });
    const picker = await screen.findByRole('button', { name: /Маршрут голосового ввода/ });
    const group = screen.getByRole('group', { name: 'Голос' });
    expect(group).toHaveClass('is-flat'); expect(group).not.toHaveClass('voice-capsule');
    expect(group.closest('.composer-inbar')).not.toBeNull();
    expect(group.nextElementSibling).toBe(screen.getByRole('button', { name: 'Отправить сообщение' }));
    expect([...group.querySelectorAll('button')]).toEqual([picker, panel, inline]);
    // Only inline voice input is the accent-filled primary control.
    expect([...group.querySelectorAll('[data-primary]')]).toEqual([inline]);
    expect(picker.querySelector('svg')).toHaveClass('lucide-settings');
    picker.focus();
    await userEvent.tab(); expect(panel).toHaveFocus();
    await userEvent.tab(); expect(inline).toHaveFocus();
    // Shared route state: the selector's single request serves all three controls.
    expect(voiceRequests()).toBe(1);
  });

  it('names each mode independently and discloses the destination before activation', async () => {
    serve(readyChat);
    render(<VoiceEntryControls agentId="chat-1" handlers={{ inline: handler(), panel: handler() }} />);
    const inline = await screen.findByRole('button', { name: INLINE });
    const panel = screen.getByRole('button', { name: PANEL });
    await waitFor(() => expect(inline).toHaveAccessibleDescription(DEST));
    expect(panel).toHaveAccessibleDescription(DEST);
    expect(inline).not.toHaveAttribute('aria-disabled');
    expect(inline).toHaveAttribute('aria-pressed', 'false');
  });

  it('activates only the chosen mode and routes phrases to its own consumer', async () => {
    serve(readyChat);
    const handlers = { inline: handler(), panel: handler() };
    render(<VoiceEntryControls agentId="chat-1" handlers={handlers} />);
    const inline = await screen.findByRole('button', { name: INLINE });
    await waitFor(() => expect(inline).not.toHaveAttribute('aria-disabled'));
    await userEvent.click(inline);
    expect(handlers.inline.onActivate).toHaveBeenCalledOnce();
    expect(handlers.panel.onActivate).not.toHaveBeenCalled();
    const [capture, chat] = handlers.inline.onActivate.mock.calls[0] as [VoiceCapture, VoiceChatRoute];
    expect(chat).toEqual(readyChat);
    expect(typeof capture.start).toBe('function');
    // The handler, not the entry point, decides to start capture; nothing was requested yet.
    expect(getUserMedia).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: PANEL }));
    expect(handlers.panel.onActivate).toHaveBeenCalledOnce();
    // One shared capture controller serves both modes.
    expect((handlers.panel.onActivate.mock.calls[0][0] as VoiceCapture).start).toBe(capture.start);
  });

  it('phrase events reach only the consumer of the mode that was activated, never the other or none', async () => {
    serve(readyChat);
    const handlers = { inline: handler(), panel: handler() };
    render(<VoiceEntryControls agentId="chat-1" handlers={handlers} />);
    const inline = await screen.findByRole('button', { name: INLINE });
    await waitFor(() => expect(inline).not.toHaveAttribute('aria-disabled'));
    const event = { type: 'phrase' as const, generation: 1, id: 'p1', order: 0, revision: 0, text: 'привет', final: false };
    act(() => hook.onPhrase?.(event));
    expect(handlers.inline.onPhrase).not.toHaveBeenCalled(); expect(handlers.panel.onPhrase).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: PANEL }));
    act(() => hook.onPhrase?.(event));
    expect(handlers.panel.onPhrase).toHaveBeenCalledWith(event);
    expect(handlers.inline.onPhrase).not.toHaveBeenCalled();
    await userEvent.click(inline);
    act(() => hook.onPhrase?.({ ...event, id: 'p2' }));
    expect(handlers.inline.onPhrase).toHaveBeenCalledWith({ ...event, id: 'p2' });
    expect(handlers.panel.onPhrase).toHaveBeenCalledOnce();
  });

  it('keeps the panel as the sole phrase consumer and blocks inline entry across a connected mute', async () => {
    serve(readyChat);
    const handlers = { inline: handler(), panel: handler() };
    function Controls({ state }: { state: VoiceCapture['state'] }) {
      const hub = useVoiceEntryHub({ agentId: 'chat-1' });
      return <VoiceEntryControls agentId="chat-1" handlers={handlers} hub={{ ...hub, capture: { ...hub.capture, state } }} />;
    }
    const view = render(<Controls state="idle" />);
    const panel = await screen.findByRole('button', { name: PANEL });
    const inline = screen.getByRole('button', { name: INLINE });
    await waitFor(() => expect(panel).not.toHaveAttribute('aria-disabled'));
    await userEvent.click(panel);
    const states = ['listening', 'muted', 'listening'] as const;
    for (const [revision, state] of states.entries()) {
      view.rerender(<Controls state={state} />);
      expect(panel).toHaveAttribute('aria-pressed', 'true');
      expect(inline).toHaveAttribute('aria-disabled', 'true');
      await userEvent.click(inline);
      const event = { type: 'phrase' as const, generation: 1, id: 'p', order: 0, revision, text: `word ${revision}`, final: revision === 2 };
      act(() => hook.onPhrase?.(event));
      expect(handlers.panel.onPhrase).toHaveBeenLastCalledWith(event);
    }
    expect(handlers.panel.onActivate).toHaveBeenCalledOnce();
    expect(handlers.inline.onPhrase).not.toHaveBeenCalled();
    expect(handlers.inline.onActivate).not.toHaveBeenCalled();
  });

  it('a mode without a consumer is disabled with an explanation and never activates', async () => {
    serve(readyChat);
    const handlers: VoiceEntryHandlers = { panel: handler() };
    render(<VoiceEntryControls agentId="chat-1" handlers={handlers} />);
    const inline = await screen.findByRole('button', { name: INLINE });
    await waitFor(() => expect(inline).toHaveAccessibleDescription(/Этот режим голосового ввода пока недоступен\./));
    expect(inline).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(inline);
    inline.focus(); await userEvent.keyboard('{Enter} ');
    expect(handlers.panel!.onActivate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: PANEL })).not.toHaveAttribute('aria-disabled');
  });

  it('unconfigured: both stay focusable, explain the setup step and do nothing on activation', async () => {
    serve(unconfigured);
    const handlers = { inline: handler(), panel: handler() };
    render(<VoiceEntryControls agentId="chat-1" handlers={handlers} />);
    for (const name of [INLINE, PANEL]) {
      const button = await screen.findByRole('button', { name });
      await waitFor(() => expect(button).toHaveAccessibleDescription(/Голосовой ввод не настроен/));
      expect(button).toHaveAttribute('aria-disabled', 'true');
      button.focus(); expect(button).toHaveFocus();
      await userEvent.keyboard('{Enter}'); await userEvent.click(button);
    }
    expect(handlers.inline.onActivate).not.toHaveBeenCalled();
    expect(handlers.panel.onActivate).not.toHaveBeenCalled();
  });

  it.each([
    [{ secure: false }, /Микрофон доступен только по HTTPS или на localhost\./],
    [{ worklet: false }, /Браузер не поддерживает захват звука/],
  ])('insecure or unsupported browser %o: disabled with the requirement, destination still disclosed', async (env, reason) => {
    browser(env); serve(readyChat);
    const handlers = { inline: handler(), panel: handler() };
    render(<VoiceEntryControls agentId="chat-1" handlers={handlers} />);
    for (const name of [INLINE, PANEL]) {
      const button = await screen.findByRole('button', { name });
      await waitFor(() => expect(button).toHaveAccessibleDescription(DEST));
      expect(button).toHaveAccessibleDescription(reason);
      expect(button).toHaveAttribute('aria-disabled', 'true');
      await userEvent.click(button);
    }
    expect(handlers.inline.onActivate).not.toHaveBeenCalled();
    expect(handlers.panel.onActivate).not.toHaveBeenCalled();
  });

  it('keyboard navigation and focus alone never activate, request the microphone or open a socket', async () => {
    serve(readyChat);
    const handlers = { inline: handler(), panel: handler() };
    render(<VoiceEntryControls agentId="chat-1" handlers={handlers} />);
    const inline = await screen.findByRole('button', { name: INLINE });
    await waitFor(() => expect(inline).not.toHaveAttribute('aria-disabled'));
    inline.focus();
    await userEvent.tab(); await userEvent.tab({ shift: true }); await userEvent.keyboard('{ArrowRight}{ArrowLeft}');
    expect(handlers.inline.onActivate).not.toHaveBeenCalled();
    expect(handlers.panel.onActivate).not.toHaveBeenCalled();
  });

  it('busy composer disables activation with an explanation', async () => {
    serve(readyChat);
    const handlers = { inline: handler(), panel: handler() };
    render(<VoiceEntryControls agentId="chat-1" busy handlers={handlers} />);
    const inline = await screen.findByRole('button', { name: INLINE });
    await waitFor(() => expect(inline).toHaveAccessibleDescription(/Подождите завершения текущего действия\./));
    await userEvent.click(inline);
    expect(handlers.inline.onActivate).not.toHaveBeenCalled();
  });

  it('non-owners (403) see no voice controls', async () => {
    fetcher = vi.fn(async (url: string) => url.startsWith('/voice/api') ? json({ error: 'Only owners' }, 403) : json({ budget: null }));
    vi.stubGlobal('fetch', fetcher);
    render(<VoiceEntryControls agentId="chat-1" handlers={{ inline: handler(), panel: handler() }} />);
    await waitFor(() => expect(voiceRequests()).toBe(1));
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Голос' })).toBeNull());
  });

  it('absent from read-only and new-session composers, with no voice request', async () => {
    serve(readyChat);
    const ui = render(<LiveComposer agentId="chat-1" running={false} readOnly onAccepted={vi.fn()} />);
    await screen.findByRole('button', { name: /Оценка контекста недоступна/ });
    expect(screen.queryByRole('button', { name: INLINE })).toBeNull();
    expect(screen.queryByRole('button', { name: PANEL })).toBeNull();
    ui.unmount();
    await act(async () => {
      render(<NewSessionComposer draft={{ projectId: 'p1', model: 'test:default', effort: '', text: '', requestKey: 'k' }} onChange={() => {}} projects={[{ id: 'p1', title: 'First', dir: '/first', host: null, chats: [] }]} onCreated={() => {}} onPending={() => {}} />);
    });
    expect(screen.queryByRole('button', { name: INLINE })).toBeNull();
    expect(screen.queryByRole('button', { name: PANEL })).toBeNull();
    expect(voiceRequests()).toBe(0);
  });
});
