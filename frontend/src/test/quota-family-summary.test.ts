import { afterEach, expect, it } from 'vitest';
import { quotaFamilyDetails, quotaFamilyHeadline, quotaFamilyNote, quotaFamilyRowMeta, quotaFamilySummaries, quotaFamilyValue, quotaTooltip, summarizeQuotaFamily, type QuotaAccount, type QuotaAdditionalWindow, type QuotaFamilyReading } from '../lib/quotas';

const RESET = Date.UTC(2026, 0, 15, 0, 0);
const LATER = Date.UTC(2026, 0, 16, 12, 30);
const reading = (label: string, usedPercent: number | null, over: Partial<QuotaFamilyReading> = {}): QuotaFamilyReading => ({ model: label.toLowerCase().replace(/\s+/g, '-'), label, usedPercent, resetsAt: RESET, observedAt: 1_000, tone: 'neutral', ...over });
const tz = process.env.TZ;
afterEach(() => { if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz; });

it('identical readings and resets give one figure and one row naming every model', () => {
  const s = summarizeQuotaFamily('gemini', [reading('Gemini Pro Low', 25), reading('Gemini Pro High', 25), reading('Gemini Flash', 25)]);
  expect(s).toMatchObject({ family: 'gemini', title: 'Gemini', state: 'known', figure: '75%', min: 75, max: 75, partial: false, missing: [] });
  expect(s.rows).toHaveLength(1);
  expect(s.rows[0]).toMatchObject({ models: ['Gemini Pro Low', 'Gemini Pro High', 'Gemini Flash'], figure: '75%', remaining: 75, resetsAt: RESET });
  expect(quotaFamilyHeadline(s, 'en')).toBe('75% remaining');
  expect(quotaFamilyHeadline(s)).toBe('осталось 75%');
});

it('different readings give a min–max remaining range, never a mean', () => {
  const s = summarizeQuotaFamily('gemini', [reading('Pro', 60), reading('Flash', 15)]);
  expect(s.figure).toBe('40–85%');
  expect(s.figure).not.toContain('62'); expect(s.figure).not.toContain('63');
  expect(s.rows.map(r => [r.models, r.figure])).toEqual([[['Pro'], '40%'], [['Flash'], '85%']]);
  expect(quotaFamilyDetails(s, 'en')).toMatch(/^Pro: 40% remaining, resets .+; Flash: 85% remaining, resets /);
});

it('compares unrounded values and rounds only for display', () => {
  const close = summarizeQuotaFamily('claude', [reading('A', 59.6), reading('B', 59.8)]);
  expect(close.min).toBeCloseTo(40.2); expect(close.max).toBeCloseTo(40.4);
  expect(close.figure).toBe('40.2–40.4%');
  expect(close.rows).toHaveLength(2);
  // A float that only looks equal after rounding is still a range, not one figure.
  const tiny = summarizeQuotaFamily('claude', [reading('A', 60), reading('B', 60.000001)]);
  expect(tiny.figure).toBe('39.9–40%');
  expect(tiny.rows.map(r => r.figure)).toEqual(['40%', '39.999999%']);
  expect(summarizeQuotaFamily('claude', [reading('A', 33.333), reading('B', 33.333)]).figure).toBe('67%');
  expect(summarizeQuotaFamily('claude', [reading('A', 60), reading('B', 15)], { locale: 'ru-RU' }).figure).toBe('40–85%');
});

it('equal fractions with different resets show one percentage and separate rows', () => {
  const s = summarizeQuotaFamily('gemini', [reading('Pro', 60), reading('Flash', 60, { resetsAt: LATER })]);
  expect(s.figure).toBe('40%');
  expect(s.rows.map(r => [r.models, r.figure, r.resetsAt])).toEqual([[['Pro'], '40%', RESET], [['Flash'], '40%', LATER]]);
  // Equal values with an unknown reset are not known to share a reset either.
  const unknownReset = summarizeQuotaFamily('gemini', [reading('Pro', 60, { resetsAt: null }), reading('Flash', 60, { resetsAt: null })]);
  expect(unknownReset.rows).toHaveLength(2);
  expect(quotaFamilyRowMeta(unknownReset.rows[0]!, 'en')).toBe('reset unknown');
  expect(quotaFamilyRowMeta(unknownReset.rows[0]!)).toBe('сброс неизвестен');
});

