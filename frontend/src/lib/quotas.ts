import { requestJson } from './mauzcode';
import type { NavigationIcon } from './navigation';

export type QuotaTone = 'neutral' | 'warning' | 'critical' | 'error';
/** One measured quota period; null percent means the provider did not report it. */
export type QuotaWindow = { usedPercent: number | null; resetsAt: number | null; tone: QuotaTone };
export type QuotaPeriod = 'fiveHour' | 'weekly' | 'monthly';
/** Model family of a model-scoped measurement. Always structural: never derived from a label or a provider id. */
export type QuotaFamily = 'gemini' | 'claude';
/** A limit outside the main columns: model-specific, unknown period/scope, or conflicting. Null means not reported. */
export type QuotaAdditionalWindow = {
  id: string; label: string;
  /** `group`: a provider family-pool reading (with `family`, `period` and `bucket`) shown in that family's period cells. */
  scope: 'account' | 'model' | 'group' | 'unknown'; period: QuotaPeriod | null; model: string | null;
  /** Stable provider bucket identity, when reported. */
  bucket?: string | null;
  /** Structured model family of the reading; never derived from a label. `usedPercent` is always the used share. */
  family?: QuotaFamily | null;
  usedPercent: number | null; remaining: number | null; resetsAt: number | null;
  /** Epoch ms of this window's own observation; may predate quotaUpdatedAt after a partial refresh. */
  observedAt: number | null;
  tone: QuotaTone;
};
/** Unified provider quota row from GET /api/v1/quotas. Providers without usage report kind "status". */
export type QuotaAccount = {
  id: string; provider: string; account: string; label: string; model: string;
  connection: 'local' | 'mauzcode' | 'ssh'; host?: string;
  kind: 'quota' | 'status';
  windows?: Partial<Record<QuotaPeriod, QuotaWindow>>;
  /** Limits not shown in the main columns; absent from older servers. */
  additionalWindows?: QuotaAdditionalWindow[];
  /** Families to show as their own cards (an enabled model exists), Gemini first; `partial` = the backend truncated its readings. Absent or empty: ordinary card. */
  families?: { family: QuotaFamily; partial: boolean }[];
  status?: 'available' | 'unavailable' | 'disabled' | 'unknown';
  quotaStatus?: 'fresh' | 'stale' | 'unavailable';
  /** Epoch ms of the last successful quota fetch; shown instead of "Fresh data" when stale. */
  quotaUpdatedAt?: number | null;
  tone: QuotaTone; planType?: string | null; needsReconnect?: boolean; parkedAgents: number;
  icon?: NavigationIcon | null;
};
export type QuotasResponse = { updatedAt: number; accounts: QuotaAccount[] };
/** What activating a family card asks to show: that connection's usage, with the family in view. `account` is the quota account id (the connection id). */
export type QuotaOpenTarget = { account: string; family: QuotaFamily };

export const QUOTA_PERIODS: { key: QuotaPeriod; label: string; title: string }[] = [
  { key: 'fiveHour', label: '5ч', title: '5 часов' },
  { key: 'weekly', label: 'Нед.', title: 'Неделя' },
  { key: 'monthly', label: 'Мес.', title: 'Месяц' },
];

export function getQuotas(signal?: AbortSignal) { return requestJson<QuotasResponse>('/api/v1/quotas', { signal }); }
/** Inert native provider marks keyed by provider id, served by the UI bridge. */
export function getProviderIcons(signal?: AbortSignal) { return requestJson<{ icons: Record<string, NavigationIcon | null> }>('/ui-lab-api/provider-icons', { signal }); }

const TONE_RANK: Record<QuotaTone, number> = { neutral: 0, warning: 1, critical: 2, error: 3 };
/** Worst backend tone across accounts; the frontend never recomputes thresholds. */
export function worstQuotaTone(accounts: QuotaAccount[]): QuotaTone {
  return worstTone(accounts.map(a => a.tone));
}
/** Worst of several backend tones; neutral when empty. */
export function worstTone(tones: QuotaTone[]): QuotaTone {
  return tones.reduce<QuotaTone>((worst, t) => TONE_RANK[t] > TONE_RANK[worst] ? t : worst, 'neutral');
}

