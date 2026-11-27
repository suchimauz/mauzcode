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
  /** `group`: a provider family-pool reading (with `family`, `period` and `bucket`) that is not one of its pool account's period cells. */
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
  /** Model-family pool of a provider connection split into one account per pool (Antigravity Gemini, Claude/GPT); absent for ordinary accounts. */
  family?: QuotaFamily;
  /** Connection id of a pool account; `id` is then `<connectionId>:<family>`. */
  connectionId?: string;
  /** The backend dropped some of this pool's readings. */
  partial?: boolean;
  status?: 'available' | 'unavailable' | 'disabled' | 'unknown';
  quotaStatus?: 'fresh' | 'stale' | 'unavailable';
  /** Epoch ms of the last successful quota fetch; shown instead of "Fresh data" when stale. */
  quotaUpdatedAt?: number | null;
  tone: QuotaTone; planType?: string | null; needsReconnect?: boolean; parkedAgents: number;
  icon?: NavigationIcon | null;
};
export type QuotasResponse = { updatedAt: number; accounts: QuotaAccount[] };
/** What activating a pool card asks to show: that connection's usage, with the family in view. `account` is the connection id. */
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

/** Display order and titles of model-family pools: `title` names the card, `pool` the provider pool its limits belong to. */
export const QUOTA_FAMILIES: { key: QuotaFamily; title: string; pool: string }[] = [{ key: 'gemini', title: 'Gemini', pool: 'Gemini' }, { key: 'claude', title: 'Claude', pool: 'Claude/GPT' }];
const familyMeta = (f: QuotaFamily) => QUOTA_FAMILIES.find(x => x.key === f);

/** Short account caption: drops provider and host noise from backend labels; a pool account is prefixed by its family, e.g. `Gemini · work`. */
export function quotaAccountCaption(a: QuotaAccount): string {
  const name = a.account && a.account !== 'default' ? a.account : a.label.split('·')[0]?.trim() || a.provider;
  return a.family ? `${familyMeta(a.family)?.title ?? a.family} · ${name}` : name;
}

/** Full account name for details: the backend label, with the pool of a pool account, e.g. `Antigravity · work · Claude/GPT`. */
export function quotaAccountTitle(a: QuotaAccount): string {
  return a.family ? `${a.label} · ${familyMeta(a.family)?.pool ?? a.family}` : a.label;
}

/** What activating a card opens: a pool account names its connection and family, other cards nothing. */
export function quotaOpenTarget(a: QuotaAccount): QuotaOpenTarget | undefined {
  return a.family ? { account: a.connectionId ?? a.id, family: a.family } : undefined;
}

export function quotaStatusSymbol(status: QuotaAccount['status']): string {
  return status === 'available' ? '✓' : status === 'unavailable' ? '!' : status === 'disabled' ? '−' : '?';
}

const shortDate = (at: number, locale?: string) => new Date(at).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Measured value of an additional limit: percent, else remaining amount, else an explicit unknown. */
export function additionalQuotaValue(w: QuotaAdditionalWindow): string {
  return w.usedPercent != null ? `${Math.round(w.usedPercent)}%` : w.remaining != null ? `осталось ${w.remaining}` : 'нет данных';
}

/** Multiline tooltip: periods with local reset time, additional limits, plan and parked agents. */
export function quotaTooltip(a: QuotaAccount, locale?: string): string {
  const lines = [quotaAccountTitle(a)];
  const extra = a.additionalWindows ?? [];
  if (a.kind === 'status') lines.push(`Статус: ${a.status ?? 'unknown'}`);
  else for (const p of QUOTA_PERIODS) {
    const w = a.windows?.[p.key];
    if (!w) continue;
    const pct = w.usedPercent == null ? 'нет данных' : `${Math.round(w.usedPercent)}%`;
    const reset = w.resetsAt ? `, сброс ${shortDate(w.resetsAt, locale)}` : '';
    lines.push(`${p.title}: ${pct}${reset}`);
  }
  if (a.kind === 'quota' && !QUOTA_PERIODS.some(p => a.windows?.[p.key]) && !extra.length) lines.push('Квота не измерена');
  if (a.kind === 'quota' && extra.length) {
    lines.push(`Дополнительные лимиты: ${extra.length}`);
    for (const w of extra) lines.push(`${w.label}: ${additionalQuotaValue(w)}${w.resetsAt ? `, сброс ${shortDate(w.resetsAt, locale)}` : ', сброс неизвестен'}`);
  }
  if (a.partial) lines.push('Часть показаний не получена');
  if (a.quotaStatus === 'stale') lines.push('Данные устарели');
  if (a.needsReconnect) lines.push('Нужно переподключить');
  if (a.planType) lines.push(`План: ${a.planType}`);
  if (a.parkedAgents) lines.push(`Ждут агенты: ${a.parkedAgents}`);
  return lines.join('\n');
}
