import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolBody } from '../components/mauzcode/ToolBody';
import { ToolCallPanel } from '../components/mauzcode/ToolCallPanel';
import type { ToolDetails } from '../lib/mauzcode';
const details = { idx: 1, ts: 1, type: 'tool_result', name: 'read', args: '{"path":"test.ts"}', argsTruncated: false, result: Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n'), resultTruncated: false, isError: false };
const expanded = (kind: string, args: Record<string, unknown>, d: ToolDetails = details) => <ToolCallPanel args={args} output={<ToolBody details={d} kind={kind} args={args} />} />;
it('shows eight read lines first and the path in the Call section', async () => {
  render(expanded('read', { path: 'test.ts' }));
  expect(screen.getByText('line 8')).toBeVisible();
  expect(screen.queryByText('line 9')).toBeNull();
  expect(screen.getByRole('region', { name: 'Вызов' })).toHaveTextContent('test.ts');
  await userEvent.click(screen.getByRole('button', { name: 'Показать все 12 строк' }));
  expect(screen.getByText('line 12')).toBeVisible();
});
it('shows the full command in the Call section and the result in Output', () => {
  render(expanded('bash', { command: 'bun run build' }, { ...details, result: 'Build complete' }));
  expect(screen.getByRole('region', { name: 'Вызов' })).toHaveTextContent('bun run build');
  expect(screen.getByRole('region', { name: 'Вывод' })).toHaveTextContent('Build complete');
  expect(screen.getByRole('region', { name: 'Вывод' })).not.toHaveTextContent('bun run build');
});
it('separates Eval input and output into labeled sections', () => {
  render(expanded('tools_eval', { code: 'return 42' }, { ...details, name: 'tools_eval', args: '{"code":"return 42"}', result: '42' }));
  expect(screen.getByRole('region', { name: 'Вызов' })).toHaveTextContent('return 42');
  expect(screen.getByRole('region', { name: 'Вывод' })).toHaveTextContent('42');
  expect(screen.getByRole('region', { name: 'Вывод' })).not.toHaveTextContent('return');
});
it('shows the RTK outcome and the actually executed command next to the original bash command', () => {
  const rtk = { outcome: 'rewritten', original: 'git log', executed: 'rtk git log', code: 3, notice: null, diagnostic: null };
  render(expanded('bash', { command: 'git log' }, { ...details, name: 'bash', result: 'compact log', rtk }));
  expect(screen.getByText('git log')).toBeVisible();
  expect(screen.getByText(/команда переписана RTK \(код 3\)/)).toBeVisible();
  expect(screen.getByLabelText('Выполненная команда')).toHaveTextContent('rtk git log');
});
it('shows an RTK denial without an executed command', () => {
  const rtk = { outcome: 'denied', original: 'rm -rf x', executed: null, code: 2, notice: null, diagnostic: 'blocked by rule' };
  render(<ToolBody details={{ ...details, name: 'bash', isError: true, result: '[rtk: denied]', rtk }} kind="bash" args={{ command: 'rm -rf x' }} />);
  expect(screen.getByText(/запрещено правилами RTK/)).toBeVisible();
  expect(screen.getByText('blocked by rule')).toBeVisible();
  expect(screen.queryByLabelText('Выполненная команда')).toBeNull();
});
it('lists other arguments in full with nested values expandable', async () => {
  render(<ToolCallPanel args={{ title: 'Plan', tasks: [{ id: 'a', title: 'A very long title '.repeat(20) }] }} output={null} />);
  expect(screen.getByText('Plan')).toBeVisible();
  await userEvent.click(screen.getByText(/1 элемент/));
  expect(screen.getByRole('region', { name: 'Вызов' })).toHaveTextContent('A very long title '.repeat(20).trim());
});