/** Short account caption: drops provider and host noise from backend labels. */
export function quotaAccountCaption(a: QuotaAccount): string {
  if (a.account && a.account !== 'default') return a.account;
  const head = a.label.split('·')[0]?.trim();
  return head || a.provider;
}

export function quotaStatusSymbol(status: QuotaAccount['status']): string {
  return status === 'available' ? '✓' : status === 'unavailable' ? '!' : status === 'disabled' ? '−' : '?';
}

const shortDate = (at: number, locale?: string) => new Date(at).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Provider name shown on a card: the head of the backend label (`Antigravity · work`), else the provider id. */
export function quotaProviderName(a: QuotaAccount): string {
  return a.label.split('·')[0]?.trim() || a.provider;
}

/** Display order of model families; `pool` names the shared provider pool a family's limits belong to. */
export const QUOTA_FAMILIES: { key: QuotaFamily; title: string; pool: string }[] = [{ key: 'gemini', title: 'Gemini', pool: 'Gemini' }, { key: 'claude', title: 'Claude', pool: 'Claude/GPT' }];
/** One family pool reading: a structured family window (`scope: "group"` with a `period`), or an extra limit of that family. */
export type QuotaFamilyReading = {
  id: string; label: string; family: QuotaFamily; scope: QuotaAdditionalWindow['scope']; period: QuotaPeriod | null;
  usedPercent?: number | null; resetsAt?: number | null; observedAt?: number | null; tone?: QuotaTone;
};
/** Summary of one model family of one connection, shared by the sidebar family cards and the settings usage view. */
export type QuotaFamilySummary = {
  family: QuotaFamily; title: string;
  /** Shared provider pool the family's limits belong to, e.g. `Claude/GPT`. */
  pool: string;
  /** Standard used-percent cells: exactly one structured family window per period, else unmeasured (`—`). */
  windows: Partial<Record<QuotaPeriod, QuotaWindow>>;
  /** Other identified limits of this family (model-specific, unknown or conflicting periods); never a period cell. */
  extra: QuotaAdditionalWindow[];
  /** known: some period measured; none: nothing measured. */
  state: 'known' | 'none';
  /** The backend dropped some of this family's readings. */
  truncated: boolean;
  /** Worst tone among the period cells and extras. */
  tone: QuotaTone;
};

const known = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Summarizes one family's structured readings into the standard five-hour/weekly/monthly used-percent cells.
 * A cell is filled only by a single `group` reading of that period; a missing or conflicting period stays `—`, never
 * 0% or 100%. Every other reading of the family is an extra limit for its details. Labels never classify.
 */
export function summarizeQuotaFamily(family: QuotaFamily, readings: QuotaFamilyReading[], opts: { partial?: boolean } = {}): QuotaFamilySummary {
  const own = readings.filter(r => r.family === family);
  const claims = new Map<QuotaPeriod, number>();
  for (const r of own) if (r.scope === 'group' && r.period) claims.set(r.period, (claims.get(r.period) ?? 0) + 1);
  const windows: Partial<Record<QuotaPeriod, QuotaWindow>> = {};
  const extra: QuotaAdditionalWindow[] = [];
  for (const r of own) {
    const used = known(r.usedPercent) ? Math.max(0, Math.min(100, r.usedPercent)) : null;
    const resetsAt = known(r.resetsAt) && r.resetsAt > 0 ? r.resetsAt : null;
    const tone = r.tone ?? 'neutral';
    if (r.scope === 'group' && r.period && claims.get(r.period) === 1) { windows[r.period] = { usedPercent: used, resetsAt, tone }; continue; }
    extra.push({ id: r.id, label: r.label, scope: r.scope, period: r.period, model: null, family, usedPercent: used, remaining: null, resetsAt, observedAt: known(r.observedAt) ? r.observedAt : null, tone });
  }
  const measured = [...Object.values(windows), ...extra].filter(w => w && w.usedPercent !== null) as { tone: QuotaTone }[];
  const meta = QUOTA_FAMILIES.find(f => f.key === family);
  return { family, title: meta?.title ?? family, pool: meta?.pool ?? family, windows, extra, state: measured.length ? 'known' : 'none', truncated: opts.partial === true, tone: worstTone(measured.map(w => w.tone)) };
}

