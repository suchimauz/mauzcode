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
  id: string; label: string; scope: 'account' | 'model' | 'unknown'; period: QuotaPeriod | null; model: string | null;
  /** Set on a family measurement: `model` is the stable native id, `usedPercent` the used share (remaining = 100 − used). */
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

export const QUOTA_FAMILIES: { key: QuotaFamily; title: string }[] = [{ key: 'gemini', title: 'Gemini' }, { key: 'claude', title: 'Claude' }];
/** One model's measurement inside a family. `usedPercent` is the USED share 0–100; null or non-finite means not measured. */
export type QuotaFamilyReading = { model?: string | null; label: string; usedPercent?: number | null; resetsAt?: number | null; observedAt?: number | null; tone?: QuotaTone };
/** One detail row: models are merged only when both the remaining value and the reset are known and equal. */
export type QuotaFamilyRow = {
  key: string; models: string[];
  /** Unrounded remaining percent; null when not measured. */
  remaining: number | null;
  /** Rounded remaining for display, e.g. `40%`; null when not measured. */
  figure: string | null;
  resetsAt: number | null; observedAt: number | null;
  /** The observation is older than the snapshot it is shown with, so its own time must be displayed. */
  stale: boolean;
  tone: QuotaTone | null;
};
/** Remaining quota of one model family of one connection, shared by the sidebar cards and the settings usage view. */
export type QuotaFamilySummary = {
  family: QuotaFamily; title: string;
  /** known: every reading measured; partial: some missing or truncated; none: nothing measured. */
  state: 'known' | 'partial' | 'none';
  /** Unrounded remaining bounds over the measured readings. */
  min: number | null; max: number | null;
  /** One figure when measured values agree, else a min–max range; null when nothing is measured. Never a mean. */
  figure: string | null;
  partial: boolean;
  /** The backend dropped some of this family's readings. */
  truncated: boolean;
  rows: QuotaFamilyRow[];
  /** Names of models without a remaining value. */
  missing: string[];
  /** Worst backend tone among measured readings (used-percent severity). */
  tone: QuotaTone;
};

const known = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
/** A reading this much older than its snapshot is shown with its own observation time; times display to the minute. */
const STALE_AFTER_MS = 60_000;
/** Use just enough decimal places to distinguish different measured percentages after localization. */
function remainingFormat(values: number[], locale?: string): Intl.NumberFormat {
  const unique = [...new Set(values)];
  for (let digits = 0; ; digits++) {
    const format = new Intl.NumberFormat(locale, { maximumFractionDigits: digits });
    if (digits === 16 || new Set(unique.map(format.format)).size === unique.length) return format;
  }
}

/** Keep the shared headline narrow. When finer precision won't fit, round the endpoints outwards, not to one value. */
function remainingFigure(min: number, max: number, locale?: string): string {
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const whole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  if (min === max) return `${whole.format(min)}%`;
  if (whole.format(min) !== whole.format(max)) return `${whole.format(min)}–${whole.format(max)}%`;
  const a = format.format(min), b = format.format(max);
  if (a !== b) return `${a}–${b}%`;
  return `${format.format(Math.floor(min * 10) / 10)}–${format.format(Math.ceil(max * 10) / 10)}%`;
}

/**
 * Summarizes one family's readings. Unrounded values are compared first; equal known values give one figure and
 * differing ones a min–max remaining range. Nothing measured is `none`, never 0% or 100%; an explicit zero is 0%.
 * `freshAt` is the time of the snapshot the readings are shown with; `stale` marks the whole snapshot as outdated.
 */
export function summarizeQuotaFamily(family: QuotaFamily, readings: QuotaFamilyReading[], opts: { partial?: boolean; locale?: string; stale?: boolean; freshAt?: number | null } = {}): QuotaFamilySummary {
  const rows: QuotaFamilyRow[] = [];
  const merged = new Map<string, QuotaFamilyRow>();
  const missing: string[] = [];
  const measured: number[] = [];
  const tones: QuotaTone[] = [];
  for (const [i, r] of readings.entries()) {
    const name = r.label || r.model || `#${i + 1}`;
    const remaining = known(r.usedPercent) ? 100 - Math.max(0, Math.min(100, r.usedPercent)) : null;
    const resetsAt = known(r.resetsAt) && r.resetsAt > 0 ? r.resetsAt : null;
    const observedAt = known(r.observedAt) && r.observedAt > 0 ? r.observedAt : null;
    const stale = opts.stale === true || (observedAt !== null && known(opts.freshAt) && opts.freshAt - observedAt > STALE_AFTER_MS);
    const tone = remaining === null ? null : r.tone ?? 'neutral';
    if (remaining === null) missing.push(name); else { measured.push(remaining); tones.push(tone!); }
    // Unrounded value and reset must both be known and equal; anything else stays its own row.
    const key = remaining !== null && resetsAt !== null ? `${remaining}@${resetsAt}` : null;
    const same = key === null ? undefined : merged.get(key);
    if (same) {
      same.models.push(name);
      if (observedAt !== null && (same.observedAt === null || observedAt < same.observedAt)) same.observedAt = observedAt;
      same.stale = same.stale || stale;
      same.tone = worstTone([same.tone ?? 'neutral', tone ?? 'neutral']);
      continue;
    }
    const row: QuotaFamilyRow = { key: key ?? `${r.model ?? name}#${i}`, models: [name], remaining, figure: null, resetsAt, observedAt, stale, tone };
    rows.push(row);
    if (key !== null) merged.set(key, row);
  }
  const min = measured.length ? Math.min(...measured) : null, max = measured.length ? Math.max(...measured) : null;
  const detailFormat = remainingFormat(measured, opts.locale);
  for (const row of rows) if (row.remaining !== null) row.figure = `${detailFormat.format(row.remaining)}%`;
  const truncated = opts.partial === true;
  const partial = min !== null && (missing.length > 0 || truncated);
  return {
    family, title: QUOTA_FAMILIES.find(f => f.key === family)?.title ?? family,
    state: min === null ? 'none' : partial ? 'partial' : 'known', min, max,
    figure: min === null || max === null ? null : remainingFigure(min, max, opts.locale),
    partial, truncated, rows, missing, tone: worstTone(tones),
  };
}

