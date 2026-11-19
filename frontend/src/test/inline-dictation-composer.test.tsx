import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { LiveComposer } from '../components/mauzcode/LiveComposer';
import { MessageInput, type DraftCaretHandle } from '../components/mauzcode/MessageInput';
import { VoiceEntryControls } from '../components/mauzcode/VoiceEntryControls';
import { useInlineDictation } from '../hooks/useInlineDictation';
import type { VoiceCaptureState, VoicePhraseEvent } from '../hooks/useVoiceCapture';
import type { VoiceChatRoute, VoiceState } from '../lib/voice';

// Task 3.4 through the real composer path: VoiceEntryControls → useInlineDictation → MessageInput → CommandEditor
// (LiveComposer) or the plain textarea fallback. Only the capture controller is replaced by a controllable fake:
// no microphone, socket or network is touched; its own behaviour is covered by use-voice-capture.test.tsx.
const mauzcode = vi.hoisted(() => ({ sendMessage: vi.fn(), stopAgent: vi.fn() }));
vi.mock('../lib/mauzcode', async importOriginal => ({ ...await importOriginal<typeof import('../lib/mauzcode')>(), ...mauzcode }));
vi.mock('../lib/goal', async importOriginal => ({ ...await importOriginal<typeof import('../lib/goal')>(), getGoal: vi.fn().mockResolvedValue({ version: 1, enabled: false }) }));
vi.mock('../lib/todos', () => ({ getTodos: vi.fn().mockResolvedValue({ todos: null }) }));
vi.mock('../lib/triggers', async importOriginal => ({ ...await importOriginal<typeof import('../lib/triggers')>(), getArmedTriggers: vi.fn().mockResolvedValue({ agentId: '', counts: { at: 0, cron: 0, watch: 0 }, triggers: [] }) }));
vi.mock('../sdk/live', () => ({ subscribeLive: () => () => {} }));
const queueLib = vi.hoisted(() => ({ enqueueMessage: vi.fn() }));
vi.mock('../lib/queue', async importOriginal => ({ ...await importOriginal<typeof import('../lib/queue')>(), getQueue: vi.fn().mockResolvedValue({ items: [] }), ...queueLib }));

type Fake = { state: VoiceCaptureState; generation: number; onPhrase?: (event: VoicePhraseEvent) => void; start: ReturnType<typeof vi.fn>; finish: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn>; settle?: (ok: boolean) => void; set?: (s: VoiceCaptureState) => void };
const fake = vi.hoisted(() => ({ current: null as unknown as Fake }));
vi.mock('../hooks/useVoiceCapture', async () => {
  const React = await import('react');
  return {
    useVoiceCapture: ({ onPhrase }: { onPhrase?: (event: VoicePhraseEvent) => void }) => {
      const [state, setState] = React.useState<VoiceCaptureState>('idle');
      const f = fake.current; f.onPhrase = onPhrase; f.state = state; f.set = setState;
      return {
        support: { ok: true }, state, error: null, remainingMs: null, session: null, generation: f.generation,
        start: f.start, finish: f.finish, cancel: f.cancel, pause: vi.fn(), resume: vi.fn(),
      };
    },
  };
});
function newFake(): Fake {
  const f: Fake = {
    state: 'idle', generation: 0,
    start: vi.fn(async () => { f.generation++; act(() => f.set?.('listening')); }),
    finish: vi.fn(() => { act(() => f.set?.('finalizing')); return new Promise<boolean>(resolve => { f.settle = ok => { act(() => f.set?.('idle')); resolve(ok); }; }); }),
    cancel: vi.fn(() => { f.generation++; act(() => f.set?.('idle')); }),
  };
  return f;
}
const say = (id: string, order: number, revision: number, text: string, final = false) =>
  act(() => fake.current.onPhrase?.({ type: 'phrase', generation: fake.current.generation, id, order, revision, text, final }));

const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const destination = { kind: 'cloud' as const, label: 'OpenAI Realtime (api.openai.com)' };
const route = { route: 'openai-realtime/work:gpt-live-transcribe', provider: 'openai-realtime', accountName: 'work', connectionId: 'c1', modelId: 'gpt-live-transcribe', label: 'GPT Live Transcribe', destination };
const chat: VoiceChatRoute = { agentId: 'chat-1', route: route.route, source: 'default', status: 'ready', destination, model: { id: route.modelId, label: route.label } };
const state: VoiceState = { providers: [], connections: [], routes: [route], defaultRoute: { route: route.route, fixed: false }, chat, csrfToken: 't' };
const INLINE = 'Голосовой ввод в поле сообщения';
const PANEL = 'Голосовой режим';
let fetcher: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fake.current = newFake();
  mauzcode.sendMessage.mockReset(); queueLib.enqueueMessage.mockReset();
  fetcher = vi.fn(async (url: string) => String(url).startsWith('/voice/api') ? json(state) : String(url).includes('/ui-lab-api/models') ? json({ models: [] }) : json({ budget: null }));
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  // Dictation never submits: neither the send nor the queue path ran.
  expect(mauzcode.sendMessage).not.toHaveBeenCalled();
  expect(queueLib.enqueueMessage).not.toHaveBeenCalled();
  vi.unstubAllGlobals(); sessionStorage.clear();
});