/** Family readings of a quota account's additional windows (structured `family` only). */
export function quotaFamilyReadings(a: QuotaAccount): QuotaFamilyReading[] {
  return (a.additionalWindows ?? []).flatMap(w => w.family ? [{ id: w.id, label: w.label, family: w.family, scope: w.scope, period: w.period, usedPercent: w.usedPercent, resetsAt: w.resetsAt, observedAt: w.observedAt, tone: w.tone }] : []);
}

/** Family summaries of an account in display order (Gemini, then Claude); empty when the account shows no family. */
export function quotaFamilySummaries(a: QuotaAccount): QuotaFamilySummary[] {
  const shown = a.families ?? [];
  if (!shown.length) return [];
  const readings = quotaFamilyReadings(a);
  return QUOTA_FAMILIES.flatMap(f => {
    const entry = shown.find(x => x.family === f.key);
    return entry ? [summarizeQuotaFamily(f.key, readings, { partial: entry.partial === true })] : [];
  });
}

/** Limits of an account that belong to no shown family card: non-family limits and extras of hidden families. */
export function quotaAccountExtras(a: QuotaAccount): QuotaAdditionalWindow[] {
  const shown = new Set((a.families ?? []).map(f => f.family));
  const claims = new Map<string, number>();
  for (const w of a.additionalWindows ?? []) if (w.family && w.scope === 'group' && w.period) claims.set(`${w.family}:${w.period}`, (claims.get(`${w.family}:${w.period}`) ?? 0) + 1);
  // Everything except the readings that fill a shown family's period cells.
  return (a.additionalWindows ?? []).filter(w => !(w.family && shown.has(w.family) && w.scope === 'group' && w.period && claims.get(`${w.family}:${w.period}`) === 1));
}

