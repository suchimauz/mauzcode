import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TranscriptMessage } from '../components/mauzcode/TranscriptMessage';
import { Transcript } from '../components/mauzcode/Transcript';
import { ToolRow } from '../components/mauzcode/ToolRow';
import { workTurns } from '../components/mauzcode/transcriptGroups';
import type { ChatEvent } from '../lib/mauzcode';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ev = (idx: number, type: string, extra: Partial<ChatEvent> = {}): ChatEvent => ({ idx, ts: idx * 1000, type, text: null, ...extra });
const notice = (idx: number, lifecycle: Record<string, string | number>) => ev(idx, 'trigger_lifecycle', { lifecycle });

it.each([
  [{ transition: 'created', triggerKind: 'at', purpose: 'Check build' }, 'Разовый запуск добавлен'],
  [{ transition: 'cancelled', triggerKind: 'cron', purpose: 'Report', cause: 'manual', cronExpression: '0 9 * * *', timezone: 'UTC' }, 'Расписание отменено'],
  [{ transition: 'cancelled', triggerKind: 'watch', purpose: 'Wait', cause: 'task' }, 'Условие отменено вместе с задачей'],
  [{ transition: 'expired', triggerKind: 'watch', purpose: 'Deploy' }, 'Условие: срок истёк'],
])('renders %o as a system disclosure, not a human message', (lifecycle, title) => {
  const { container } = render(<TranscriptMessage agentId="a" event={notice(1, lifecycle)} />);
  expect(screen.getByText(title).closest('summary')).toBeTruthy();
  expect(container.querySelector('[data-system-event="trigger"]')).toBeTruthy();
  expect(container.querySelector('.message--user')).toBeNull();
});

it('purpose is inert text and a foreign creator is named with a link', () => {
  const { container } = render(<TranscriptMessage agentId="a" event={notice(1, { transition: 'created', triggerKind: 'at', purpose: '<img src=x onerror=alert(1)>', creatorAgentId: 'peer/1', creatorTitle: 'Builder' })} />);
  expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeTruthy();
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText(/Создал агент Builder/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Открыть чат создателя' })).toHaveAttribute('href', '/agent/peer%2F1');
});

it('a lifecycle notice never decides that work finished', () => {
  const turns = workTurns([ev(0, 'user', { text: 'go', messageIdx: 0 }), ev(1, 'tool_call', { name: 'agent.wake' }), ev(2, 'assistant', { text: 'Done', isFinalReply: true }), notice(3, { transition: 'expired', triggerKind: 'watch' })], false);
  expect(turns[0]!.status).toBe('completed');
  expect(turns[0]!.answer?.idx).toBe(2);
});

it('notices stay visible while completed work is collapsed', () => {
  const events = [ev(0, 'user', { text: 'Q', messageIdx: 0 }), ev(1, 'tool_call', { name: 'bash' }), notice(2, { transition: 'cancelled', triggerKind: 'at', purpose: 'Visible' }), ev(3, 'assistant', { text: 'Answer', isFinalReply: true }), ev(4, 'user', { text: 'Next', messageIdx: 4 }), ev(5, 'assistant', { text: 'Ok', isFinalReply: true })];
  render(<Transcript agentId="a" events={events} page={null} hasOlder={false} loadingOlder={false} loadOlder={async () => {}} />);
  const toggle = screen.getAllByRole('button', { name: /Завершено/ })[0]!;
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getAllByText('Разовый запуск отменён').filter(node => node.closest('[hidden]') === null)).toHaveLength(1);
  fireEvent.click(toggle);
  expect(screen.getAllByText('Разовый запуск отменён').filter(node => node.closest('[hidden]') === null)).toHaveLength(1);
});

it('a tool card that created a trigger shows a badge', () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { headers: { 'content-type': 'application/json' } })));
  render(<ToolRow agentId="a" event={ev(1, 'tool_call', { name: 'agent.wake', createdTriggers: [{ id: 'tr_1', kind: 'at', ownerAgentId: 'a' }] })} />);
  expect(screen.getByText('Триггер создан')).toHaveAttribute('title', 'tr_1');
});
