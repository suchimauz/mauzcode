import { expect, it } from 'vitest';
import { quotaAccountCaption, quotaAccountTitle, quotaOpenTarget, quotaTooltip, type QuotaAccount, type QuotaAdditionalWindow } from '../lib/quotas';

const RESET = Date.UTC(2031, 0, 2, 3, 4);
const extra = (over: Partial<QuotaAdditionalWindow> = {}): QuotaAdditionalWindow =>
  ({ id: 'antigravity:gemini-pro-weekly', label: 'Gemini Pro weekly', scope: 'unknown', bucket: 'gemini-pro-weekly', period: 'weekly', model: null, family: 'gemini', usedPercent: 70, remaining: null, resetsAt: RESET, observedAt: 1, tone: 'warning', ...over });
const pool = (over: Partial<QuotaAccount> = {}): QuotaAccount => ({
  id: 'ag:claude', connectionId: 'ag', family: 'claude', provider: 'antigravity', account: 'work', label: 'Antigravity · work', model: 'antigravity/work', connection: 'mauzcode', kind: 'quota',
  windows: { fiveHour: { usedPercent: 10, resetsAt: RESET, tone: 'neutral' }, weekly: { usedPercent: 75, resetsAt: RESET, tone: 'error' } }, additionalWindows: [], quotaStatus: 'fresh', tone: 'error', parkedAgents: 0, ...over });
const ordinary: QuotaAccount = { id: 'c1', provider: 'claude', account: 'me', label: 'Claude · me', model: 'claude/me', connection: 'mauzcode', kind: 'quota', windows: {}, tone: 'neutral', parkedAgents: 0 };

it('a pool account is captioned by its family and account; ordinary accounts keep their caption', () => {
  expect(quotaAccountCaption(pool())).toBe('Claude · work');
  expect(quotaAccountCaption(pool({ id: 'ag:gemini', family: 'gemini' }))).toBe('Gemini · work');
  expect(quotaAccountCaption(ordinary)).toBe('me');
  expect(quotaAccountTitle(pool())).toBe('Antigravity · work · Claude/GPT');
  expect(quotaAccountTitle(ordinary)).toBe('Claude · me');
});

it('activating a pool card targets its connection and family; ordinary cards target nothing', () => {
  expect(quotaOpenTarget(pool())).toEqual({ account: 'ag', family: 'claude' });
  expect(quotaOpenTarget(ordinary)).toBeUndefined();
});

it('the text tooltip of a pool account uses the standard period lines and additional limits', () => {
  const text = quotaTooltip(pool({ id: 'ag:gemini', family: 'gemini', additionalWindows: [extra()], partial: true }), 'ru');
  expect(text.split('\n')[0]).toBe('Antigravity · work · Gemini');
  expect(text).toMatch(/\n5 часов: 10%, сброс /);
  expect(text).toMatch(/\nНеделя: 75%, сброс /);
  expect(text).toContain('Дополнительные лимиты: 1');
  expect(text).toContain('Gemini Pro weekly: 70%');
  expect(text).toContain('Часть показаний не получена');
  expect(text).not.toContain('использовано');
});
