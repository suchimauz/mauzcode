import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorRow } from '../components/mauzcode/ErrorRow';
import { TranscriptMessage } from '../components/mauzcode/TranscriptMessage';
import type { ChatEvent } from '../lib/mauzcode';

const base: ChatEvent = { idx: 12, ts: Date.now(), type: 'error', text: 'Connection Asoft LLM Gate is disabled' };

describe('chat error row', () => {
  it('is routed from the transcript as an error row, not an assistant message', () => {
    const { container } = render(<TranscriptMessage event={base} agentId="ps" />);
    expect(container.querySelector('.error-row')).not.toBeNull();
    expect(container.querySelector('.message--assistant')).toBeNull();
    expect(screen.getByText('Connection Asoft LLM Gate is disabled')).toBeInTheDocument();
  });

  it.each(['Provider HTTP 403', 'Provider HTTP 400: <img src=x onerror=alert(1)>'])('renders historical provider text literally: %s', text => {
    const { container } = render(<TranscriptMessage event={{ ...base, text }} agentId="ps" />);
    expect(screen.getByText(text)).toBeVisible();
    expect(container.querySelector('img')).toBeNull();
  });

  it('has no disclosure for a single short line', () => {
    render(<ErrorRow event={base} />);
    expect(screen.getByRole('button', { name: /Ошибка/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Ошибка/ })).not.toHaveAttribute('aria-expanded');
  });

  it('shows the first line and expands the full multi-line text', async () => {
    const text = 'TypeError: boom\n    at a (x.ts:1)\n    at b (y.ts:2)';
    const { container } = render(<ErrorRow event={{ ...base, text }} />);
    const toggle = screen.getByRole('button', { name: /Ошибка/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('pre')).toBeNull();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('pre')?.textContent).toBe(text);
  });

  it('copies the full text', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ErrorRow event={{ ...base, text: 'line one\nline two' }} />);
    await user.click(screen.getByRole('button', { name: 'Копировать ошибку' }));
    expect(writeText).toHaveBeenCalledWith('line one\nline two');
    expect(screen.getByRole('button', { name: 'Скопировано' })).toBeInTheDocument();
  });

  it('announces only the latest error', () => {
    const view = render(<TranscriptMessage event={base} agentId="ps" latestIdx={12} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Connection Asoft LLM Gate is disabled');
    view.rerender(<TranscriptMessage event={base} agentId="ps" latestIdx={13} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a user stop as a neutral notice', () => {
    const { container } = render(<TranscriptMessage event={{ ...base, text: 'stopped by user' }} agentId="ps" />);
    expect(container.querySelector('.error-row')).toBeNull();
    expect(container.querySelector('.transcript-notice')).toHaveTextContent('Выполнение остановлено пользователем');
  });
});
