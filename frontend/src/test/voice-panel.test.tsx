import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiveComposer } from '../components/mauzcode/LiveComposer';
import type { VoiceCaptureError, VoiceCaptureState, VoicePhraseEvent } from '../hooks/useVoiceCapture';
import type { VoiceChatRoute, VoiceState } from '../lib/voice';

// Task 3.5 through the real composer path: LiveComposer → useVoiceEntryHub → VoiceEntryControls / useVoicePanel →
// VoicePanel, editing the same draft as CommandEditor. Only the capture controller is a controllable fake: no
// microphone, socket, network or real message is touched (use-voice-capture.test.tsx covers the controller itself).
const mauzcode = vi.hoisted(() => ({ sendMessage: vi.fn(), stopAgent: vi.fn() }));
vi.mock('../lib/mauzcode', async importOriginal => ({ ...await importOriginal<typeof import('../lib/mauzcode')>(), ...mauzcode }));
vi.mock('../lib/goal', async importOriginal => ({ ...await importOriginal<typeof import('../lib/goal')>(), getGoal: vi.fn().mockResolvedValue({ version: 1, enabled: false }) }));
vi.mock('../lib/todos', () => ({ getTodos: vi.fn().mockResolvedValue({ todos: null }) }));
vi.mock('../lib/triggers', async importOriginal => ({ ...await importOriginal<typeof import('../lib/triggers')>(), getArmedTriggers: vi.fn().mockResolvedValue({ agentId: '', counts: { at: 0, cron: 0, watch: 0 }, triggers: [] }) }));
vi.mock('../sdk/live', () => ({ subscribeLive: () => () => {} }));
const queueLib = vi.hoisted(() => ({ enqueueMessage: vi.fn() }));
vi.mock('../lib/queue', async importOriginal => ({ ...await importOriginal<typeof import('../lib/queue')>(), getQueue: vi.fn().mockResolvedValue({ items: [] }), ...queueLib }));

type Snapshot = { state: VoiceCaptureState; remainingMs: number | null; error: VoiceCaptureError | null };
type Fake = {
  generation: number; snap: Snapshot; onPhrase?: (event: VoicePhraseEvent) => void; set?: (s: Partial<Snapshot>) => void;
  start: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; finish: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn>; resume: ReturnType<typeof vi.fn>;
  settle?: (ok: boolean) => void;
};
const fake = vi.hoisted(() => ({ current: null as unknown as Fake, controllers: 0 }));
vi.mock('../hooks/useVoiceCapture', async () => {
  const React = await import('react');
  return {
    useVoiceCapture: ({ onPhrase }: { onPhrase?: (event: VoicePhraseEvent) => void }) => {
      const [snap, setSnap] = React.useState<Snapshot>({ state: 'idle', remainingMs: null, error: null });
      React.useEffect(() => { fake.controllers++; return () => { fake.controllers--; }; }, []);
      const f = fake.current; f.onPhrase = onPhrase; f.snap = snap; f.set = patch => setSnap(prev => ({ ...prev, ...patch }));
      return { support: { ok: true }, ...snap, session: null, generation: f.generation, start: f.start, pause: f.pause, resume: f.resume, finish: f.finish, cancel: f.cancel };
    },
  };
});
function newFake(): Fake {
  const f: Fake = {
    generation: 0, snap: { state: 'idle', remainingMs: null, error: null },
    start: vi.fn(async () => { f.generation++; act(() => f.set?.({ state: 'listening', remainingMs: 300_000, error: null })); }),
    pause: vi.fn(() => { act(() => f.set?.({ state: 'finalizing' })); return new Promise<boolean>(resolve => { f.settle = ok => { act(() => f.set?.(ok ? { state: 'paused', remainingMs: null } : { state: 'error', remainingMs: null, error: { code: 'provider', message: 'The voice provider failed.' } })); resolve(ok); }; }); }),
    finish: vi.fn(async () => true),
    resume: vi.fn(),
    cancel: vi.fn(() => { f.generation++; act(() => f.set?.({ state: 'idle', remainingMs: null, error: null })); }),
  };
  return f;
}
const say = (id: string, order: number, revision: number, text: string, final = false, generation = fake.current.generation) =>
  act(() => fake.current.onPhrase?.({ type: 'phrase', generation, id, order, revision, text, final }));

