import { useId, useState } from 'react';
import { ChevronRight, Cpu, PlugZap } from 'lucide-react';
import { NavigationChatIcon } from './NavigationChatIcon';
import { NavigationTooltip } from './NavigationTooltip';
import { QUOTA_FAMILIES, QUOTA_PERIODS, additionalQuotaValue, quotaAccountCaption, quotaFamilyDetails, quotaFamilyHeadline, quotaFamilyNote, quotaFamilyRowMeta, quotaFamilySummaries, quotaProviderName, quotaStatusSymbol, quotaTooltip, worstQuotaTone, worstTone, type QuotaAccount, type QuotaAdditionalWindow, type QuotaFamilySummary, type QuotaOpenTarget, type QuotaTone } from '../../lib/quotas';
import './quota-matrix.css';

type Props = { accounts: QuotaAccount[]; compact?: boolean; /** Opens the quota settings; a family card names its connection and family, other triggers pass nothing. */ onOpen?: (target?: QuotaOpenTarget) => void; defaultExpanded?: boolean; /** Phones only: show a collapsible Usage header (collapsed by default). Desktop keeps the always-visible matrix. */ collapsible?: boolean };

const EXPANDED_KEY = 'mauzcode.quotaMatrix.expanded';
function readExpanded(fallback: boolean) { try { const v = localStorage.getItem(EXPANDED_KEY); return v == null ? fallback : v === '1'; } catch { return fallback; } }
function saveExpanded(value: boolean) { try { localStorage.setItem(EXPANDED_KEY, value ? '1' : '0'); } catch { /* Keep the in-memory choice for this session. */ } }

const STATUS_LABEL: Record<string, string> = { available: 'Available', unavailable: 'Unavailable', disabled: 'Disabled', unknown: 'Unknown' };
const resetLabel = (at: number | null) => at ? new Date(at).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;

/** Additional limits (model-specific, unknown period or conflicting) listed apart from the main periods. Text only, never HTML. */
function AdditionalLimits({ windows }: { windows: QuotaAdditionalWindow[] }) {
  return <div className="quota-tooltip-extra">
    <div className="quota-tooltip-extra-title">Дополнительные лимиты · {windows.length}</div>
    <div className="quota-tooltip-periods">{windows.map(w => <div key={w.id} className="quota-tooltip-period">
      <span>{w.label}</span><strong data-tone={w.usedPercent == null ? 'none' : w.tone}>{additionalQuotaValue(w)}</strong>
      <span className="quota-tooltip-reset">{resetLabel(w.resetsAt) ? `сброс ${resetLabel(w.resetsAt)}` : 'сброс неизвестен'}{w.observedAt ? ` · данные ${resetLabel(w.observedAt)}` : ''}</span>
    </div>)}</div>
  </div>;
}

/** Same dark navigation tooltip as chat rows: title, measured periods, additional limits, plan and a status dot. */
function QuotaTooltipBody({ account }: { account: QuotaAccount }) {
  const status = account.kind === 'status';
  const periods = QUOTA_PERIODS.flatMap(p => { const w = account.windows?.[p.key]; return w ? [{ ...p, w }] : []; });
  const extra = status ? [] : account.additionalWindows ?? [];
  const measured = periods.length > 0 || extra.length > 0;
  const state = status ? STATUS_LABEL[account.status ?? 'unknown']
    : account.needsReconnect ? 'Reconnect required' : account.quotaStatus === 'unavailable' || !measured ? 'Quota not measured' : account.quotaStatus === 'stale' ? (resetLabel(account.quotaUpdatedAt ?? null) ? `Updated ${resetLabel(account.quotaUpdatedAt ?? null)}` : 'Stale data') : 'Fresh data';
  const ok = status ? account.status === 'available' : !account.needsReconnect && account.quotaStatus !== 'unavailable' && measured;
  return <>
    <div className="navigation-tooltip-title">{quotaAccountCaption(account)}</div>
    <div>{account.label}{account.planType ? ` · ${account.planType}` : ''}</div>
    {!status && periods.length > 0 && <div className="quota-tooltip-periods">{periods.map(({ key, title, w }) => <div key={key} className="quota-tooltip-period">
      <span>{title}</span><strong data-tone={w.usedPercent == null ? 'none' : w.tone}>{w.usedPercent == null ? '—' : `${Math.round(w.usedPercent)}%`}</strong>
      {resetLabel(w.resetsAt) && <span className="quota-tooltip-reset">сброс {resetLabel(w.resetsAt)}</span>}
    </div>)}</div>}
    {extra.length > 0 && <AdditionalLimits windows={extra} />}
    {account.parkedAgents > 0 && <div>Ждут агенты: {account.parkedAgents}</div>}
    <div className="navigation-tooltip-status"><span className="navigation-tooltip-dot" data-active={ok} data-tone={ok ? undefined : (account.tone as QuotaTone)} aria-hidden="true" />{state}</div>
  </>;
}