function place(el: HTMLElement, start: number, end = start) {
  if (el instanceof HTMLTextAreaElement) { el.focus(); el.setSelectionRange(start, end); fireEvent.select(el); return; }
  el.focus();
  const node = el.firstChild ?? el; const range = document.createRange();
  range.setStart(node, start); range.setEnd(node, end);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
}
const valueOf = (el: HTMLElement) => el instanceof HTMLTextAreaElement ? el.value : el.textContent;
async function ready() {
  const inline = await screen.findByRole('button', { name: INLINE });
  await waitFor(() => expect(inline).not.toHaveAttribute('aria-disabled'));
  return inline;
}

/** The textarea fallback wired exactly as LiveComposer wires the command editor. */
function TextareaComposer({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const caret = useRef<DraftCaretHandle>(null);
  const inline = useInlineDictation({ text, onText: setText, caret });
  return <>
    <MessageInput value={text} caretRef={caret} onChange={value => { inline.observe(value); setText(value); }} onSend={() => mauzcode.sendMessage('chat-1', text, 'k')} />
    <VoiceEntryControls agentId="chat-1" handlers={{ inline: inline.handler }} />
  </>;
}

const editors = [
  ['CommandEditor (LiveComposer)', (initial: string) => {
    sessionStorage.setItem('mauzcode-ui-draft:chat-1', JSON.stringify({ text: initial, key: 'k0' }));
    render(<LiveComposer agentId="chat-1" running={false} onAccepted={vi.fn()} />);
  }],
  ['textarea fallback', (initial: string) => { render(<TextareaComposer initial={initial} />); }],
] as const;

describe.each(editors)('inline dictation in %s', (_name, mount) => {
  it('starts at the caret kept across the button click, stops with the last final, never sends', async () => {
    mount('Hello world');
    const inline = await ready();
    const box = screen.getByRole('textbox', { name: 'Сообщение агенту' });
    place(box, 5);
    await userEvent.click(inline);
    expect(fake.current.start).toHaveBeenCalledOnce();
    expect(inline).toHaveAttribute('aria-pressed', 'true');
    // The other entry point is blocked while inline dictation runs (the textarea fallback has no panel at all).
    expect(screen.getByRole('button', { name: PANEL })).toHaveAttribute('aria-disabled', 'true');
    say('a', 0, 0, 'big');
    expect(valueOf(box)).toBe('Hello big world');
    say('a', 0, 1, 'big blue', true);
    say('b', 1, 0, 'sunny');
    await userEvent.click(inline);
    expect(fake.current.finish).toHaveBeenCalledOnce();
    expect(fake.current.start).toHaveBeenCalledOnce();
    // The last phrase is finalized while finishing, then the session closes.
    say('b', 1, 1, 'sunny day', true);
    await act(async () => { fake.current.settle!(true); });
    expect(valueOf(box)).toBe('Hello big blue sunny day world');
    expect(inline).toHaveAttribute('aria-pressed', 'false');
    // Late events after stop change nothing.
    say('b', 1, 2, 'LATE', true); say('c', 2, 0, 'ghost');
    expect(valueOf(box)).toBe('Hello big blue sunny day world');
  });

  it('repeated revisions and out-of-order finals land once, in phrase order', async () => {
    mount('A  B');
    const inline = await ready();
    const box = screen.getByRole('textbox', { name: 'Сообщение агенту' });
    place(box, 2);
    await userEvent.click(inline);
    say('p1', 0, 0, 'one'); say('p2', 1, 0, 'tw'); say('p2', 1, 1, 'two'); say('p2', 1, 2, 'two!', true);
    say('p1', 0, 1, 'one.', true); say('p1', 0, 1, 'one.', true); say('p2', 1, 1, 'stale');
    expect(valueOf(box)).toBe('A one. two! B');
  });

  it('manual edits inside a phrase win; edits outside keep the dictation in place', async () => {
    mount('start end');
    const inline = await ready();
    const box = screen.getByRole('textbox', { name: 'Сообщение агенту' });
    place(box, 5);
    await userEvent.click(inline);
    say('a', 0, 0, 'helo');
    expect(valueOf(box)).toBe('start helo end');
    // Outside: typed before the start point.
    if (box instanceof HTMLTextAreaElement) fireEvent.change(box, { target: { value: 'NEW start helo end' } });
    else { box.firstChild!.textContent = 'NEW start helo end'; fireEvent.input(box); }
    say('a', 0, 1, 'hello');
    expect(valueOf(box)).toBe('NEW start hello end');
    // Inside: the user corrects the dictated word; the delayed final must not undo it.
    if (box instanceof HTMLTextAreaElement) fireEvent.change(box, { target: { value: 'NEW start HELLO end' } });
    else { box.firstChild!.textContent = 'NEW start HELLO end'; fireEvent.input(box); }
    say('a', 0, 2, 'hello there', true);
    expect(valueOf(box)).toBe('NEW start HELLO end');
  });
});

describe('inline dictation in the live composer', () => {
  it('keeps attachments and the draft, and sends nothing on stop', async () => {
    sessionStorage.setItem('mauzcode-ui-draft:chat-1', JSON.stringify({ text: 'note', key: 'k0' }));
    render(<LiveComposer agentId="chat-1" running={false} onAccepted={vi.fn()} />);
    const inline = await ready();
    const files = screen.getByLabelText('Добавить файлы') as HTMLInputElement;
    await userEvent.upload(files, new File(['x'], 'plan.txt', { type: 'text/plain' }));
    expect(await screen.findByRole('group', { name: 'Прикреплённые файлы' })).toHaveTextContent('plan.txt');
    await userEvent.click(inline);
    say('a', 0, 0, 'appended', true);
    await userEvent.click(inline);
    await act(async () => { fake.current.settle!(true); });
    expect(screen.getByRole('textbox', { name: 'Сообщение агенту' })).toHaveTextContent('note appended');
    expect(screen.getByRole('group', { name: 'Прикреплённые файлы' })).toHaveTextContent('plan.txt');
    expect(JSON.parse(sessionStorage.getItem('mauzcode-ui-draft:chat-1')!).text).toBe('note appended');
  });

  it('cancel and navigation drop late events; a failed finish keeps the text editable', async () => {
    const view = render(<LiveComposer agentId="chat-1" running={false} onAccepted={vi.fn()} />);
    const inline = await ready();
    await userEvent.click(inline);
    say('a', 0, 0, 'first', true);
    await userEvent.click(inline);
    await act(async () => { fake.current.settle!(false); });
    const box = screen.getByRole('textbox', { name: 'Сообщение агенту' });
    expect(box).toHaveTextContent('first');
    say('a', 0, 1, 'late after failure', true);
    expect(box).toHaveTextContent(/^first$/);
    // A new session starts fresh; the old generation's events are ignored.
    await userEvent.click(inline);
    const old = fake.current.generation - 1;
    act(() => fake.current.onPhrase?.({ type: 'phrase', generation: old, id: 'x', order: 0, revision: 9, text: 'stale', final: true }));
    expect(box).toHaveTextContent(/^first$/);
    // Navigation to another chat: the new composer receives nothing from the old session.
    view.rerender(<LiveComposer agentId="chat-2" running={false} onAccepted={vi.fn()} />);
    say('a', 0, 0, 'leaked', true);
    expect(screen.getByRole('textbox', { name: 'Сообщение агенту' })).not.toHaveTextContent('leaked');
  });

  it('becoming read-only stops applying phrases and removes the controls', async () => {
    const view = render(<LiveComposer agentId="chat-1" running={false} onAccepted={vi.fn()} />);
    const inline = await ready();
    await userEvent.click(inline);
    say('a', 0, 0, 'kept', true);
    view.rerender(<LiveComposer agentId="chat-1" readOnly running={false} onAccepted={vi.fn()} />);
    say('b', 1, 0, 'after');
    const box = screen.getByRole('textbox', { name: 'Сообщение агенту' });
    expect(box).toHaveTextContent(/^kept$/);
    expect(screen.queryByRole('button', { name: INLINE })).toBeNull();
  });

  it('renders the model picker and voice controls as siblings without a React key conflict', async () => {
    const error = vi.spyOn(console, 'error');
    try {
      const view = render(<LiveComposer agentId="chat-1" running={false} onAccepted={vi.fn()} />);
      await ready();
      view.rerender(<LiveComposer agentId="chat-2" running={false} onAccepted={vi.fn()} />);
      await screen.findByRole('button', { name: INLINE });
      expect(error.mock.calls.filter(args => String(args[0]).includes('same key'))).toEqual([]);
    } finally { error.mockRestore(); }
  });
});