const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const destination = { kind: 'cloud' as const, label: 'OpenAI Realtime (api.openai.com)' };
const route = { route: 'openai-realtime/work:gpt-live-transcribe', provider: 'openai-realtime', accountName: 'work', connectionId: 'c1', modelId: 'gpt-live-transcribe', label: 'GPT Live Transcribe', destination };
const chat: VoiceChatRoute = { agentId: 'chat-1', route: route.route, source: 'default', status: 'ready', destination, model: { id: route.modelId, label: route.label } };
const state: VoiceState = { providers: [], connections: [], routes: [route], defaultRoute: { route: route.route, fixed: false }, chat, csrfToken: 't' };
const INLINE = 'Голосовой ввод в поле сообщения';
const MODE = 'Голосовой режим';

beforeEach(() => {
  fake.current = newFake();
  mauzcode.sendMessage.mockReset(); queueLib.enqueueMessage.mockReset();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).startsWith('/voice/api') ? json(state) : String(url).includes('/ui-lab-api/models') ? json({ models: [] }) : json({ budget: null })));
});
afterEach(() => {
  // These controls never submit on their own. Explicit sends run against synthetic media in voice-submission.test.tsx.
  expect(mauzcode.sendMessage).not.toHaveBeenCalled();
  expect(queueLib.enqueueMessage).not.toHaveBeenCalled();
  vi.unstubAllGlobals(); sessionStorage.clear();
});

const editor = () => screen.getByRole('textbox', { name: 'Сообщение агенту', hidden: true });
const panel = () => screen.getByRole('region', { name: MODE });
/** The footer entry point; it is unmounted while voice mode is open, so re-query it after leaving. */
const modeButton = () => screen.getByRole('button', { name: MODE });
const live = () => panel().querySelector('[aria-live="polite"]')!;
async function mount(text = '', files = false) {
  if (text) sessionStorage.setItem('mauzcode-ui-draft:chat-1', JSON.stringify({ text, key: 'k0' }));
  const view = render(<LiveComposer agentId="chat-1" running={false} onAccepted={vi.fn()} />);
  const entry = await screen.findByRole('button', { name: MODE });
  await waitFor(() => expect(entry).not.toHaveAttribute('aria-disabled'));
  if (files) {
    await userEvent.upload(screen.getByLabelText('Добавить файлы') as HTMLInputElement, new File(['x'], 'plan.txt', { type: 'text/plain' }));
    await screen.findByRole('group', { name: 'Прикреплённые файлы' });
  }
  return { view, entry };
}
function caretAt(offset: number) {
  const el = editor(); el.focus();
  const range = document.createRange(); range.setStart(el.firstChild ?? el, offset); range.collapse(true);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
}
const key = (target: Element, k: string) => fireEvent.keyDown(target, { key: k });

