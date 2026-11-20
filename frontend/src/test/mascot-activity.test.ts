import { describe, expect, it } from 'vitest';
import { mascotActivity, toolActivity } from '../lib/mascotActivity';
import { imageFor, imageMascots } from '../lib/imageMascots';
import type { EventPage } from '../lib/mauzcode';
const page = (patch: Partial<EventPage> = {}): EventPage => ({ agentId: 'a', events: [], olderBefore: null, hasOlder: false, isRunning: false, runState: 'idle', lastError: null, partial: null, ...patch });
const tool = (name: string, args?: Record<string, unknown>) => ({ id: '1', name, startedAt: 1, state: 'running' as const, tail: '', args });
describe('mascot activity', () => {
  it.each([
    ['bash', { command: 'ls -la' }, 'command'], ['bash', { command: 'git status' }, 'git'], ['bash', { command: 'cd /x && git log' }, 'git'],
    ['bash', { command: 'bun run test src/a.test.ts' }, 'testing'], ['bash', { command: 'CI=1 vitest run' }, 'testing'], ['bash', undefined, 'command'],
    ['edit', undefined, 'editing'], ['write', undefined, 'editing'], ['read', undefined, 'reading'], ['read_result', undefined, 'reading'],
    ['grep', undefined, 'searching'], ['find', undefined, 'searching'], ['websearch_search', undefined, 'browsing'], ['browser_navigate', undefined, 'browsing'],
    ['delegate_task', undefined, 'delegating'], ['todo_update', undefined, 'planning'], ['todo_done', undefined, 'planning'], ['request_input', undefined, 'waiting'],
    ['tools_eval', undefined, 'command'],
  ] as const)('%s %j → %s', (name, args, expected) => { expect(toolActivity(name, args)).toBe(expected); });
  it('orders tool, compaction, thinking, error, idle', () => {
    expect(mascotActivity(null)).toBe('idle');
    expect(mascotActivity(page({ lastError: 'x' }))).toBe('error');
    expect(mascotActivity(page({ isRunning: true }))).toBe('thinking');
    expect(mascotActivity(page({ isRunning: true, thinking: { startedAt: 1 } }))).toBe('thinking');
    expect(mascotActivity(page({ isRunning: true, compactionRetry: { attempt: 1, maxRetries: 3, delayMs: 1, startedAt: 1, code: null } }))).toBe('compacting');
    expect(mascotActivity(page({ isRunning: true, lastError: 'old', activeTools: [tool('grep')] }))).toBe('searching');
  });
  it('falls back to working, then idle, for image pets without dedicated art', () => {
    expect(imageFor(imageMascots.calico, 'browsing')).toBe('typing.png');
    expect(imageFor(imageMascots.calico, 'reading')).toBe('typing.png');
    expect(imageFor(imageMascots.calico, 'idle')).toBe('idle.png');
    expect(imageFor(imageMascots.claude, 'compacting')).toBe('compacting.svg');
  });
});