function QuotaCard({ account, onOpen }: { account: QuotaAccount; onOpen?: () => void }) {
  const status = account.kind === 'status';
  const unmeasured = !status && (account.quotaStatus === 'unavailable' || !QUOTA_PERIODS.some(p => account.windows?.[p.key]));
  const extra = status ? 0 : account.additionalWindows?.length ?? 0;
  const label = quotaTooltip(account).replace(/\n/g, '; ');
  return <div className="quota-card-cell"><NavigationTooltip delay={0} side="top" trigger={<button type="button" className="quota-card" data-connection={account.connection} data-kind={account.kind} data-tone={account.tone}
    data-stale={account.quotaStatus === 'stale' || undefined} aria-label={label} onClick={() => onOpen?.()}>
    <span className="quota-card-provider" aria-hidden="true">
      <span className="quota-card-logo">{account.icon ? <NavigationChatIcon icon={account.icon} /> : status ? <PlugZap size={12} strokeWidth={1.5} /> : <Cpu size={12} strokeWidth={1.5} />}</span>
      {account.connection !== 'local' && account.host && <span className="quota-card-host">{account.host.slice(0, 3)}</span>}
      {extra > 0 && <span className="quota-card-extra" data-tone={worstTone(account.additionalWindows!.map(w => w.tone))}>+{extra}</span>}
    </span>
    <span className="quota-card-account" aria-hidden="true">{quotaAccountCaption(account)}</span>
    {status
      ? <span className="quota-card-status" data-status={account.status ?? 'unknown'} aria-hidden="true">{quotaStatusSymbol(account.status)}</span>
      : <span className="quota-card-periods" aria-hidden="true">{QUOTA_PERIODS.map(p => {
        const w = unmeasured ? undefined : account.windows?.[p.key];
        return <span key={p.key} className="quota-card-period" data-period={p.key} data-tone={w?.usedPercent == null ? 'none' : w.tone}>
          {w?.usedPercent == null ? '—' : Math.round(w.usedPercent)}
        </span>;
      })}</span>}
  </button>}><QuotaTooltipBody account={account} /></NavigationTooltip></div>;
}

/** Sidebar dates follow the Russian short format of the other quota rows; the timezone is always the user's own. */
const LOCALE = 'ru';
const GRID_COLUMNS = 4;
/** Limits of a family account that are not family readings (shown apart from the family rows). */
const otherLimits = (account: QuotaAccount) => (account.additionalWindows ?? []).filter(w => !w.family);

/** Details of one family card: parent account, family, remaining per model with local resets, explicit unknowns. Text only, never HTML. */
function FamilyTooltipBody({ account, summary }: { account: QuotaAccount; summary: QuotaFamilySummary }) {
  const note = quotaFamilyNote(summary);
  const none = summary.state === 'none';
  const periods = QUOTA_PERIODS.flatMap(p => { const w = account.windows?.[p.key]; return w ? [{ ...p, w }] : []; });
  const extra = otherLimits(account);
  const updated = resetLabel(account.quotaUpdatedAt ?? null);
  const state = account.needsReconnect ? 'Reconnect required' : account.kind === 'status' && account.status !== 'available' ? STATUS_LABEL[account.status ?? 'unknown']
    : account.quotaStatus === 'unavailable' || none ? 'Quota not measured' : account.quotaStatus === 'stale' ? (updated ? `Updated ${updated}` : 'Stale data') : 'Fresh data';
  const ok = state === 'Fresh data';
  return <>
    <div className="navigation-tooltip-title">{quotaProviderName(account)} · {summary.title}</div>
    <div>{account.label}{account.planType ? ` · ${account.planType}` : ''}</div>
    <div className="quota-tooltip-period quota-tooltip-family-total">
      <span>Осталось{summary.partial ? ' · частично' : ''}</span><strong data-tone={none ? 'none' : summary.tone}>{summary.figure ?? 'нет данных'}</strong>
    </div>
    <div className="quota-tooltip-extra quota-tooltip-family">
      <div className="quota-tooltip-extra-title">Осталось по моделям</div>
      {summary.rows.length > 0 ? <div className="quota-tooltip-periods">{summary.rows.map(r => <div key={r.key} className="quota-tooltip-period">
        <span>{r.models.join(', ')}</span><strong data-tone={r.tone ?? 'none'}>{r.figure ?? 'нет данных'}</strong>
        <span className="quota-tooltip-reset">{quotaFamilyRowMeta(r, 'ru', LOCALE)}</span>
      </div>)}</div> : <div className="quota-tooltip-reset">Показаний по моделям нет</div>}
      {note && <div className="quota-tooltip-note">{note}</div>}
    </div>
    {periods.length > 0 && <div className="quota-tooltip-periods">{periods.map(({ key, title, w }) => <div key={key} className="quota-tooltip-period">
      <span>{title} · использовано</span><strong data-tone={w.usedPercent == null ? 'none' : w.tone}>{w.usedPercent == null ? '—' : `${Math.round(w.usedPercent)}%`}</strong>
      {resetLabel(w.resetsAt) && <span className="quota-tooltip-reset">сброс {resetLabel(w.resetsAt)}</span>}
    </div>)}</div>}
    {extra.length > 0 && <AdditionalLimits windows={extra} />}
    {account.parkedAgents > 0 && <div>Ждут агенты: {account.parkedAgents}</div>}
    <div className="navigation-tooltip-status"><span className="navigation-tooltip-dot" data-active={ok} data-tone={ok ? undefined : (account.tone as QuotaTone)} aria-hidden="true" />{state}</div>
  </>;
}

