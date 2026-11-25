import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageInput } from '../components/mauzcode/MessageInput';
import { TranscriptMessage } from '../components/mauzcode/TranscriptMessage';
import { commandToken, getCommands, validateCommand } from '../lib/commands';
import type { ChatEvent } from '../lib/mauzcode';
vi.mock('../components/mauzcode/ModelPicker', () => ({ ModelPicker: () => null }));

const skill = (id: string, name: string, source: string, description: string, qualifier?: string) => ({
  name: id, label: name, description, kind: 'skill', section: 'skills', icon: 'book', enabled: true, usage: [`/${id} <task>`], order: 100,
  skill: { id, name, source, sourceKind: id.split(':')[0]!.split('.')[1], ...(qualifier ? { qualifier } : {}) },
});
const catalogue = { version: 2, csrfToken: 'csrf', sections: [{ id: 'commands', label: 'Commands', order: 10 }, { id: 'skills', label: 'Skills', order: 20 }], commands: [
  { name: 'plan', label: 'Plan', description: '', kind: 'action', section: 'commands', icon: 'terminal', enabled: true, usage: [], order: 1 },
  skill('skill.plugin.git:review', 'review', 'Git', 'Review a Git diff.', 'git'),
  skill('skill.workspace:review', 'review', 'Workspace', 'Project review checklist.'),
  skill('skill.workspace:3d-print', '3d-print', 'Workspace', 'Prepare a model for printing.'),
] };
const json = (value: object) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });
function Editor({ send = vi.fn(), initial = '', scope }: { send?: () => void; initial?: string; scope?: { projectId?: string; presetId?: string } }) {
  const [value, setValue] = useState(initial);
  return <><MessageInput commandsEnabled value={value} onChange={setValue} onSend={send} commandScope={scope} /><output data-testid="value">{value}</output></>;
}
const input = (text: string) => fireEvent.input(screen.getByRole('textbox'), { target: { textContent: text } });

