import { useId, useState } from 'react';
import { ChevronRight, Cpu, PlugZap } from 'lucide-react';
import { NavigationChatIcon } from './NavigationChatIcon';
import { NavigationTooltip } from './NavigationTooltip';
import { QUOTA_PERIODS, additionalQuotaValue, quotaAccountCaption, quotaAccountTitle, quotaOpenTarget, quotaStatusSymbol, quotaTooltip, worstQuotaTone, worstTone, type QuotaAccount, type QuotaAdditionalWindow, type QuotaOpenTarget, type QuotaTone } from '../../lib/quotas';
import './quota-matrix.css';

type Props = { accounts: QuotaAccount[]; compact?: boolean; /** Opens the quota settings; a pool card names its connection and family, other triggers pass nothing. */ onOpen?: (target?: QuotaOpenTarget) => void; defaultExpanded?: boolean; /** Phones only: show a collapsible Usage header (collapsed by default). Desktop keeps the always-visible matrix. */ collapsible?: boolean };

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
    <div>{quotaAccountTitle(account)}{account.planType ? ` · ${account.planType}` : ''}</div>
    {!status && periods.length > 0 && <div className="quota-tooltip-periods">{periods.map(({ key, title, w }) => <div key={key} className="quota-tooltip-period">
      <span>{title}</span><strong data-tone={w.usedPercent == null ? 'none' : w.tone}>{w.usedPercent == null ? '—' : `${Math.round(w.usedPercent)}%`}</strong>
      {resetLabel(w.resetsAt) && <span className="quota-tooltip-reset">сброс {resetLabel(w.resetsAt)}</span>}
    </div>)}</div>}
    {extra.length > 0 && <AdditionalLimits windows={extra} />}
    {account.partial && <div className="quota-tooltip-note">Часть показаний не получена</div>}
    {account.parkedAgents > 0 && <div>Ждут агенты: {account.parkedAgents}</div>}
    <div className="navigation-tooltip-status"><span className="navigation-tooltip-dot" data-active={ok} data-tone={ok ? undefined : (account.tone as QuotaTone)} aria-hidden="true" />{state}</div>
  </>;
}

/** Card caption: the account, or for a pool account its family followed by the account; the family never truncates, the account gives way first. */
function AccountCaption({ account }: { account: QuotaAccount }) {
  const caption = quotaAccountCaption(account);
  const split = account.family ? caption.indexOf(' · ') : -1;
  if (split < 0) return <span className="quota-card-account" aria-hidden="true">{caption}</span>;
  return <span className="quota-card-account quota-card-family" aria-hidden="true" title={caption}><span className="quota-card-family-name">{caption.slice(0, split)}</span><span className="quota-card-family-note"> · {caption.slice(split + 3)}</span></span>;
}

function QuotaCard({ account, onOpen }: { account: QuotaAccount; onOpen?: (target?: QuotaOpenTarget) => void }) {
  const status = account.kind === 'status';
  const unmeasured = !status && (account.quotaStatus === 'unavailable' || !QUOTA_PERIODS.some(p => account.windows?.[p.key]));
  const extra = status ? 0 : account.additionalWindows?.length ?? 0;
  const label = quotaTooltip(account).replace(/\n/g, '; ');
  return <div className="quota-card-cell"><NavigationTooltip delay={0} side="top" trigger={<button type="button" className="quota-card" data-connection={account.connection} data-kind={account.kind} data-tone={account.tone}
    data-stale={account.quotaStatus === 'stale' || undefined} data-family={account.family} aria-label={label} onClick={() => onOpen?.(quotaOpenTarget(account))}>
    <span className="quota-card-provider" aria-hidden="true">
      <span className="quota-card-logo">{account.icon ? <NavigationChatIcon icon={account.icon} /> : status ? <PlugZap size={12} strokeWidth={1.5} /> : <Cpu size={12} strokeWidth={1.5} />}</span>
      {account.connection !== 'local' && account.host && <span className="quota-card-host">{account.host.slice(0, 3)}</span>}
      {extra > 0 && <span className="quota-card-extra" data-tone={worstTone(account.additionalWindows!.map(w => w.tone))}>+{extra}</span>}
    </span>
    <AccountCaption account={account} />
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

const GRID_COLUMNS = 4;

type Slot = { key: string; account?: QuotaAccount };
/** Grid slots in account order. The pool cards of one connection stay on one row: an inert spacer fills the row when they would wrap. */
function quotaSlots(accounts: QuotaAccount[]): Slot[] {
  const slots: Slot[] = [];
  accounts.forEach((account, i) => {
    const group = account.connectionId;
    if (group && accounts[i - 1]?.connectionId !== group) {
      let size = 1;
      while (accounts[i + size]?.connectionId === group) size++;
      const free = GRID_COLUMNS - slots.length % GRID_COLUMNS;
      if (size > free && size <= GRID_COLUMNS) for (let n = 0; n < free; n++) slots.push({ key: `${account.id}:spacer:${n}` });
    }
    slots.push({ key: account.id, account });
  });
  return slots;
}

/** Legend and cards: every account, including a model-family pool, uses the same used-percent period cells. */
function QuotaGrid({ accounts, onOpen }: { accounts: QuotaAccount[]; onOpen?: (target?: QuotaOpenTarget) => void }) {
  const slots = quotaSlots(accounts);
  const periods = slots.some(s => s.account?.kind === 'quota');
  return <>
    {periods && <div className="quota-matrix-legend" data-legend="used" aria-hidden="true">5 ч · Нед. · Мес. <span>использовано, %</span></div>}
    <div className="quota-matrix-grid">{slots.map(s => !s.account ? <span key={s.key} className="quota-card-spacer" aria-hidden="true" />
      : <QuotaCard key={s.key} account={s.account} onOpen={onOpen} />)}</div>
  </>;
}

const cellsText = (windows: QuotaAccount['windows']) => QUOTA_PERIODS.map(p => windows?.[p.key]?.usedPercent).map(v => v == null ? '—' : Math.round(v)).join(' · ');
/** One compact-rail row per account; a pool account is captioned with its family. */
function CompactRows({ account }: { account: QuotaAccount }) {
  return <div className="quota-tooltip-period" data-family={account.family}><span>{quotaAccountCaption(account)}</span><strong data-tone={account.tone}>{account.kind === 'status' ? quotaStatusSymbol(account.status) : cellsText(account.windows)}</strong></div>;
}

/** Sidebar quota matrix: four 46px micro-cards per row with 5h / week / month used-percent cells, one card per account (a provider's model-family pools are separate accounts). */
export function QuotaMatrix({ accounts, compact = false, onOpen, defaultExpanded = false, collapsible = false }: Props) {
  const [expanded, setExpanded] = useState(() => readExpanded(defaultExpanded));
  const descId = useId();
  if (!accounts.length) return null;
  const tone = worstQuotaTone(accounts);
  if (compact) {
    const extras = accounts.flatMap(a => { const windows = a.kind !== 'quota' ? [] : a.additionalWindows ?? []; return windows.length ? [{ account: a, windows }] : []; });
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