it('an explicit zero is 0% remaining and nothing measured is no data', () => {
  const zero = summarizeQuotaFamily('gemini', [reading('Pro', 100, { tone: 'error' })]);
  expect(zero).toMatchObject({ state: 'known', figure: '0%', min: 0, max: 0, tone: 'error' });
  expect(quotaFamilyHeadline(zero, 'en')).toBe('0% remaining');
  for (const none of [summarizeQuotaFamily('claude', []), summarizeQuotaFamily('claude', [reading('Opus', null)]), summarizeQuotaFamily('claude', [reading('Opus', Number.NaN)]), summarizeQuotaFamily('claude', [], { partial: true })]) {
    expect(none).toMatchObject({ state: 'none', figure: null, min: null, max: null, partial: false, tone: 'neutral' });
    expect(quotaFamilyHeadline(none, 'en')).toBe('no data');
    expect(quotaFamilyHeadline(none)).toBe('нет данных');
  }
  expect(quotaFamilyValue(null)).not.toMatch(/\d/);
});

it('keeps a known reset visible without a percentage', () => {
  const s = summarizeQuotaFamily('claude', [reading('Opus', null)]);
  expect(s.rows).toHaveLength(1);
  expect(s.rows[0]).toMatchObject({ models: ['Opus'], figure: null, remaining: null, resetsAt: RESET, tone: null });
  expect(quotaFamilyDetails(s, 'en')).toMatch(/^Opus: no data, resets \S+/);
});

it('marks a partly measured or truncated family as partial and names the missing readings', () => {
  const s = summarizeQuotaFamily('gemini', [reading('Pro', 60), reading('Flash', null, { resetsAt: null }), reading('Lite', null)]);
  expect(s).toMatchObject({ state: 'partial', partial: true, figure: '40%', missing: ['Flash', 'Lite'], truncated: false });
  expect(quotaFamilyHeadline(s, 'en')).toBe('40% remaining, partial');
  expect(quotaFamilyHeadline(s)).toBe('осталось 40%, частично');
  expect(quotaFamilyNote(s, 'en')).toBe('No reading for: Flash, Lite');
  expect(quotaFamilyNote(s)).toBe('Нет показаний: Flash, Lite');
  // The unmeasured models are not averaged in and never count as zero.
  expect(s.min).toBe(40); expect(s.max).toBe(40);
  const cut = summarizeQuotaFamily('gemini', [reading('Pro', 60), reading('Flash', 15)], { partial: true });
  expect(cut).toMatchObject({ state: 'partial', partial: true, truncated: true, figure: '40–85%', missing: [] });
  expect(quotaFamilyNote(cut, 'en')).toBe('Some readings were not received');
  expect(quotaFamilyNote(summarizeQuotaFamily('gemini', [reading('Pro', 60)]))).toBeNull();
});

it('keeps model names, falling back to the native id', () => {
  const s = summarizeQuotaFamily('claude', [reading('Claude Sonnet 4.5', 10), reading('', 10, { model: 'claude-opus-4-5-thinking' }), reading('<b>Opus</b>', 30)]);
  expect(s.rows.map(r => r.models)).toEqual([['Claude Sonnet 4.5', 'claude-opus-4-5-thinking'], ['<b>Opus</b>']]);
});

it('shows reset times in the local timezone', () => {
  process.env.TZ = 'Asia/Tokyo';
  const tokyo = summarizeQuotaFamily('gemini', [reading('Pro', 60)]).rows[0]!;
  expect(quotaFamilyRowMeta(tokyo, 'en', 'en-GB')).toBe('resets 15/01, 09:00');
  process.env.TZ = 'America/New_York';
  expect(quotaFamilyRowMeta(tokyo, 'en', 'en-GB')).toBe('resets 14/01, 19:00');
  expect(quotaFamilyRowMeta(tokyo, 'ru', 'ru-RU')).toBe('сброс 14.01, 19:00');
});

it('shows the observation time only for stale data', () => {
  process.env.TZ = 'UTC';
  const observedAt = Date.UTC(2026, 0, 14, 8, 5);
  const fresh = summarizeQuotaFamily('gemini', [reading('Pro', 60, { observedAt })], { freshAt: observedAt });
  expect(fresh.rows[0]!.stale).toBe(false);
  expect(quotaFamilyRowMeta(fresh.rows[0]!, 'en', 'en-GB')).toBe('resets 15/01, 00:00');
  const older = summarizeQuotaFamily('gemini', [reading('Pro', 60, { observedAt })], { freshAt: observedAt + 3_600_000 });
  expect(older.rows[0]!.stale).toBe(true);
  expect(quotaFamilyRowMeta(older.rows[0]!, 'en', 'en-GB')).toBe('resets 15/01, 00:00 · observed 14/01, 08:05');
  const staleSnapshot = summarizeQuotaFamily('gemini', [reading('Pro', 60, { observedAt })], { stale: true, freshAt: observedAt });
  expect(quotaFamilyRowMeta(staleSnapshot.rows[0]!, 'ru', 'ru-RU')).toBe('сброс 15.01, 00:00 · данные 14.01, 08:05');
});

