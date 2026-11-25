import { afterEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageInput } from '../components/mauzcode/MessageInput';
import { LiveComposer } from '../components/mauzcode/LiveComposer';
vi.mock('../lib/goal', async importOriginal => ({ ...await importOriginal<typeof import('../lib/goal')>(), getGoal: vi.fn().mockResolvedValue({ version: 1, enabled: false }) }));
vi.mock('../lib/todos', () => ({ getTodos: vi.fn().mockResolvedValue({ todos: null }) }));
vi.mock('../lib/triggers', async importOriginal => ({ ...await importOriginal<typeof import('../lib/triggers')>(), getArmedTriggers: vi.fn().mockResolvedValue({ agentId: '', counts: { at: 0, cron: 0, watch: 0 }, triggers: [] }) }));
vi.mock('../sdk/live', () => ({ subscribeLive: () => () => {} }));
vi.mock('../lib/queue', async importOriginal => ({ ...await importOriginal<typeof import('../lib/queue')>(), getQueue: vi.fn().mockResolvedValue({ items: [] }) }));
import { validateCommand } from '../lib/commands';
vi.mock('../components/mauzcode/ModelPicker', () => ({ ModelPicker: () => null }));
const base = { kind: 'action', section: 'commands', icon: 'terminal', description: '', enabled: true, usage: [], order: 1 };
const catalogue = { version: 2, csrfToken: 'test-csrf', sections: [{ id: 'commands', label: 'Commands', order: 2 }, { id: 'add', label: 'Add', order: 1 }], commands: [
  { ...base, name: 'plan', label: 'Plan', section: 'add', order: 2 },
  { ...base, name: 'compact', label: 'Compact', enabled: false, reason: 'Завершите выполнение', order: 2 },
  { ...base, name: 'attachment', label: 'File', section: 'add', kind: 'client', clientAction: 'attach-file' },
  { ...base, name: 'goal', label: 'Goal', kind: 'client', clientAction: 'open-goal' },
] };
const json = (value: object, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
/** The editable composer reads its voice route (GET only); that read is never a send. */
const voiceRead = (call: unknown[]) => String(call[0]).startsWith('/voice/api') && !(call[1] as RequestInit | undefined)?.method;
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });
function Editor({ send = vi.fn(), file = vi.fn(), running = false, initial = '' }: { send?: () => void; file?: () => void; running?: boolean; initial?: string }) {
  const [value, setValue] = useState(initial); const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(v => !v)}>Добавить</button><MessageInput commandsEnabled value={value} onChange={setValue} onSend={send} commandMenuOpen={open} onCommandMenuClose={() => setOpen(false)} onFile={file} running={running} /></>;
}
function input(text: string) { fireEvent.input(screen.getByRole('textbox'), { target: { textContent: text } }); }
const optionNames = () => screen.getAllByRole('option').map(row => row.querySelector('.command-menu-name')?.textContent);
it('plus and slash expose the same grouped entries in the same order without altering the draft', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json(catalogue))); render(<Editor initial="existing draft" />);
  await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));
  await screen.findByRole('option', { name: /Plan/ });
  expect(optionNames()).toEqual(['File', 'Plan', 'Goal', 'Compact']);
  expect(screen.getByRole('group', { name: 'Add' })).toHaveTextContent('File');
  expect(screen.getByRole('group', { name: 'Commands' })).toHaveTextContent('Compact');
  expect(screen.getByRole('textbox').textContent).toBe('existing draft');
  screen.getByRole('textbox').focus(); await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('listbox')).toBeNull();
  input('/'); await screen.findByRole('option', { name: /Plan/ });
  expect(optionNames()).toEqual(['File', 'Plan', 'Goal', 'Compact']);
});
it('claims Plan as an atomic chip with keyboard, without submitting or invoking twice', async () => {
  const fetcher = vi.fn(async () => json(catalogue)); vi.stubGlobal('fetch', fetcher); const send = vi.fn(); render(<Editor send={send} />);
  expect(fetcher).not.toHaveBeenCalled(); await userEvent.type(screen.getByRole('textbox'), '/');
  expect(await screen.findByRole('option', { name: 'File' })).toHaveAttribute('aria-selected', 'true');
  await userEvent.keyboard('{ArrowDown}{Enter}');
  expect(send).not.toHaveBeenCalled(); expect(screen.getByRole('textbox').textContent).toBe('/plan ');
  expect(screen.getByRole('textbox').querySelector('[data-composer-command]')).toHaveProperty('contentEditable', 'false');
  expect(screen.queryByRole('listbox')).toBeNull();
  await userEvent.keyboard('test{Enter}'); expect(send).toHaveBeenCalledOnce();
});
it('keeps the keyboard-selected option scrolled into view', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json(catalogue))); const scroll = vi.fn(); Element.prototype.scrollIntoView = scroll; render(<Editor />);
  await userEvent.type(screen.getByRole('textbox'), '/'); await screen.findByRole('option', { name: 'File' }); scroll.mockClear();
  await userEvent.keyboard('{ArrowDown}');
  expect(scroll.mock.contexts.at(-1)).toBe(screen.getByRole('option', { name: 'Plan' })); expect(scroll).toHaveBeenLastCalledWith({ block: 'nearest' });
});
it('plus Plan preserves existing text and pointer selection focuses the editor', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json(catalogue))); render(<Editor initial="my task" />);
  await userEvent.click(screen.getByRole('button', { name: 'Добавить' })); await userEvent.click(await screen.findByRole('option', { name: /Plan/ }));
  expect(screen.getByRole('textbox').textContent).toBe('/plan my task'); expect(screen.getByRole('textbox')).toHaveFocus();
  expect(screen.getByRole('textbox').querySelectorAll('[data-composer-command]')).toHaveLength(1);
});
it('supports Escape and filtering unknown names', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json(catalogue))); render(<Editor />);
  await userEvent.type(screen.getByRole('textbox'), '/'); await screen.findByRole('option', { name: /Plan/ });
  await userEvent.keyboard('{Escape}'); expect(screen.queryByRole('listbox')).toBeNull(); expect(screen.getByRole('textbox').textContent).toBe('/');
  await userEvent.type(screen.getByRole('textbox'), 'xyz'); expect(await screen.findByText('Команда не найдена')).toBeVisible();
});
it('picking File opens attachments once without submitting or replacing the draft', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json(catalogue))); const file = vi.fn(), send = vi.fn(); render(<Editor initial="keep this" file={file} send={send} />);
  await userEvent.click(screen.getByRole('button', { name: 'Добавить' })); await userEvent.click(await screen.findByRole('option', { name: 'File' }));
  expect(file).toHaveBeenCalledOnce(); expect(send).not.toHaveBeenCalled(); expect(screen.getByRole('textbox').textContent).toBe('keep this');
});
it('respects catalogue disabled reason for pointer and keyboard even when idle', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json(catalogue))); const send = vi.fn(); render(<Editor send={send} />);
  await userEvent.type(screen.getByRole('textbox'), '/compact'); const row = await screen.findByRole('option', { name: /^Compact/ });
  expect(row).toHaveAttribute('aria-disabled', 'true'); expect(row).toHaveTextContent('Завершите выполнение');
  await userEvent.click(row); await userEvent.keyboard('{Enter}'); expect(send).not.toHaveBeenCalled(); expect(screen.getByRole('textbox').textContent).toBe('/compact');
});
it.each([['/git:re', 'git:Review'], ['/a.b:', 'a.b:Other'], ['/review', 'git:Review']])('keeps %s open and filters plugin commands by name or label', async (text, name) => {
  const commands = ['git:Review', 'a.b:Other'].map(name => ({ ...base, name, label: name.includes('Review') ? 'Review' : 'Other', section: 'plugins' }));
  vi.stubGlobal('fetch', vi.fn(async () => json({ ...catalogue, sections: [{ id: 'plugins', label: 'Version control', order: 1 }], commands })));
  render(<Editor />); await userEvent.type(screen.getByRole('textbox'), text);
  expect(await screen.findByRole('group', { name: 'Version control' })).toContainElement(screen.getByRole('option', { name: name.split(':')[1] }));
  expect(screen.getAllByRole('option')).toHaveLength(1);
});
it('filters static options locally; arbitrary text still submits', async () => {
  const fetcher = vi.fn(async () => json({ ...catalogue, commands: [{ ...base, name: 'project:ship', label: 'Ship', args: { options: [{ value: 'qa', label: 'Testing' }, { value: 'live', label: 'Production' }] } }] }));
  vi.stubGlobal('fetch', fetcher); const send = vi.fn(); render(<Editor send={send} />);
  input('/project:ship '); await screen.findByRole('option', { name: 'Testing' });
  input('/project:ship duct'); expect(screen.getAllByRole('option')).toHaveLength(1);
  await userEvent.click(screen.getByRole('option', { name: 'Production' })); expect(screen.getByRole('textbox').textContent).toBe('/project:ship live ');
  input('/project:ship arbitrary'); expect(screen.queryByRole('listbox')).toBeNull();
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' }); expect(send).toHaveBeenCalledOnce(); expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(['goal', 'custom:objective'])('opens goal editor with /%s arguments without posting a command', async name => {
  const fetcher = vi.fn(async (url: string, _init?: RequestInit) => url.startsWith('/commands?') ? json({ ...catalogue, commands: [{ ...base, name, label: 'Objective', kind: 'client', clientAction: 'open-goal' }] }) : json({ budget: null }));
  vi.stubGlobal('fetch', fetcher); render(<LiveComposer agentId="local-action" running={false} onAccepted={vi.fn()} />);
  input(`/${name} write tests`); await userEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
  expect(await screen.findByRole('textbox', { name: 'Цель' })).toHaveValue('write tests'); expect(fetcher.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
});
it('opens a catalogue canvas target via the protected canvas route, not command dispatch', async () => {
  const action = { type: 'open-canvas', kind: 'file', args: { path: 'README.md' } };
  const fetcher = vi.fn(async (url: string, _init?: RequestInit) => url.startsWith('/commands?') ? json({ ...catalogue, commands: [{ ...base, name: 'docs:open', label: 'Docs', kind: 'client', clientAction: action }] }) : json({ budget: null }));
  vi.stubGlobal('fetch', fetcher); const accepted = vi.fn(); render(<LiveComposer agentId="canvas-action" running={false} onAccepted={accepted} />);
  input('/docs:open'); await userEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
  await waitFor(() => expect(accepted).toHaveBeenCalledOnce()); const posts = fetcher.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(posts).toHaveLength(1); expect(posts[0][0]).toBe('/canvas/canvas-action');
  expect(JSON.parse(String(posts[0][1]?.body))).toEqual({ show: { kind: 'file', args: action.args } }); expect(new Headers(posts[0][1]?.headers).get('X-CSRF-Token')).toBe('test-csrf');
});
it('never sends a slash as a prompt when catalogue loading fails, preserving draft', async () => {
  const fetcher = vi.fn(async (url: string) => url.endsWith('/context') ? json({ budget: null }) : json({ error: 'offline' }, 503)); vi.stubGlobal('fetch', fetcher);
  render(<LiveComposer agentId="slash-test" running={false} onAccepted={vi.fn()} />); input('/plan задача');
  await userEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('offline'); expect(screen.getByRole('textbox').textContent).toBe('/plan задача');
  expect(fetcher.mock.calls.every(call => String(call[0]) === '/commands?version=2&agentId=slash-test' || String(call[0]).endsWith('/context') || voiceRead(call))).toBe(true);
});
it('validates unknown commands and attachments but does not load catalogue for ordinary text', async () => {
  const fetcher = vi.fn(async () => json(catalogue)); vi.stubGlobal('fetch', fetcher);
  await validateCommand('hello'); await validateCommand('/file.txt'); await validateCommand('/home/notes'); expect(fetcher).not.toHaveBeenCalled();
  await expect(validateCommand('/plna')).rejects.toThrow('Неизвестная команда');
  await expect(validateCommand('/plan', 1)).rejects.toThrow('пока не принимает файлы');
  await expect(validateCommand('/plan задача')).resolves.toMatchObject({ command: { name: 'plan' }, args: 'задача' });
});
it('posts commands through the CSRF-protected endpoint, preserving the request ID on uncertain retry', async () => {
  const bodies: { text: string; requestId: string }[] = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/commands?version=2&agentId=slash-test') return json(catalogue);
    if (url.endsWith('/context')) return json({ budget: null });
    if (url.startsWith('/voice/api')) return json({ error: 'forbidden' }, 403);
    expect(url).toBe('/agent/slash-test/commands'); expect(init?.method).toBe('POST'); expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('test-csrf');
    bodies.push(JSON.parse(init!.body as string)); if (bodies.length === 1) throw new Error('offline');
    return json({ ok: true, command: 'plan', status: 'completed', operationId: 'operation' });
  }); vi.stubGlobal('fetch', fetcher);
  const accepted = vi.fn(); const change = vi.fn(); window.addEventListener('mauzcode-planning-changed', change);
  try {
    render(<LiveComposer agentId="slash-test" running={false} onAccepted={accepted} />); input('/plan task');
    await userEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('offline'); expect(screen.getByRole('textbox').textContent).toBe('/plan task');
    await userEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
    await waitFor(() => expect(accepted).toHaveBeenCalledOnce()); expect(change).toHaveBeenCalledOnce();
    expect(bodies).toHaveLength(2); expect(bodies[0]).toEqual(bodies[1]); expect(bodies[0].text).toBe('/plan task'); expect(bodies[0].requestId).toBeTruthy();
    expect(screen.getByRole('textbox').textContent).toBe('');
  } finally { window.removeEventListener('mauzcode-planning-changed', change); }
});
it('rejects command while running and offers explicit stop, preserving draft', async () => {
  const fetcher = vi.fn(async (url: string) => url.startsWith('/commands?') ? json({ ...catalogue, commands: [{ ...base, name: 'plan', enabled: false, reason: 'Сначала остановите выполнение' }] }) : json({ budget: null })); vi.stubGlobal('fetch', fetcher);
  render(<LiveComposer agentId="running" running onAccepted={vi.fn()} />); input('/plan задача');
  await userEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Сначала остановите'); expect(screen.getByRole('button', { name: 'Остановить выполнение' })).toBeEnabled();
  expect(fetcher.mock.calls.every(call => String(call[0]).startsWith('/commands?') || String(call[0]).endsWith('/context') || voiceRead(call))).toBe(true); expect(screen.getByRole('textbox').textContent).toBe('/plan задача');
});
