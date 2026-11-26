import { afterEach, expect, it } from 'vitest';
import { quotaAccountExtras, quotaFamilyDetails, quotaFamilyHeadline, quotaFamilyNote, quotaFamilySummaries, quotaResetText, quotaTooltip, quotaUsedValue, summarizeQuotaFamily, type QuotaAccount, type QuotaAdditionalWindow, type QuotaFamilyReading } from '../lib/quotas';

const RESET = Date.UTC(2026, 0, 15, 0, 0);
const LATER = Date.UTC(2026, 0, 16, 12, 30);
type Fam = 'gemini' | 'claude';
const period = (family: Fam, p: 'fiveHour' | 'weekly', usedPercent: number | null, over: Partial<QuotaFamilyReading> = {}): QuotaFamilyReading =>
  ({ id: `antigravity:${family}-${p}`, label: `${family} ${p}`, family, scope: 'group', period: p, usedPercent, resetsAt: RESET, observedAt: 1_000, tone: 'neutral', ...over });
const tz = process.env.TZ;
afterEach(() => { if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz; });

it('fills the standard used-percent cells from one group reading per period; month stays unmeasured', () => {
  const s = summarizeQuotaFamily('gemini', [period('gemini', 'fiveHour', 20), period('gemini', 'weekly', 60, { resetsAt: LATER, tone: 'warning' })]);
  expect(s).toMatchObject({ family: 'gemini', title: 'Gemini', pool: 'Gemini', state: 'known', truncated: false, extra: [], tone: 'warning' });
  expect(s.windows).toEqual({ fiveHour: { usedPercent: 20, resetsAt: RESET, tone: 'neutral' }, weekly: { usedPercent: 60, resetsAt: LATER, tone: 'warning' } });
  expect(s.windows.monthly).toBeUndefined();
  expect(quotaFamilyHeadline(s)).toBe('5 часов 20%, Неделя 60%, Месяц —');
  expect(quotaFamilyHeadline(s, 'en')).toBe('5 hours 20%, Weekly 60%, Monthly —');
});

it('distinguishes 0% used, 100% used and no data; clamps out-of-range values', () => {
  const s = summarizeQuotaFamily('claude', [period('claude', 'fiveHour', 0), period('claude', 'weekly', 100, { tone: 'error' })]);
  expect([s.windows.fiveHour?.usedPercent, s.windows.weekly?.usedPercent]).toEqual([0, 100]);
  expect(quotaUsedValue(0)).toBe('0% использовано');
  expect(quotaUsedValue(null, 'en')).toBe('no data');
  const none = summarizeQuotaFamily('claude', [period('claude', 'fiveHour', null)]);
  expect(none.state).toBe('none');
  expect(none.windows.fiveHour).toEqual({ usedPercent: null, resetsAt: RESET, tone: 'neutral' });
  expect(quotaFamilyHeadline(none)).toBe('5 часов —, Неделя —, Месяц —');
  expect(summarizeQuotaFamily('gemini', [period('gemini', 'fiveHour', 140)]).windows.fiveHour?.usedPercent).toBe(100);
});

it('a conflicting period and every non-group reading become extras, never a cell', () => {
  const s = summarizeQuotaFamily('gemini', [
    period('gemini', 'weekly', 10, { id: 'a' }), period('gemini', 'weekly', 90, { id: 'b' }), period('gemini', 'fiveHour', 30),
    { id: 'antigravity:gemini-pro-weekly', label: 'Gemini Pro weekly', family: 'gemini', scope: 'unknown', period: 'weekly', usedPercent: 70, resetsAt: LATER, observedAt: 1, tone: 'warning' },
    period('claude', 'fiveHour', 50),
  ]);
  expect(Object.keys(s.windows)).toEqual(['fiveHour']);
  expect(s.extra.map(w => [w.id, w.period, w.usedPercent])).toEqual([['a', 'weekly', 10], ['b', 'weekly', 90], ['antigravity:gemini-pro-weekly', 'weekly', 70]]);
  expect(s.tone).toBe('warning');
});

it('a truncated family says so', () => {
  const s = summarizeQuotaFamily('gemini', [period('gemini', 'fiveHour', 20)], { partial: true });
  expect(s.truncated).toBe(true);
  expect(quotaFamilyNote(s)).toBe('Часть показаний не получена');
  expect(quotaFamilyNote(s, 'en')).toBe('Some readings were not received');
  expect(quotaFamilyNote(summarizeQuotaFamily('gemini', []))).toBeNull();
});

it('shows reset times in the local timezone, or an explicit unknown', () => {
  process.env.TZ = 'Asia/Tokyo';
  expect(quotaResetText(RESET, 'en', 'en-GB')).toBe('resets 15/01, 09:00');
  process.env.TZ = 'America/New_York';
  expect(quotaResetText(RESET, 'en', 'en-GB')).toBe('resets 14/01, 19:00');
  expect(quotaResetText(RESET, 'ru', 'ru-RU')).toBe('сброс 14.01, 19:00');
  expect(quotaResetText(null)).toBe('сброс неизвестен');
});