it('uses the worst measured used tone of the family', () => {
  const s = summarizeQuotaFamily('gemini', [reading('Pro', 20, { tone: 'neutral' }), reading('Flash', 80, { tone: 'critical' }), reading('Lite', 50, { tone: 'warning' }), reading('Old', null, { tone: 'error' })]);
  expect(s.tone).toBe('critical');
  expect(s.rows.map(r => r.tone)).toEqual(['neutral', 'critical', 'warning', null]);
  // Merged rows keep the worst tone of their members.
  expect(summarizeQuotaFamily('gemini', [reading('A', 80, { tone: 'warning' }), reading('B', 80, { tone: 'critical' })]).rows[0]!.tone).toBe('critical');
});

const win = (family: 'gemini' | 'claude' | null, label: string, usedPercent: number | null, over: Partial<QuotaAdditionalWindow> = {}): QuotaAdditionalWindow =>
  ({ id: `antigravity:${label}`, label, scope: 'model', period: null, model: label.toLowerCase(), family, usedPercent, remaining: null, resetsAt: RESET, observedAt: 5_000, tone: 'neutral', ...over });
const account = (over: Partial<QuotaAccount> = {}): QuotaAccount => ({ id: 'c1', provider: 'antigravity', account: 'work', label: 'Antigravity · work', model: 'antigravity/work', connection: 'mauzcode', kind: 'quota', windows: {},
  additionalWindows: [win('claude', 'Opus', 0), win('gemini', 'Pro', 25), win('gemini', 'Flash', 25)], families: [{ family: 'gemini', partial: false }, { family: 'claude', partial: false }], quotaStatus: 'fresh', quotaUpdatedAt: 5_000, tone: 'neutral', parkedAgents: 0, ...over });

it('projects an account into shown families, Gemini first, using only the structured family', () => {
  const both = quotaFamilySummaries(account());
  expect(both.map(s => [s.family, s.figure, s.rows.map(r => r.models)])).toEqual([['gemini', '75%', [['Pro', 'Flash']]], ['claude', '100%', [['Opus']]]]);
  // Backend order does not matter; a label that names another family does not move a window.
  const mislabeled = quotaFamilySummaries(account({ families: [{ family: 'claude', partial: false }, { family: 'gemini', partial: true }], additionalWindows: [win('gemini', 'Claude lookalike', 10), win(null, 'Gemini weekly', 99)] }));
  expect(mislabeled.map(s => [s.family, s.state, s.figure])).toEqual([['gemini', 'partial', '90%'], ['claude', 'none', null]]);
  // A family the backend does not show gets no summary, even when windows exist; no families means an ordinary card.
  expect(quotaFamilySummaries(account({ families: [{ family: 'gemini', partial: false }] })).map(s => s.family)).toEqual(['gemini']);
  expect(quotaFamilySummaries(account({ families: [] }))).toEqual([]);
  expect(quotaFamilySummaries(account({ families: undefined }))).toEqual([]);
  // A status account with shown families still yields explicit unknowns.
  expect(quotaFamilySummaries(account({ kind: 'status', windows: undefined, additionalWindows: undefined })).map(s => s.state)).toEqual(['none', 'none']);
});

it('settings and sidebar agree for the same observation', () => {
  const sidebar = quotaFamilySummaries(account({ additionalWindows: [win('gemini', 'Pro', 25), win('gemini', 'Flash', 60, { resetsAt: LATER })], families: [{ family: 'gemini', partial: false }] }), 'en-GB')[0]!;
  const settings = summarizeQuotaFamily('gemini', [{ model: 'pro', label: 'Pro', usedPercent: 25, resetsAt: RESET, observedAt: 5_000 }, { model: 'flash', label: 'Flash', usedPercent: 60, resetsAt: LATER, observedAt: 5_000 }], { locale: 'en-GB', freshAt: 5_000 });
  expect(sidebar.figure).toBe('40–75%');
  expect(settings.figure).toBe(sidebar.figure);
  expect(settings.rows.map(r => [r.models, r.figure, r.resetsAt])).toEqual(sidebar.rows.map(r => [r.models, r.figure, r.resetsAt]));
  expect(quotaFamilyDetails(settings, 'en', 'en-GB')).toBe(quotaFamilyDetails(sidebar, 'en', 'en-GB'));
});

it('the text tooltip names each family as remaining and does not count family windows as extra limits', () => {
  const text = quotaTooltip(account({ additionalWindows: [win('gemini', 'Pro', 25), win('claude', 'Opus', null), win(null, 'Shared pool', 30)] }));
  expect(text).toContain('Gemini: осталось 75%'); expect(text).toContain('Claude: нет данных');
  expect(text).toContain('Дополнительные лимиты: 1'); expect(text).toContain('Shared pool: 30%');
  expect(text).not.toContain('Квота не измерена'); expect(text).not.toContain('Pro: 25%');
});
