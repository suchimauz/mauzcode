import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoicePanel, type VoicePanelProps } from '../components/mauzcode/VoicePanel';
import { LiveComposer } from '../components/mauzcode/LiveComposer';
import type { VoiceCapture, VoiceCaptureError, VoiceCaptureState, VoicePhraseEvent } from '../hooks/useVoiceCapture';
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
  start: Mock<VoiceCapture['start']>; setMuted: Mock<VoiceCapture['setMuted']>; finish: Mock<VoiceCapture['finish']>; cancel: Mock<VoiceCapture['cancel']>;
};
const fake = vi.hoisted(() => ({ current: null as unknown as Fake, controllers: 0 }));
vi.mock('../hooks/useVoiceCapture', async () => {
  const React = await import('react');
  return {
    useVoiceCapture: ({ onPhrase }: { onPhrase?: (event: VoicePhraseEvent) => void }) => {
      const [snap, setSnap] = React.useState<Snapshot>({ state: 'idle', remainingMs: null, error: null });
      React.useEffect(() => { fake.controllers++; return () => { fake.controllers--; }; }, []);
      const f = fake.current; f.onPhrase = onPhrase; f.snap = snap; f.set = patch => setSnap(prev => ({ ...prev, ...patch }));
      return { support: { ok: true }, ...snap, session: null, generation: f.generation, start: f.start, setMuted: f.setMuted, finish: f.finish, cancel: f.cancel };
    },
  };
});
function newFake(): Fake {
  const f: Fake = {
    generation: 0, snap: { state: 'idle', remainingMs: null, error: null },
    start: vi.fn(async () => { f.generation++; act(() => f.set?.({ state: 'listening', remainingMs: 300_000, error: null })); }),
    setMuted: vi.fn((muted: boolean) => { act(() => f.set?.({ state: muted ? 'muted' : 'listening' })); }),
    finish: vi.fn(async () => true),
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
  if (!window.PointerEvent) vi.stubGlobal('PointerEvent', class extends MouseEvent {
    readonly isPrimary: boolean; readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.isPrimary = init.isPrimary ?? false; this.pointerId = init.pointerId ?? 0; }
  });
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
    // The editor's bar with both entry points is unmounted while voice mode is open.
    expect(entry).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: INLINE })).toBeNull();
    // The state is not a visible heading but stays the panel's description for assistive technology.
    expect(panel()).toHaveAccessibleDescription(/Идёт запись/);
    expect(panel()).toHaveTextContent('осталось 5:00');
    for (const name of ['Выключить микрофон', 'Удалить последнее слово', 'Отправить', 'Выйти']) expect(within(panel()).getByRole('button', { name })).toHaveAttribute('title');
    // Same input frame: disabled add button on the first line, bar with the model, controls in order, no hint line.
    expect(panel()).toHaveClass('message-input');
    expect(within(panel()).getByRole('button', { name: 'Добавить' })).toBeDisabled();
    const bar = within(panel()).getByRole('group', { name: 'Управление голосовым режимом' });
    expect(bar).toHaveClass('composer-inbar');
    expect([...bar.querySelectorAll('.voice-panel-button')].map(b => b.getAttribute('aria-label'))).toEqual(['Удалить последнее слово', 'Выключить микрофон', 'Выйти', 'Отправить']);
    expect(within(panel()).getByRole('button', { name: 'Выключить микрофон' })).toHaveAttribute('title', 'Выключить микрофон (Пробел)');
    expect(within(panel()).getByRole('button', { name: 'Отправить' })).toHaveAttribute('title', 'Отправить (Enter)');
    expect(within(panel()).getByRole('button', { name: 'Выйти' })).toHaveAttribute('title', 'Выйти (Esc)');
    expect(panel().querySelector('.voice-panel-hints, kbd')).toBeNull();
  });

  it('dictates into the same draft, mutes and unmutes with Space, keeps text and attachments', async () => {
    const { entry } = await mount('Typed', true);
    caretAt(5);
    await userEvent.click(entry);
    within(panel()).getByRole('group', { name: 'Прикреплённые файлы' });
    say('a', 0, 0, 'hello');
    say('a', 0, 1, 'hello there', true);
    expect(within(panel()).getByRole('group', { name: 'Текст сообщения' })).toHaveTextContent('Typed hello there');
    expect(editor()).toHaveTextContent('Typed hello there');
    key(panel(), ' ');
    expect(fake.current.setMuted).toHaveBeenCalledOnce();
    expect(panel()).toHaveAccessibleDescription(/Микрофон выключен/);
    expect(panel()).toHaveTextContent('5:00');
    fireEvent.keyDown(panel(), { key: ' ', repeat: true });
    expect(fake.current.setMuted).toHaveBeenCalledOnce();
    within(panel()).getByRole('button', { name: 'Включить микрофон' });
    say('b', 1, 0, 'a'); say('b', 1, 1, 'again', true);
    key(panel(), ' ');
    expect(fake.current.start).toHaveBeenCalledOnce();
    expect(fake.current.setMuted.mock.calls).toEqual([[true], [false]]);
    say('c', 2, 0, 'more', true);
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
    key(panel(), ' ');
    key(panel(), ' ');
    say('b', 1, 0, 'two', true);
    expect(editor()).toHaveTextContent(/^Keep this one two$/);
    fireEvent.keyDown(panel(), { key: 'Backspace', ctrlKey: true });
    expect(editor()).toHaveTextContent(/^Keep this$/);
    expect(within(panel()).getByRole('button', { name: 'Удалить последнее слово' })).toHaveAttribute('aria-disabled', 'true');
    // The session keeps running: a new phrase still lands, a revision of a cleared one does not.
    say('b', 1, 1, 'two again', true); say('c', 2, 0, 'three', true);
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
    fireEvent.keyDown(panel(), { key: 'Backspace', ctrlKey: true });
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
    const clearButton = within(panel()).getByRole('button', { name: 'Удалить последнее слово' });
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
    fireEvent.keyDown(panel(), { key: 'Backspace', ctrlKey: true });
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
    expect(fake.current.setMuted).not.toHaveBeenCalled();
    expect(panel()).toBeInTheDocument();
    // Inside: Space and Enter on a focused panel button are its own activation, not shortcuts.
    const clearButton = within(panel()).getByRole('button', { name: 'Удалить последнее слово' });
    key(clearButton, ' '); key(clearButton, 'Enter');
    expect(fake.current.setMuted).not.toHaveBeenCalled();
    // A text field inside the panel (attachments, future inputs) keeps every key, including Escape.
    const field = document.createElement('input'); panel().appendChild(field);
    key(field, ' '); key(field, 'Escape');
    const editable = document.createElement('div'); editable.setAttribute('contenteditable', 'true'); panel().appendChild(editable);
    key(editable, ' ');
    expect(fake.current.setMuted).not.toHaveBeenCalled();
    expect(fake.current.cancel).not.toHaveBeenCalled();
    field.remove(); editable.remove();
    // Escape on a focused panel button is that button's key too; leaving has its own labelled button.
    key(clearButton, 'Escape');
    expect(fake.current.cancel).not.toHaveBeenCalled();
    expect(panel()).toBeInTheDocument();
    // The transcript is focusable for reading; shortcuts still work there, as on the panel itself.
    key(within(panel()).getByRole('group', { name: 'Текст сообщения' }), ' ');
    expect(fake.current.setMuted).toHaveBeenCalledOnce();
    key(within(panel()).getByRole('group', { name: 'Текст сообщения' }), 'Escape');
    expect(screen.queryByRole('region', { name: MODE })).toBeNull();
  });

  it('does not treat Shift+Enter, composing Enter or held Enter as a panel send', async () => {
    const { entry } = await mount('draft');
    await userEvent.click(entry);
    for (const extra of [{ shiftKey: true }, { isComposing: true }, { repeat: true }]) fireEvent.keyDown(panel(), { key: 'Enter', ...extra });
    expect(fake.current.setMuted).not.toHaveBeenCalled();
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
    await act(async () => { await Promise.resolve(); });
    observer.disconnect();
    expect(seen.join('|')).not.toMatch(/secret|speech/);
    expect(seen.filter((v, i) => v && v !== seen[i - 1])).toEqual(['Осталась 1 минута записи', 'Осталось 10 секунд записи', 'Микрофон выключен']);
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
    within(panel()).getByRole('button', { name: 'Повторить запись' });
    key(panel(), ' ');
    expect(fake.current.start).toHaveBeenCalledTimes(2);
    expect(live()).toHaveTextContent('Идёт запись');
  });

  it('leaving the chat or losing edit access stops capture; late events reach no draft', async () => {
    const { view, entry } = await mount('base');
    await userEvent.click(entry);
    say('a', 0, 0, 'kept', true);
    const del = within(panel()).getByRole('button', { name: 'Удалить последнее слово' });
    fireEvent.pointerDown(del, pointer);
    view.rerender(<LiveComposer agentId="chat-1" readOnly running={false} onAccepted={vi.fn()} />);
    expect(fake.current.cancel).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('region', { name: MODE })).toBeNull());
    say('b', 1, 0, 'after', true, fake.current.generation - 1);
    expect(editor()).toHaveTextContent(/^base kept$/);
    await act(async () => view.rerender(<LiveComposer agentId="chat-2" running={false} onAccepted={vi.fn()} />));
    say('c', 2, 0, 'leaked', true);
    await screen.findByRole('button', { name: MODE });
    expect(editor()).not.toHaveTextContent('leaked');
  });

  it('keeps the status and metrics rows, hides notices and the stop button, and restores them on exit', async () => {
    sessionStorage.setItem('mauzcode-ui-draft:chat-1', JSON.stringify({ text: '/compact', key: 'k0' }));
    mauzcode.stopAgent.mockReset();
    const view = render(<LiveComposer agentId="chat-1" running onAccepted={vi.fn()} planningBadge={<span data-testid="badge">План</span>} />);
    const entry = await screen.findByRole('button', { name: MODE });
    await waitFor(() => expect(entry).not.toHaveAttribute('aria-disabled'));
    const footer = () => view.container.querySelector('.composer-footer');
    const before = footer();
    await userEvent.click(entry);
    expect(panel()).toBeInTheDocument();
    // Status row above and metrics row below stay mounted and in place.
    expect(screen.getByTestId('badge').closest('.composer-status-row')).not.toBeNull();
    expect(screen.getByTestId('badge').compareDocumentPosition(panel()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(footer()).toBe(before);
    expect(panel().compareDocumentPosition(footer()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Остановить выполнение' })).toBeNull();
    expect(view.container.querySelector('.transcript-notice, .connection-error')).toBeNull();
    // Below the frame only the metrics row (and hidden nodes) follow.
    const after = [...view.container.querySelectorAll('.composer-input-anchor ~ *')].filter(el => !(el as HTMLElement).hidden);
    expect(after).toEqual([footer()]);
    key(panel(), 'Escape');
    expect(screen.queryByRole('region', { name: MODE })).toBeNull();
    expect(footer()).toBe(before);
    expect(await screen.findByRole('button', { name: MODE })).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(editor()).toHaveFocus());
  });

  it('clear is disabled with a reason on desktop and hidden on touch when nothing can be cleared', async () => {
    const { entry } = await mount('base');
    await userEvent.click(entry);
    const clear = () => within(panel()).getByRole('button', { name: 'Удалить последнее слово' });
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
      expect(clear()).toHaveAccessibleDescription(/Коснитесь.*Удерживайте 600 мс/);
      await userEvent.click(clear());
      expect(editor()).toHaveTextContent(/^base$/);
      // Nothing left to clear: the touch layout hides the control (not focusable, out of the accessibility tree).
      expect(within(panel()).queryByRole('button', { name: 'Удалить последнее слово' })).toBeNull();
      expect(panel().querySelector('.voice-panel-clear')).toHaveAttribute('hidden');
    } finally { window.matchMedia = matchMedia; }
  });

  it('a send failure is shown in the panel error line, not below it', async () => {
    const { entry } = await mount('hello');
    await userEvent.click(entry);
    act(() => fake.current.set!({ state: 'idle', remainingMs: null }));
    mauzcode.sendMessage.mockRejectedValueOnce(new Error('Network down'));
    await userEvent.click(within(panel()).getByRole('button', { name: 'Отправить' }));
    const line = await within(panel()).findByRole('alert');
    expect(line).toHaveTextContent('Network down');
    expect(panel()).toHaveAttribute('data-error', 'true');
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1);
    mauzcode.sendMessage.mockReset();
  });
});