describe('skills in the composer', () => {
  it('groups both review results under Skills with distinct sources; picking inserts the canonical ID without sending', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(catalogue)));
    const send = vi.fn();
    render(<Editor send={send} />);
    input('/review');
    const group = await screen.findByRole('group', { name: 'Skills' });
    const rows = [...group.querySelectorAll('[role=option]')].map(row => [row.querySelector('.command-menu-name')?.textContent, row.querySelector('.command-menu-source')?.textContent]);
    expect(rows).toEqual([['review', 'Git'], ['review', 'Workspace']]);
    await userEvent.click(screen.getByRole('option', { name: /review.*Git/ }));
    expect(screen.getByTestId('value').textContent).toBe('/skill.plugin.git:review ');
    expect(send).not.toHaveBeenCalled();
    const chip = screen.getByRole('textbox').querySelector('[data-composer-command]')!;
    expect(chip.getAttribute('data-label')).toBe('review · Git');
    expect(chip.textContent).toBe('/skill.plugin.git:review');
  });

  it('keyboard selection works, search matches source and digit-leading names, and the suffix stays editable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(catalogue)));
    render(<Editor />);
    input('/3d');
    await screen.findByRole('option', { name: /3d-print/ });
    screen.getByRole('textbox').focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('value').textContent).toBe('/skill.workspace:3d-print ');
    input('/skill.workspace:3d-print a small part');
    expect(screen.getByTestId('value').textContent).toBe('/skill.workspace:3d-print a small part');
    input('/git');
    await waitFor(() => expect(screen.getAllByRole('option').map(o => o.querySelector('.command-menu-name')?.textContent)).toEqual(['review']));
  });

  it('a pasted or restored full invocation becomes a chip; copy yields the exact ID', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(catalogue)));
    render(<Editor initial="/skill.workspace:review check this" />);
    await waitFor(() => expect(screen.getByRole('textbox').querySelector('[data-composer-command]')?.getAttribute('data-label')).toBe('review · Workspace'));
    const data = new Map<string, string>();
    const box = screen.getByRole('textbox');
    const chip = box.querySelector('[data-composer-command]')!;
    // Caret right after the chip, Backspace selects it, and copy gives the canonical token, never the label.
    box.focus();
    const range = document.createRange(); range.setStartAfter(chip); range.collapse(true);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
    fireEvent.keyDown(box, { key: 'Backspace' });
    expect(chip.getAttribute('data-selected')).toBe('true');
    fireEvent.copy(box, { clipboardData: { setData: (type: string, value: string) => data.set(type, value) } });
    expect(data.get('text/plain')).toBe('/skill.workspace:review');
    expect(chip.getAttribute('aria-label')).toBe('review · Workspace, /skill.workspace:review');
    expect(screen.getByTestId('value').textContent).toBe('/skill.workspace:review check this');
  });

  it('new-chat menus request the selected project and preset and refresh when they change', async () => {
    const fetcher = vi.fn(async (_url: string) => json(catalogue));
    vi.stubGlobal('fetch', fetcher);
    const view = render(<Editor scope={{ projectId: 'p1', presetId: 'standard' }} />);
    input('/');
    await screen.findByRole('group', { name: 'Skills' });
    expect(String(fetcher.mock.calls.at(-1)![0])).toBe('/commands?version=2&projectId=p1&presetId=standard');
    view.rerender(<Editor scope={{ projectId: 'p2', presetId: 'minimal' }} />);
    await waitFor(() => expect(String(fetcher.mock.calls.at(-1)![0])).toBe('/commands?version=2&projectId=p2&presetId=minimal'));
  });

  it('submission validates a typed skill against the same scope without opening the menu', async () => {
    const fetcher = vi.fn(async (_url: string) => json(catalogue));
    vi.stubGlobal('fetch', fetcher);
    await expect(validateCommand('/skill.workspace:review go', 0, { projectId: 'p1', presetId: 'standard' })).resolves.toMatchObject({ command: { name: 'skill.workspace:review' }, args: 'go' });
    expect(String(fetcher.mock.calls[0]![0])).toBe('/commands?version=2&projectId=p1&presetId=standard');
    await expect(validateCommand('/skill.workspace:gone go', 0, { projectId: 'p1' })).rejects.toThrow('Неизвестная команда');
    await expect(validateCommand('/review go')).rejects.toThrow('Неизвестная команда');
    expect(commandToken('/skill.workspace:3d-print x')).toBe('/skill.workspace:3d-print');
    expect(commandToken('/etc/skill.conf')).toBeUndefined();
    await getCommands({ agentId: 'a1', projectId: 'ignored' });
    expect(String(fetcher.mock.calls.at(-1)![0])).toBe('/commands?version=2&agentId=a1');
  });
});

describe('skills in history', () => {
  const event: ChatEvent = { idx: 1, ts: 10, type: 'user', text: '/skill.plugin.git:review check my changes', command: { name: 'skill.plugin.git:review', kind: 'skill', text: '/skill.plugin.git:review check my changes', argsText: 'check my changes', skill: { id: 'skill.plugin.git:review', name: 'review', source: 'Git' } } };
  it('renders a copyable chip from stored metadata with the task as typed', async () => {
    const write = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: write } });
    const { container } = render(<TranscriptMessage agentId="a" event={event} />);
    expect(container.querySelectorAll('.user-message-bubble')).toHaveLength(1);
    expect(container.querySelector('.user-message-bubble')!.textContent).toBe('review · Git check my changes');
    await userEvent.click(screen.getByRole('button', { name: 'Копировать /skill.plugin.git:review' }));
    expect(write).toHaveBeenCalledWith('/skill.plugin.git:review');
  });
  it('keeps old events and plain slash prose unchanged', () => {
    const old: ChatEvent = { ...event, command: { name: 'skill.plugin.git:review', text: event.text! } };
    const { container, rerender } = render(<TranscriptMessage agentId="a" event={old} />);
    expect(container.querySelector('.skill-chip')).toBeNull();
    expect(container.querySelector('.user-command-token')?.textContent).toBe('/skill.plugin.git:review');
    rerender(<TranscriptMessage agentId="a" event={{ idx: 2, ts: 11, type: 'user', text: '/skill.plugin.git:review typed as prose' }} />);
    expect(container.querySelector('.skill-chip, .user-command-token')).toBeNull();
  });
});