it('details name the shared pool, each measured period with its reset, and the extras', () => {
  process.env.TZ = 'UTC';
  const s = summarizeQuotaFamily('claude', [period('claude', 'fiveHour', 10), period('claude', 'weekly', 75, { resetsAt: null }),
    { id: 'x', label: 'Opus weekly', family: 'claude', scope: 'unknown', period: 'weekly', usedPercent: 5, resetsAt: LATER, observedAt: 1, tone: 'neutral' }]);
  expect(quotaFamilyDetails(s, 'ru', 'ru-RU')).toBe('Claude/GPT лимиты; 5 часов: 10% использовано, сброс 15.01, 00:00; Неделя: 75% использовано, сброс неизвестен; Дополнительные лимиты: Opus weekly (Неделя): 5% использовано, сброс 16.01, 12:30');
  expect(quotaFamilyDetails(summarizeQuotaFamily('gemini', []), 'en')).toBe('Gemini limits; no data');
});

const win = (family: Fam | null, label: string, usedPercent: number | null, over: Partial<QuotaAdditionalWindow> = {}): QuotaAdditionalWindow =>
  ({ id: `antigravity:${label}`, label, scope: 'group', bucket: label, period: 'fiveHour', model: null, family, usedPercent, remaining: null, resetsAt: RESET, observedAt: 1_000, tone: 'neutral', ...over });
const account = (over: Partial<QuotaAccount> = {}): QuotaAccount => ({ id: 'ag', provider: 'antigravity', account: 'work', label: 'Antigravity · work', model: 'antigravity/work', connection: 'mauzcode', kind: 'quota', windows: {},
  additionalWindows: [win('gemini', 'gemini-5h', 20), win('gemini', 'gemini-weekly', 60, { period: 'weekly' }), win('claude', '3p-5h', 10), win('claude', '3p-weekly', 75, { period: 'weekly', tone: 'error' })],
  families: [{ family: 'gemini', partial: false }, { family: 'claude', partial: false }], quotaStatus: 'fresh', tone: 'error', parkedAgents: 0, ...over });

it('projects an account into shown families, Gemini first, using only the structured family', () => {
  const [g, c] = quotaFamilySummaries(account());
  expect([g!.family, g!.windows.fiveHour?.usedPercent, g!.windows.weekly?.usedPercent]).toEqual(['gemini', 20, 60]);
  expect([c!.family, c!.pool, c!.windows.fiveHour?.usedPercent, c!.windows.weekly?.usedPercent, c!.tone]).toEqual(['claude', 'Claude/GPT', 10, 75, 'error']);
  expect(quotaFamilySummaries(account({ families: [{ family: 'claude', partial: true }] })).map(s => [s.family, s.truncated])).toEqual([['claude', true]]);
  expect(quotaFamilySummaries(account({ families: undefined }))).toEqual([]);
  // A label that looks like another family does not move the reading.
  expect(quotaFamilySummaries(account({ additionalWindows: [win('claude', 'Gemini lookalike', 40)] }))[0]!.windows).toEqual({});
});

it('extras: a family-specific bucket goes to its card and the indicator; one of no shown family only to the indicator', () => {
  const extra = win('gemini', 'gemini-pro-weekly', 70, { scope: 'unknown', period: 'weekly' });
  const orphan = win(null, 'other-daily', 50, { scope: 'unknown', period: null });
  const a = account({ additionalWindows: [...account().additionalWindows!, extra, orphan] });
  const [g, c] = quotaFamilySummaries(a);
  expect(g!.extra.map(w => w.id)).toEqual([extra.id]);
  expect(c!.extra).toEqual([]);
  expect(quotaAccountExtras(a).map(w => w.id)).toEqual([extra.id, orphan.id]);
  // A hidden family's readings are no longer card cells, so they count as account extras.
  expect(quotaAccountExtras(account({ families: [{ family: 'gemini', partial: false }] })).map(w => w.id)).toEqual(['antigravity:3p-5h', 'antigravity:3p-weekly']);
});

it('the text tooltip names each family with its pool and periods and lists only real extras', () => {
  const text = quotaTooltip(account({ additionalWindows: [...account().additionalWindows!, win(null, 'other-daily', 50, { scope: 'unknown', period: null, label: 'Other daily' })] }));
  expect(text).toContain('Gemini (Gemini): 5 часов 20%, Неделя 60%, Месяц —');
  expect(text).toContain('Claude (Claude/GPT): 5 часов 10%, Неделя 75%, Месяц —');
  expect(text).toContain('Дополнительные лимиты: 1');
  expect(text).toContain('Other daily: 50%');
});