function controls(state: VoiceCaptureState = 'listening') {
  const f = fake.current;
  const props: VoicePanelProps = { capture: { ...f.snap, state, support: { ok: true }, session: null, generation: 1, start: f.start, setMuted: f.setMuted, finish: f.finish, cancel: f.cancel },
    text: 'три слова', busy: false, canClear: true, canSubmit: true, onToggle: vi.fn(), onClear: vi.fn(), onDeleteWord: vi.fn(), onSend: vi.fn(), onExit: vi.fn() };
  const view = render(<VoicePanel {...props} />);
  return { props, view, button: screen.getByRole('button', { name: 'Удалить последнее слово' }) };
}
const pointer = { pointerId: 1, isPrimary: true, button: 0, buttons: 1 };
describe('selective deletion controls', () => {
  afterEach(() => vi.useRealTimers());
  it.each(['mouse', 'touch'])('uses a strict 600 ms hold or a single short activation (%s)', pointerType => {
    vi.useFakeTimers(); const { props, button, view } = controls();
    const press = { ...pointer, pointerType };
    fireEvent.pointerDown(button, press); vi.advanceTimersByTime(599);
    expect(props.onClear).not.toHaveBeenCalled(); expect(props.onDeleteWord).not.toHaveBeenCalled();
    fireEvent.pointerUp(button, press); fireEvent.click(button, { detail: 1 });
    expect(props.onDeleteWord).toHaveBeenCalledOnce();
    fireEvent.pointerDown(button, press); vi.advanceTimersByTime(600);
    expect(props.onClear).toHaveBeenCalledOnce();
    view.rerender(<VoicePanel {...props} text="новая фраза" />);
    fireEvent.pointerUp(button, press); fireEvent.click(button, { detail: 1 });
    expect(props.onDeleteWord).toHaveBeenCalledOnce(); expect(props.onClear).toHaveBeenCalledOnce();
  });
  it.each(['cancel', 'leave', 'drag', 'blur', 'busy', 'empty', 'unmount'])('abandons a hold on %s without swallowing independent native activation', reason => {
    vi.useFakeTimers(); const { props, button, view } = controls();
    fireEvent.pointerDown(button, pointer);
    if (reason === 'cancel') fireEvent.pointerCancel(button, pointer);
    if (reason === 'leave') fireEvent.pointerLeave(button, pointer);
    if (reason === 'drag') fireEvent.pointerMove(button, { ...pointer, clientX: 20 });
    if (reason === 'blur') fireEvent.blur(button);
    if (reason === 'busy' || reason === 'empty') view.rerender(<VoicePanel {...props} busy={reason === 'busy'} canClear={reason !== 'empty'} />);
    if (reason === 'unmount') view.unmount();
    vi.advanceTimersByTime(700); expect(props.onClear).not.toHaveBeenCalled();
    if (reason === 'unmount') return;
    view.rerender(<VoicePanel {...props} />);
    fireEvent.pointerUp(button, pointer); fireEvent.click(button, { detail: 1 });
    expect(props.onDeleteWord).not.toHaveBeenCalled();
    button.click(); expect(props.onDeleteWord).toHaveBeenCalledOnce();
  });
  it.each(['listening', 'muted'] as const)('routes exact shortcuts only on the frame or transcript (%s)', async state => {
    const { props, button, view } = controls(state);
    expect(button).toHaveAccessibleDescription(/Backspace.*Ctrl\+Backspace/);
    const frame = panel(), transcript = within(frame).getByRole('group', { name: 'Текст сообщения' });
    for (const ctrlKey of [true, false]) {
      const event = { key: 'Backspace', ctrlKey };
      expect(fireEvent.keyDown(transcript, event)).toBe(false);
      expect(fireEvent.keyDown(frame, { ...event, repeat: true })).toBe(false);
      for (const modifier of [{ altKey: true }, { metaKey: true }, { shiftKey: true }, { isComposing: true }]) fireEvent.keyDown(frame, { ...event, ...modifier });
      const field = document.createElement('input'); frame.appendChild(field); fireEvent.keyDown(field, event); field.remove(); fireEvent.keyDown(button, event);
    }
    expect(props.onDeleteWord).toHaveBeenCalledOnce(); expect(props.onClear).toHaveBeenCalledOnce();
    button.focus(); await userEvent.keyboard('{Enter} '); expect(props.onDeleteWord).toHaveBeenCalledTimes(3);
    for (const settings of [{ busy: true }, { canClear: false }]) {
      view.rerender(<VoicePanel {...props} {...settings} />); button.click(); key(frame, 'Backspace'); fireEvent.keyDown(frame, { key: 'Backspace', ctrlKey: true });
    }
    expect(props.onDeleteWord).toHaveBeenCalledTimes(3); expect(props.onClear).toHaveBeenCalledOnce();
    expect(props.onSend).not.toHaveBeenCalled(); expect(props.onToggle).not.toHaveBeenCalled();
  });
});
