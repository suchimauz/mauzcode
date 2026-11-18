import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActiveToolRow } from '../components/mauzcode/ActiveToolRow';
import { ToolRow } from '../components/mauzcode/ToolRow';
import type { ActiveTool } from '../lib/mauzcode';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const command = 'set -e\nbun install\nbun run build && bun test --coverage ' + 'x'.repeat(400);
const run: ActiveTool = { id: 'r1', name: 'bash', label: 'Bash', icon: 'terminal', category: 'commands', summary: 'set -e', startedAt: 1000, state: 'running', tail: 'tail only', outputStart: 0, outputEnd: 6, args: { command, secrets: '••• (1 key)' } };

it('running and finished rows of one call show the same label, icon and summary', () => {
  const live = render(<ActiveToolRow run={run} agentId="a" autoOpen={false} />);
  const runningRow = live.container.querySelector('.tool-row')!;
  const runningShown = [runningRow.querySelector('.tool-row-title')!.textContent, runningRow.querySelector('[data-tool-icon]')!.getAttribute('data-tool-icon'), runningRow.querySelector('.tool-row-description')!.textContent];
  live.unmount();
  const done = render(<ToolRow agentId="a" event={{ idx: 1, ts: 1, type: 'tool_call', text: null, name: 'bash', toolLabel: 'Bash', toolIcon: 'terminal', toolCategory: 'commands', toolSummary: 'set -e' }} />);
  const finishedRow = done.container.querySelector('.tool-row')!;
  expect([finishedRow.querySelector('.tool-row-title')!.textContent, finishedRow.querySelector('[data-tool-icon]')!.getAttribute('data-tool-icon'), finishedRow.querySelector('.tool-row-description')!.textContent]).toEqual(runningShown);
  expect(finishedRow.getAttribute('data-category')).toBe(runningRow.getAttribute('data-category'));
});

it('an expanded running command shows the whole call above full live output, appended by offset', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(json({ start: 0, from: 0, end: 6, text: 'line1\n' }))
    .mockResolvedValueOnce(json({ start: 0, from: 6, end: 12, text: 'line2\n' }));
  vi.stubGlobal('fetch', fetcher);
  const view = render(<ActiveToolRow run={run} agentId="a" />);
  const call = screen.getByRole('region', { name: 'Вызов' });
  expect(call.textContent).toContain('bun run build && bun test --coverage ' + 'x'.repeat(400));
  expect(call.textContent).toContain('••• (1 key)');
  expect(screen.getByRole('button', { name: 'Копировать код' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('region', { name: 'Вывод' }).textContent).toContain('line1'));
  expect(fetcher.mock.calls[0][0]).toBe('/api/v1/agents/a/runs/r1/output?from=0');
  view.rerender(<ActiveToolRow run={{ ...run, outputEnd: 12 }} agentId="a" />);
  await waitFor(() => expect(screen.getByRole('region', { name: 'Вывод' }).textContent).toContain('line1\nline2'));
  expect(fetcher.mock.calls[1][0]).toBe('/api/v1/agents/a/runs/r1/output?from=6');
  expect(screen.queryByText('tail only')).toBeNull();
});

it('shows a drop marker when older output was discarded and loads large arguments on expand', async () => {
  const fetcher = vi.fn(async (url: string) => url.includes('/args') ? json({ args: { command: 'huge command' } }) : json({ start: 2048, from: 2048, end: 2050, text: 'ok' }));
  vi.stubGlobal('fetch', fetcher);
  render(<ActiveToolRow run={{ ...run, args: undefined, argsLarge: true }} agentId="a" />);
  expect(await screen.findByText(/более ранний вывод отброшен: 2 КБ/)).toBeVisible();
  expect(await screen.findByText('huge command')).toBeInTheDocument();
});

it('falls back to the wrench and raw name without server presentation, and opens expanded view', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ event: { idx: 2, ts: 1, type: 'tool_call', name: 'removed.tool', args: '{"count":3,"spec":{"a":1}}', argsTruncated: false, result: 'done', resultTruncated: false, isError: false } })));
  const { container } = render(<ToolRow agentId="a" event={{ idx: 2, ts: 1, type: 'tool_call', text: null, name: 'removed.tool' }} />);
  expect(container.querySelector('[data-tool-icon]')).toHaveAttribute('data-tool-icon', 'wrench');
  expect(container.querySelector('.tool-row-description')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: /removed\.tool/ }));
  expect(await screen.findByText('done')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Вызов' }).textContent).toContain('count');
});

it('a failed call is marked by the error icon, not text colour alone', () => {
  const { container } = render(<ToolRow agentId="a" event={{ idx: 3, ts: 1, type: 'tool_call', text: null, name: 'bash', isError: true, toolLabel: 'Bash', toolIcon: 'terminal', toolCategory: 'commands', toolSummary: 'false' }} />);
  expect(container.querySelector('[data-tool-icon]')).toHaveAttribute('data-tool-icon', 'error');
  expect(container.querySelector('.tool-row')).toHaveAttribute('data-state', 'error');
  act(() => {});
});