/** Family summaries of an account in display order (Gemini, then Claude); empty when the account shows no family. */
export function quotaFamilySummaries(a: QuotaAccount, locale?: string): QuotaFamilySummary[] {
  const shown = a.families ?? [];
  if (!shown.length) return [];
  return QUOTA_FAMILIES.flatMap(f => {
    const entry = shown.find(x => x.family === f.key);
    if (!entry) return [];
    const windows = (a.additionalWindows ?? []).filter(w => w.family === f.key);
    return [summarizeQuotaFamily(f.key, windows.map(w => ({ model: w.model, label: w.label, usedPercent: w.usedPercent, resetsAt: w.resetsAt, observedAt: w.observedAt, tone: w.tone })),
      { partial: entry.partial === true, locale, stale: a.quotaStatus === 'stale', freshAt: a.quotaUpdatedAt })];
  });
}

export type QuotaLang = 'ru' | 'en';
const FAMILY_TEXT = {
  ru: { remaining: (figure: string) => `осталось ${figure}`, none: 'нет данных', partial: 'частично', reset: 'сброс', noReset: 'сброс неизвестен', observed: 'данные', missing: 'Нет показаний', truncated: 'Часть показаний не получена' },
  en: { remaining: (figure: string) => `${figure} remaining`, none: 'no data', partial: 'partial', reset: 'resets', noReset: 'reset unknown', observed: 'observed', missing: 'No reading for', truncated: 'Some readings were not received' },
};
/** Remaining value as words: `осталось 40–85%` / `40–85% remaining`, or an explicit unknown. Never a naked percentage. */
export function quotaFamilyValue(figure: string | null, lang: QuotaLang = 'ru'): string {
  return figure === null ? FAMILY_TEXT[lang].none : FAMILY_TEXT[lang].remaining(figure);
}
/** Family headline: the value plus a textual partial mark. */
export function quotaFamilyHeadline(s: QuotaFamilySummary, lang: QuotaLang = 'ru'): string {
  return `${quotaFamilyValue(s.figure, lang)}${s.partial ? `, ${FAMILY_TEXT[lang].partial}` : ''}`;
}
/** Reset of a row in the user's local timezone, or an explicit unknown; a stale row also names its observation time. */
export function quotaFamilyRowMeta(row: QuotaFamilyRow, lang: QuotaLang = 'ru', locale?: string): string {
  const t = FAMILY_TEXT[lang];
  return `${row.resetsAt === null ? t.noReset : `${t.reset} ${shortDate(row.resetsAt, locale)}`}${row.stale && row.observedAt !== null ? ` · ${t.observed} ${shortDate(row.observedAt, locale)}` : ''}`;
}
/** What is incomplete in a family: models without a reading and readings the backend dropped; null when complete. */
export function quotaFamilyNote(s: QuotaFamilySummary, lang: QuotaLang = 'ru'): string | null {
  const t = FAMILY_TEXT[lang];
  const parts = [s.missing.length && s.state !== 'none' ? `${t.missing}: ${s.missing.join(', ')}` : '', s.truncated ? t.truncated : ''].filter(Boolean);
  return parts.length ? parts.join('. ') : null;
}
/** Plain-text details of a family: one sentence per row with models, remaining value and reset, then the note. */
export function quotaFamilyDetails(s: QuotaFamilySummary, lang: QuotaLang = 'ru', locale?: string): string {
  const note = quotaFamilyNote(s, lang);
  return [...s.rows.map(r => `${r.models.join(', ')}: ${quotaFamilyValue(r.figure, lang)}, ${quotaFamilyRowMeta(r, lang, locale)}`), ...(note ? [note] : [])].join('; ');
}

/** Measured value of an additional limit: percent, else remaining amount, else an explicit unknown. */
export function additionalQuotaValue(w: QuotaAdditionalWindow): string {
  return w.usedPercent != null ? `${Math.round(w.usedPercent)}%` : w.remaining != null ? `осталось ${w.remaining}` : 'нет данных';
}

/** Multiline tooltip: periods with local reset time, additional limits, plan and parked agents. */
export function quotaTooltip(a: QuotaAccount, locale?: string): string {
  const lines = [a.label];
  const families = quotaFamilySummaries(a, locale);
  const extra = (a.additionalWindows ?? []).filter(w => !families.length || !w.family);
  for (const s of families) lines.push(`${s.title}: ${quotaFamilyHeadline(s)}`);
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
