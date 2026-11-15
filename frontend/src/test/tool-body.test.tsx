import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolBody } from '../components/mauzcode/ToolBody';
const details = { idx: 1, ts: 1, type: 'tool_result', name: 'read', args: '{"path":"test.ts"}', argsTruncated: false, result: Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n'), resultTruncated: false, isError: false };
it('shows eight read lines first and keeps raw arguments in a separate disclosure', async () => {
  render(<ToolBody details={details} kind="read" args={{ path: 'test.ts' }} />);
  expect(screen.getByText('line 8')).toBeVisible();
  expect(screen.queryByText('line 9')).toBeNull();
  expect(screen.getByText('Исходные аргументы').closest('details')).not.toHaveAttribute('open');
  await userEvent.click(screen.getByRole('button', { name: 'Показать все 12 строк' }));
  expect(screen.getByText('line 12')).toBeVisible();
});
it('renders a terminal command without an arguments heading', () => {
  render(<ToolBody details={{ ...details, result: 'Build complete' }} kind="bash" args={{ command: 'bun run build' }} />);
  expect(screen.getByText('bun run build')).toBeVisible();
  expect(screen.getByText('Build complete')).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Аргументы' })).toBeNull();
});
it('separates Eval input and output into labeled sections', () => {
  render(<ToolBody details={{ ...details, name: 'tools_eval', args: '{"code":"return 42"}', result: '42' }} kind="tools_eval" args={{ code: 'return 42' }} />);
  expect(screen.getByRole('region', { name: 'Ввод' })).toHaveTextContent('return 42');
  expect(screen.getByRole('region', { name: 'Вывод' })).toHaveTextContent('42');
  expect(screen.getByRole('region', { name: 'Вывод' })).not.toHaveTextContent('return');
});
it('shows the RTK outcome and the actually executed command next to the original bash command', () => {
  const rtk = { outcome: 'rewritten', original: 'git log', executed: 'rtk git log', code: 3, notice: null, diagnostic: null };
  render(<ToolBody details={{ ...details, name: 'bash', result: 'compact log', rtk }} kind="bash" args={{ command: 'git log' }} />);
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