/** One family of one connection: provider, family and the REMAINING figure, range or an explicit unknown, readable without hover. */
function FamilyCard({ account, summary, onOpen }: { account: QuotaAccount; summary: QuotaFamilySummary; onOpen?: (target?: QuotaOpenTarget) => void }) {
  const descId = useId();
  const provider = quotaProviderName(account);
  const named = account.account && account.account !== 'default' && account.account !== provider ? account.account : null;
  const details = [quotaFamilyDetails(summary, 'ru', LOCALE), account.quotaStatus === 'stale' ? 'Данные устарели' : '', account.needsReconnect ? 'Нужно переподключить' : ''].filter(Boolean).join('; ');
  return <div className="quota-card-cell"><NavigationTooltip delay={0} side="top" trigger={<button type="button" className="quota-card quota-card--family" data-connection={account.connection} data-kind="family"
    data-family={summary.family} data-state={summary.state} data-tone={summary.tone} data-stale={account.quotaStatus === 'stale' || undefined}
    aria-label={`${account.label}: ${summary.title}, ${quotaFamilyHeadline(summary)}`} aria-describedby={details ? descId : undefined} onClick={() => onOpen?.({ account: account.id, family: summary.family })}>
    <span className="quota-card-provider" aria-hidden="true">
      {account.icon && <span className="quota-card-logo"><NavigationChatIcon icon={account.icon} /></span>}
      <span className="quota-card-provider-name">{provider}</span>
    </span>
    <span className="quota-card-account quota-card-family" aria-hidden="true"><span className="quota-card-family-name">{summary.title}</span>{named && <span className="quota-card-family-note">· {named}</span>}</span>
    <span className="quota-card-remaining" data-tone={summary.figure === null ? 'none' : summary.tone} data-long={(summary.figure?.length ?? 0) > 8 ? 'xl' : (summary.figure?.length ?? 0) > 5 ? 'l' : undefined} aria-hidden="true">
      {summary.figure === null ? 'нет данных' : <><span className="quota-card-remaining-figure">{summary.figure}</span><span className="quota-card-remaining-unit">ост.{summary.partial && <span className="quota-card-remaining-partial">*</span>}</span></>}
    </span>
    {details && <span id={descId} hidden>{details}</span>}
  </button>}><FamilyTooltipBody account={account} summary={summary} /></NavigationTooltip></div>;
}

type Slot = { key: string; account: QuotaAccount; summary?: QuotaFamilySummary } | { key: string; account?: undefined; summary?: undefined };
/** Grid slots in account order. The family cards of one account stay on one row: an inert spacer fills the row when they would wrap. */
function quotaSlots(accounts: QuotaAccount[]): Slot[] {
  const slots: Slot[] = [];
  for (const account of accounts) {
    const families = quotaFamilySummaries(account, LOCALE);
    const free = GRID_COLUMNS - slots.length % GRID_COLUMNS;
    if (families.length > free && families.length <= GRID_COLUMNS) for (let i = 0; i < free; i++) slots.push({ key: `${account.id}:spacer:${i}` });
    if (families.length) for (const summary of families) slots.push({ key: `${account.id}:${summary.family}`, account, summary });
    else slots.push({ key: account.id, account });
  }
  return slots;
}

