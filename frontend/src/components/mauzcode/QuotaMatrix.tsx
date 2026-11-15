import { useId, useState } from 'react';
import { ChevronRight, Cpu, PlugZap } from 'lucide-react';
import { NavigationChatIcon } from './NavigationChatIcon';
import { NavigationTooltip } from './NavigationTooltip';
import { QUOTA_PERIODS, additionalQuotaValue, quotaAccountCaption, quotaStatusSymbol, quotaTooltip, worstQuotaTone, worstTone, type QuotaAccount, type QuotaAdditionalWindow, type QuotaTone } from '../../lib/quotas';
import './quota-matrix.css';

type Props = { accounts: QuotaAccount[]; compact?: boolean; onOpen?: () => void; defaultExpanded?: boolean; /** Phones only: show a collapsible Usage header (collapsed by default). Desktop keeps the always-visible matrix. */ collapsible?: boolean };

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
  return <div className="quota-card-cell"><NavigationTooltip delay={0} closeDelay={0} hoverablePopup={false} trigger={<button type="button" className="quota-card" data-connection={account.connection} data-kind={account.kind} data-tone={account.tone}
    data-stale={account.quotaStatus === 'stale' || undefined} aria-label={label} onClick={onOpen}>
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

/** Sidebar quota matrix: four 46px micro-cards per row with 5h / week / month cells. */
export function QuotaMatrix({ accounts, compact = false, onOpen, defaultExpanded = false, collapsible = false }: Props) {
  const [expanded, setExpanded] = useState(() => readExpanded(defaultExpanded));
  const descId = useId();
  if (!accounts.length) return null;
  const tone = worstQuotaTone(accounts);
  if (compact) {
    const extras = accounts.filter(a => a.kind === 'quota' && a.additionalWindows?.length);
    const compactLabel = [...accounts.map(a => quotaTooltip(a).replace(/\n/g, '; '))].join('. ');
    return <div className="quota-compact-cell"><NavigationTooltip delay={0} closeDelay={0} hoverablePopup={false} trigger={<button type="button" className="quota-compact" data-tone={tone} aria-label="Лимиты моделей" aria-describedby={descId} onClick={onOpen}><span className="quota-compact-dot" />{extras.length > 0 && <span className="quota-compact-extra" aria-hidden="true">+</span>}<span id={descId} hidden>{compactLabel}</span></button>}>
      <div className="navigation-tooltip-title">Лимиты моделей</div>
      <div className="quota-tooltip-periods">{accounts.map(a => <div key={a.id} className="quota-tooltip-period"><span>{quotaAccountCaption(a)}</span><strong data-tone={a.tone}>{a.kind === 'status' ? quotaStatusSymbol(a.status) : QUOTA_PERIODS.map(p => a.windows?.[p.key]?.usedPercent).map(v => v == null ? '—' : Math.round(v)).join(' · ')}</strong></div>)}</div>
      {extras.map(a => <div key={a.id} className="quota-tooltip-account-extra"><div>{quotaAccountCaption(a)}</div><AdditionalLimits windows={a.additionalWindows!} /></div>)}
    </NavigationTooltip></div>;
  }
  if (!collapsible) return <section className="quota-matrix" aria-label="Лимиты моделей">
    <div className="quota-matrix-legend" aria-hidden="true">5 ч · Нед. · Мес. <span>использовано, %</span></div>
    <div className="quota-matrix-grid">{accounts.map(a => <QuotaCard key={a.id} account={a} onOpen={onOpen} />)}</div>
  </section>;
  const toggle = () => setExpanded(open => { saveExpanded(!open); return !open; });
  return <section className="quota-matrix" aria-label="Лимиты моделей" data-expanded={expanded || undefined}>
    <button type="button" className="quota-matrix-toggle" aria-expanded={expanded} onClick={toggle}>
      <ChevronRight size={12} strokeWidth={1.5} className="quota-matrix-chevron" aria-hidden="true" />
      <span>Usage</span>
      <span className="quota-compact-dot" data-tone={tone} aria-hidden="true" />
    </button>
    {expanded && <>
      <div className="quota-matrix-legend" aria-hidden="true">5 ч · Нед. · Мес. <span>использовано, %</span></div>
      <div className="quota-matrix-grid">{accounts.map(a => <QuotaCard key={a.id} account={a} onOpen={onOpen} />)}</div>
    </>}
  </section>;
}