describe('voice panel in the live composer', () => {
  it('replaces the editor, uses the one capture controller, focuses itself and shows state and time', async () => {
    const { entry } = await mount('note');
    expect(fake.controllers).toBe(1);
    await userEvent.click(entry);
    expect(fake.current.start).toHaveBeenCalledOnce();
    expect(fake.controllers).toBe(1);
    expect(panel()).toHaveFocus();
    expect(editor().closest('[hidden]')).not.toBeNull();
    // The footer with both entry points is unmounted while voice mode is open.
    expect(entry).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: INLINE })).toBeNull();
    // The state is not a visible heading but stays the panel's description for assistive technology.
    expect(panel()).toHaveAccessibleDescription(/Идёт запись/);
    expect(panel()).toHaveTextContent('осталось 5:00');
    for (const name of ['Пауза', 'Очистить диктовку', 'Отправить', 'Выйти']) expect(within(panel()).getByRole('button', { name })).toHaveAttribute('title');
  });

  it('dictates into the same draft, pauses and resumes with Space, keeps text and attachments', async () => {
    const { entry } = await mount('Typed', true);
    caretAt(5);
    await userEvent.click(entry);
    within(panel()).getByRole('group', { name: 'Прикреплённые файлы' });
    say('a', 0, 0, 'hello');
    say('a', 0, 1, 'hello there', true);
    expect(within(panel()).getByRole('group', { name: 'Текст сообщения' })).toHaveTextContent('Typed hello there');
    expect(editor()).toHaveTextContent('Typed hello there');
    key(panel(), ' ');
    expect(fake.current.pause).toHaveBeenCalledOnce();
    // The pause finalizes the current phrase before the microphone is off.
    say('b', 1, 0, 'again', true);
    await act(async () => { fake.current.settle!(true); });
    expect(panel()).toHaveAccessibleDescription(/Пауза/);
    expect(within(panel()).getByRole('button', { name: /Продолжить запись/ })).toBeInTheDocument();
    // Late events of the paused generation change nothing.
    say('b', 1, 1, 'LATE', true); say('z', 9, 0, 'ghost');
    key(panel(), ' ');
    expect(fake.current.start).toHaveBeenCalledTimes(2);
    say('a', 0, 0, 'more', true);
    expect(editor()).toHaveTextContent(/^Typed hello there again more$/);
    expect(JSON.parse(sessionStorage.getItem('mauzcode-ui-draft:chat-1')!).text).toBe('Typed hello there again more');
    key(panel(), 'Escape');
    expect(fake.current.cancel).toHaveBeenCalledOnce();
    expect(screen.queryByRole('region', { name: MODE })).toBeNull();
    expect(screen.getByRole('group', { name: 'Прикреплённые файлы' })).toHaveTextContent('plan.txt');
    await waitFor(() => expect(editor()).toHaveFocus());
    expect(editor()).toHaveTextContent(/^Typed hello there again more$/);
  });

  it('clears only surviving dictation of this draft; typed text, manual corrections and attachments stay', async () => {
    const { entry } = await mount('Keep this', true);
    caretAt(9);
    await userEvent.click(entry);
    say('a', 0, 0, 'one', true);
    key(panel(), ' '); await act(async () => { fake.current.settle!(true); });
    key(panel(), ' ');
    say('a', 0, 0, 'two', true);
    expect(editor()).toHaveTextContent(/^Keep this one two$/);
    await userEvent.click(within(panel()).getByRole('button', { name: 'Очистить диктовку' }));
    expect(editor()).toHaveTextContent(/^Keep this$/);
    expect(within(panel()).getByRole('button', { name: 'Очистить диктовку' })).toHaveAttribute('aria-disabled', 'true');
    // The session keeps running: a new phrase still lands, a revision of a cleared one does not.
    say('a', 0, 1, 'two again', true); say('b', 1, 0, 'three', true);
    expect(editor()).toHaveTextContent(/^Keep this three$/);
    expect(screen.getByRole('group', { name: 'Прикреплённые файлы' })).toHaveTextContent('plan.txt');
    // Escape returns the visible text to the editor without sending.
    await userEvent.click(within(panel()).getByRole('button', { name: /Выйти/ }));
    expect(editor()).toHaveTextContent(/^Keep this three$/);
    await waitFor(() => expect(editor()).toHaveFocus());
  });

  it('a manual correction made while the panel is open survives clear', async () => {
    const { entry } = await mount('A');
    caretAt(1);
    await userEvent.click(entry);
    say('a', 0, 0, 'helo', true);
    key(panel(), 'Escape');
    // Correct the dictated word in the editor, then reopen the panel and clear: the corrected word is the user's.
    const el = editor(); el.firstChild!.textContent = 'A hello'; fireEvent.input(el);
    await userEvent.click(await screen.findByRole('button', { name: MODE }));
    say('a', 0, 0, 'new', true);
    await userEvent.click(within(panel()).getByRole('button', { name: 'Очистить диктовку' }));
    expect(editor()).toHaveTextContent(/^A hello$/);
  });

  it('clear covers every unedited phrase of this draft across Escape → editing → re-entry; corrections stay', async () => {
    const { entry } = await mount('Typed', true);
    caretAt(5);
    await userEvent.click(entry);
    say('a', 0, 0, 'alpha', true); say('b', 1, 0, 'beta', true);
    expect(editor()).toHaveTextContent(/^Typed alpha beta$/);
    key(panel(), 'Escape');
    await waitFor(() => expect(editor()).toHaveFocus());
    // Correct one dictated phrase by hand: only that phrase becomes the user's text.
    const el = editor(); el.firstChild!.textContent = 'Typed alpha BETA'; fireEvent.input(el);
    // Late events of the finished capture never revive phrases.
    say('a', 0, 1, 'ALPHA LATE', true, fake.current.generation - 1); say('c', 2, 0, 'ghost', true, fake.current.generation - 1);
    expect(editor()).toHaveTextContent(/^Typed alpha BETA$/);
    await userEvent.click(modeButton());
    const clearButton = within(panel()).getByRole('button', { name: 'Очистить диктовку' });
    expect(clearButton).not.toHaveAttribute('aria-disabled');
    await userEvent.click(clearButton);
    expect(editor()).toHaveTextContent(/^Typed BETA$/);
    expect(JSON.parse(sessionStorage.getItem('mauzcode-ui-draft:chat-1')!).text).toBe('Typed BETA');
    expect(clearButton).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('group', { name: 'Прикреплённые файлы' })).toHaveTextContent('plan.txt');
    key(panel(), 'Escape');
    expect(editor()).toHaveTextContent(/^Typed BETA$/);
  });

  it('clear in the panel also removes unedited inline dictation of the same draft', async () => {
    const { entry } = await mount('Note', true);
    // Finishing inline capture releases the microphone, as the real controller does.
    fake.current.finish.mockImplementation(async () => { act(() => fake.current.set?.({ state: 'idle', remainingMs: null })); return true; });
    caretAt(4);
    const inline = screen.getByRole('button', { name: INLINE });
    await userEvent.click(inline);
    say('a', 0, 0, 'spoken', true); say('b', 1, 0, 'fixme', true);
    await userEvent.click(inline);
    await waitFor(() => expect(fake.current.finish).toHaveBeenCalledOnce());
    expect(editor()).toHaveTextContent(/^Note spoken fixme$/);
    const el = editor(); el.firstChild!.textContent = 'Note spoken fixed'; fireEvent.input(el);
    await waitFor(() => expect(entry).not.toHaveAttribute('aria-disabled'));
    await userEvent.click(entry);
    say('a', 0, 0, 'panel', true);
    expect(editor()).toHaveTextContent(/^Note spoken fixed panel$/);
    await userEvent.click(within(panel()).getByRole('button', { name: 'Очистить диктовку' }));
    expect(editor()).toHaveTextContent(/^Note fixed$/);
    expect(screen.getByRole('group', { name: 'Прикреплённые файлы' })).toHaveTextContent('plan.txt');
  });

  it('ignores keys outside the panel and leaves native keys to its buttons and text fields', async () => {
    const { entry } = await mount('x');
    await userEvent.click(entry);
    // Outside the panel: another button on the page and the document body.
    const outside = document.body.appendChild(document.createElement('button'));
    key(outside, ' '); key(document.body, ' '); key(outside, 'Escape');
    outside.remove();
    expect(fake.current.pause).not.toHaveBeenCalled();
    expect(panel()).toBeInTheDocument();
    // Inside: Space and Enter on a focused panel button are its own activation, not shortcuts.
    const clearButton = within(panel()).getByRole('button', { name: 'Очистить диктовку' });
    key(clearButton, ' '); key(clearButton, 'Enter');
    expect(fake.current.pause).not.toHaveBeenCalled();
    // A text field inside the panel (attachments, future inputs) keeps every key, including Escape.
    const field = document.createElement('input'); panel().appendChild(field);
    key(field, ' '); key(field, 'Escape');
    const editable = document.createElement('div'); editable.setAttribute('contenteditable', 'true'); panel().appendChild(editable);
    key(editable, ' ');
    expect(fake.current.pause).not.toHaveBeenCalled();
    expect(fake.current.cancel).not.toHaveBeenCalled();
    field.remove(); editable.remove();
    // Escape on a focused panel button is that button's key too; leaving has its own labelled button.
    key(clearButton, 'Escape');
    expect(fake.current.cancel).not.toHaveBeenCalled();
    expect(panel()).toBeInTheDocument();
    // The transcript is focusable for reading; shortcuts still work there, as on the panel itself.
    key(within(panel()).getByRole('group', { name: 'Текст сообщения' }), ' ');
    expect(fake.current.pause).toHaveBeenCalledOnce();
    key(within(panel()).getByRole('group', { name: 'Текст сообщения' }), 'Escape');
    expect(screen.queryByRole('region', { name: MODE })).toBeNull();
  });

  it('does not treat Shift+Enter, composing Enter or held Enter as a panel send', async () => {
    const { entry } = await mount('draft');
    await userEvent.click(entry);
    for (const extra of [{ shiftKey: true }, { isComposing: true }, { repeat: true }]) fireEvent.keyDown(panel(), { key: 'Enter', ...extra });
    expect(fake.current.pause).not.toHaveBeenCalled();
    expect(within(panel()).getByRole('button', { name: /Отправить/ })).toBeEnabled();
  });

  it('announces only state changes and time thresholds, never phrase text', async () => {
    const { entry } = await mount();
    await userEvent.click(entry);
    const region = live();
    expect(panel().querySelectorAll('[aria-live]')).toHaveLength(1);
    expect(region).toHaveTextContent('Идёт запись');
    const seen: string[] = [];
    const observer = new MutationObserver(() => seen.push(region.textContent ?? '')); observer.observe(region, { subtree: true, childList: true, characterData: true });
    say('a', 0, 0, 'secret words'); say('a', 0, 1, 'secret words here', true); say('b', 1, 0, 'more speech', true);
    // Each step is flushed separately so the observer sees every announcement, not only the last one.
    for (const remainingMs of [120_000, 59_000, 58_000, 9_000, 8_000]) await act(async () => { fake.current.set!({ remainingMs }); });
    await act(async () => { key(panel(), ' '); });
    await act(async () => { fake.current.settle!(true); });
    await act(async () => { await Promise.resolve(); });
    observer.disconnect();
    expect(seen.join('|')).not.toMatch(/secret|speech/);
    expect(seen.filter((v, i) => v && v !== seen[i - 1])).toEqual(['Осталась 1 минута записи', 'Осталось 10 секунд записи', 'Пауза']);
    // Phrase text is available by navigating the panel.
    expect(within(panel()).getByRole('group', { name: 'Текст сообщения' })).toHaveTextContent('secret words here more speech');
  });

  it('announces errors and a move to another tab, keeping the text and allowing resume', async () => {
    const { entry } = await mount('k');
    await userEvent.click(entry);
    say('a', 0, 0, 'said', true);
    act(() => fake.current.set!({ state: 'error', remainingMs: null, error: { code: 'superseded', message: 'Dictation moved to another tab.' } }));
    expect(live()).toHaveTextContent('Диктовка перешла в другую вкладку');
    expect(editor()).toHaveTextContent(/^k said$/);
    key(panel(), ' ');
    expect(fake.current.start).toHaveBeenCalledTimes(2);
    expect(live()).toHaveTextContent('Идёт запись');
  });

  it('leaving the chat or losing edit access stops capture; late events reach no draft', async () => {
    const { view, entry } = await mount('base');
    await userEvent.click(entry);
    say('a', 0, 0, 'kept', true);
    view.rerender(<LiveComposer agentId="chat-1" readOnly running={false} onAccepted={vi.fn()} />);
    expect(fake.current.cancel).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('region', { name: MODE })).toBeNull());
    say('b', 1, 0, 'after', true, fake.current.generation - 1);
    expect(editor()).toHaveTextContent(/^base kept$/);
    view.rerender(<LiveComposer agentId="chat-2" running={false} onAccepted={vi.fn()} />);
    say('c', 2, 0, 'leaked', true);
    await screen.findByRole('button', { name: MODE });
    expect(editor()).not.toHaveTextContent('leaked');
  });

  it('shows nothing of the composer below the panel and restores it on exit', async () => {
    sessionStorage.setItem('mauzcode-ui-draft:chat-1', JSON.stringify({ text: '/compact', key: 'k0' }));
    mauzcode.stopAgent.mockReset();
    const view = render(<LiveComposer agentId="chat-1" running onAccepted={vi.fn()} />);
    const entry = await screen.findByRole('button', { name: MODE });
    await waitFor(() => expect(entry).not.toHaveAttribute('aria-disabled'));
    await userEvent.click(entry);
    const footer = () => view.container.querySelector('.composer-footer');
    expect(panel()).toBeInTheDocument();
    expect(footer()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Остановить выполнение' })).toBeNull();
    expect(view.container.querySelector('.transcript-notice, .connection-error')).toBeNull();
    // Only the panel follows the docks: nothing is rendered after it except the hidden editor and file input.
    const after = [...view.container.querySelectorAll('.voice-panel ~ *, .composer-input-anchor ~ *')].filter(el => !(el as HTMLElement).hidden);
    expect(after).toEqual([]);
    key(panel(), 'Escape');
    expect(screen.queryByRole('region', { name: MODE })).toBeNull();
    expect(footer()).not.toBeNull();
    expect(await screen.findByRole('button', { name: MODE })).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(editor()).toHaveFocus());
  });

  it('clear is disabled with a reason on desktop and hidden on touch when nothing can be cleared', async () => {
    const { entry } = await mount('base');
    await userEvent.click(entry);
    const clear = () => within(panel()).getByRole('button', { name: 'Очистить диктовку' });
    expect(clear()).toHaveAttribute('aria-disabled', 'true');
    expect(clear()).toHaveAttribute('title', 'Надиктованного текста нет');
    expect(clear()).toBeVisible();
    say('a', 0, 0, 'spoken', true);
    expect(clear()).not.toHaveAttribute('aria-disabled');
    key(panel(), 'Escape');
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({ ...matchMedia(query), matches: query === '(pointer: coarse)' })) as typeof window.matchMedia;
    try {
      await userEvent.click(await screen.findByRole('button', { name: MODE }));
      expect(clear()).not.toHaveAttribute('hidden');
      await userEvent.click(clear());
      expect(editor()).toHaveTextContent(/^base$/);
      // Nothing left to clear: the touch layout hides the control (not focusable, out of the accessibility tree).
      expect(within(panel()).queryByRole('button', { name: 'Очистить диктовку' })).toBeNull();
      expect(panel().querySelector('.voice-panel-clear')).toHaveAttribute('hidden');
    } finally { window.matchMedia = matchMedia; }
  });

  it('a send failure is shown in the panel error line, not below it', async () => {
    const { entry } = await mount('hello');
    await userEvent.click(entry);
    act(() => fake.current.set!({ state: 'paused', remainingMs: null }));
    mauzcode.sendMessage.mockRejectedValueOnce(new Error('Network down'));
    await userEvent.click(within(panel()).getByRole('button', { name: 'Отправить' }));
    const line = await within(panel()).findByRole('alert');
    expect(line).toHaveTextContent('Network down');
    expect(panel()).toHaveAttribute('data-error', 'true');
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1);
    mauzcode.sendMessage.mockReset();
  });
});