/** Legend and cards. The used-percent legend belongs to period cards only; family cards state their own unit. */
function QuotaGrid({ accounts, onOpen }: { accounts: QuotaAccount[]; onOpen?: (target?: QuotaOpenTarget) => void }) {
  const slots = quotaSlots(accounts);
  const periods = slots.some(s => s.account && !s.summary && s.account.kind === 'quota');
  // Only families that actually have a card are named, in display order.
  const families = QUOTA_FAMILIES.filter(f => slots.some(s => s.summary?.family === f.key)).map(f => f.title);
  // A partial family keeps its account on the card; the mark is a character explained here, never only a colour.
  const partial = slots.some(s => s.summary?.partial);
  return <>
    {periods && <div className="quota-matrix-legend" data-legend="used" aria-hidden="true">5 ч · Нед. · Мес. <span>использовано, %</span></div>}
    {families.length > 0 && <div className="quota-matrix-legend" data-legend="remaining" aria-hidden="true">{families.join(' · ')} <span>ост. — осталось, %{partial ? ' · * частично' : ''}</span></div>}
    <div className="quota-matrix-grid">{slots.map(s => !s.account ? <span key={s.key} className="quota-card-spacer" aria-hidden="true" />
      : s.summary ? <FamilyCard key={s.key} account={s.account} summary={s.summary} onOpen={onOpen} />
        : <QuotaCard key={s.key} account={s.account} onOpen={onOpen} />)}</div>
  </>;
}

/** One compact-rail row per account, or per shown family with its remaining value. */
function CompactRows({ account }: { account: QuotaAccount }) {
  const families = quotaFamilySummaries(account, LOCALE);
  if (families.length) return <>{families.map(s => <div key={s.family} className="quota-tooltip-period" data-family={s.family}>
    <span>{account.label} · {s.title}</span><strong data-tone={s.figure === null ? 'none' : s.tone}>{quotaFamilyHeadline(s)}</strong>
  </div>)}</>;
  return <div className="quota-tooltip-period"><span>{quotaAccountCaption(account)}</span><strong data-tone={account.tone}>{account.kind === 'status' ? quotaStatusSymbol(account.status) : QUOTA_PERIODS.map(p => account.windows?.[p.key]?.usedPercent).map(v => v == null ? '—' : Math.round(v)).join(' · ')}</strong></div>;
}

/** Sidebar quota matrix: four 46px micro-cards per row with 5h / week / month cells, or one remaining card per model family. */
export function QuotaMatrix({ accounts, compact = false, onOpen, defaultExpanded = false, collapsible = false }: Props) {
  const [expanded, setExpanded] = useState(() => readExpanded(defaultExpanded));
  const descId = useId();
  if (!accounts.length) return null;
  const tone = worstQuotaTone(accounts);
  if (compact) {
    // Family readings are named row by row, so only limits outside the families count as extras.
    const extras = accounts.flatMap(a => { const windows = a.kind !== 'quota' ? [] : a.families?.length ? otherLimits(a) : a.additionalWindows ?? []; return windows.length ? [{ account: a, windows }] : []; });
    const compactLabel = [...accounts.map(a => quotaTooltip(a).replace(/\n/g, '; '))].join('. ');
    return <div className="quota-compact-cell"><NavigationTooltip delay={0} trigger={<button type="button" className="quota-compact" data-tone={tone} aria-label="Лимиты моделей" aria-describedby={descId} onClick={() => onOpen?.()}><span className="quota-compact-dot" />{extras.length > 0 && <span className="quota-compact-extra" aria-hidden="true">+</span>}<span id={descId} hidden>{compactLabel}</span></button>}>
      <div className="navigation-tooltip-title">Лимиты моделей</div>
      <div className="quota-tooltip-periods">{accounts.map(a => <CompactRows key={a.id} account={a} />)}</div>
      {extras.map(({ account: a, windows }) => <div key={a.id} className="quota-tooltip-account-extra"><div>{quotaAccountCaption(a)}</div><AdditionalLimits windows={windows} /></div>)}
    </NavigationTooltip></div>;
  }
  if (!collapsible) return <section className="quota-matrix" aria-label="Лимиты моделей">
    <QuotaGrid accounts={accounts} onOpen={onOpen} />
  </section>;
  const toggle = () => setExpanded(open => { saveExpanded(!open); return !open; });
  return <section className="quota-matrix" aria-label="Лимиты моделей" data-expanded={expanded || undefined}>
    <button type="button" className="quota-matrix-toggle" aria-expanded={expanded} onClick={toggle}>
      <ChevronRight size={12} strokeWidth={1.5} className="quota-matrix-chevron" aria-hidden="true" />
      <span>Usage</span>
      <span className="quota-compact-dot" data-tone={tone} aria-hidden="true" />
    </button>
    {expanded && <QuotaGrid accounts={accounts} onOpen={onOpen} />}
  </section>;
}