export type QuotaLang = 'ru' | 'en';
const FAMILY_TEXT = {
  ru: { used: 'использовано', none: 'нет данных', reset: 'сброс', noReset: 'сброс неизвестен', truncated: 'Часть показаний не получена', pool: 'лимиты', extra: 'Дополнительные лимиты' },
  en: { used: 'used', none: 'no data', reset: 'resets', noReset: 'reset unknown', truncated: 'Some readings were not received', pool: 'limits', extra: 'Additional limits' },
};
const PERIOD_TEXT: Record<QuotaLang, Record<QuotaPeriod, string>> = {
  ru: { fiveHour: '5 часов', weekly: 'Неделя', monthly: 'Месяц' },
  en: { fiveHour: '5 hours', weekly: 'Weekly', monthly: 'Monthly' },
};
/** Name of a period in the given language. */
export function quotaPeriodTitle(p: QuotaPeriod, lang: QuotaLang = 'ru'): string { return PERIOD_TEXT[lang][p]; }
/** Used share as words, or an explicit unknown: `20% использовано` / `нет данных`. */
export function quotaUsedValue(used: number | null | undefined, lang: QuotaLang = 'ru'): string {
  return known(used) ? `${Math.round(used)}% ${FAMILY_TEXT[lang].used}` : FAMILY_TEXT[lang].none;
}
/** Local reset time or an explicit unknown. */
export function quotaResetText(at: number | null | undefined, lang: QuotaLang = 'ru', locale?: string): string {
  return known(at) && at > 0 ? `${FAMILY_TEXT[lang].reset} ${shortDate(at, locale)}` : FAMILY_TEXT[lang].noReset;
}
/** Family headline for accessible names: each standard period with its used share or `—`. */
export function quotaFamilyHeadline(s: QuotaFamilySummary, lang: QuotaLang = 'ru'): string {
  return QUOTA_PERIODS.map(p => { const w = s.windows[p.key]; return `${quotaPeriodTitle(p.key, lang)} ${w && known(w.usedPercent) ? `${Math.round(w.usedPercent)}%` : '—'}`; }).join(', ');
}
/** What is incomplete in a family; null when complete. */
export function quotaFamilyNote(s: QuotaFamilySummary, lang: QuotaLang = 'ru'): string | null {
  return s.truncated ? FAMILY_TEXT[lang].truncated : null;
}
/** Plain-text details: pool, each measured period with its reset, extra limits, then the note. */
export function quotaFamilyDetails(s: QuotaFamilySummary, lang: QuotaLang = 'ru', locale?: string): string {
  const t = FAMILY_TEXT[lang];
  const periods = QUOTA_PERIODS.flatMap(p => { const w = s.windows[p.key]; return w ? [`${quotaPeriodTitle(p.key, lang)}: ${quotaUsedValue(w.usedPercent, lang)}, ${quotaResetText(w.resetsAt, lang, locale)}`] : []; });
  const extra = s.extra.map(w => `${w.label}${w.period ? ` (${quotaPeriodTitle(w.period, lang)})` : ''}: ${quotaUsedValue(w.usedPercent, lang)}, ${quotaResetText(w.resetsAt, lang, locale)}`);
  const note = quotaFamilyNote(s, lang);
  return [`${s.pool} ${t.pool}`, ...(periods.length ? periods : [t.none]), ...(extra.length ? [`${t.extra}: ${extra.join('; ')}`] : []), ...(note ? [note] : [])].join('; ');
}

/** Measured value of an additional limit: percent, else remaining amount, else an explicit unknown. */
export function additionalQuotaValue(w: QuotaAdditionalWindow): string {
  return w.usedPercent != null ? `${Math.round(w.usedPercent)}%` : w.remaining != null ? `осталось ${w.remaining}` : 'нет данных';
}

/** Multiline tooltip: periods with local reset time, additional limits, plan and parked agents. */
export function quotaTooltip(a: QuotaAccount, locale?: string): string {
  const lines = [a.label];
  const families = quotaFamilySummaries(a);
  const extra = families.length ? quotaAccountExtras(a) : a.additionalWindows ?? [];
  for (const s of families) lines.push(`${s.title} (${s.pool}): ${quotaFamilyHeadline(s)}`);
  if (a.kind === 'status') { if (!families.length) lines.push(`Статус: ${a.status ?? 'unknown'}`); }
  else for (const p of QUOTA_PERIODS) {
    const w = a.windows?.[p.key];
    if (!w) continue;
    const pct = w.usedPercent == null ? 'нет данных' : `${Math.round(w.usedPercent)}%`;
    const reset = w.resetsAt ? `, сброс ${shortDate(w.resetsAt, locale)}` : '';
    lines.push(`${p.title}: ${pct}${reset}`);
  }
  if (a.kind === 'quota' && !families.length && !QUOTA_PERIODS.some(p => a.windows?.[p.key]) && !extra.length) lines.push('Квота не измерена');
  if (a.kind === 'quota' && extra.length) {
    lines.push(`Дополнительные лимиты: ${extra.length}`);
    for (const w of extra) lines.push(`${w.label}: ${additionalQuotaValue(w)}${w.resetsAt ? `, сброс ${shortDate(w.resetsAt, locale)}` : ', сброс неизвестен'}`);
  }
  if (a.quotaStatus === 'stale') lines.push('Данные устарели');
  if (a.needsReconnect) lines.push('Нужно переподключить');
  if (a.planType) lines.push(`План: ${a.planType}`);
  if (a.parkedAgents) lines.push(`Ждут агенты: ${a.parkedAgents}`);
  return lines.join('\n');
}
