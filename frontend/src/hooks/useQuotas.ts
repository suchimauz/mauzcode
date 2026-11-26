import { useEffect, useMemo, useState } from 'react';
import { getProviderIcons, getQuotas, type QuotaAccount } from '../lib/quotas';
import type { NavigationIcon } from '../lib/navigation';
import { useVisiblePoll } from './useVisiblePoll';

/**
 * Polls GET /api/v1/quotas every 60 s while the tab is visible (useVisiblePoll: no background polls, an expired
 * snapshot is re-read on return, a fresh one is reused); errors keep the last good snapshot.
 */
export function useQuotas(intervalMs = 60000) {
  const [accounts, setAccounts] = useState<QuotaAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [icons, setIcons] = useState<Record<string, NavigationIcon | null>>({});
  // Provider marks change only with the catalogue: load once, cards fall back to a generic glyph meanwhile.
  useEffect(() => {
    const controller = new AbortController();
    getProviderIcons(controller.signal).then(data => setIcons(data.icons ?? {}), () => {});
    return () => controller.abort();
  }, []);
  useVisiblePoll(async signal => {
    try { const data = await getQuotas(signal); setAccounts(Array.isArray(data.accounts) ? data.accounts : []); setError(null); return true; }
    catch (e) { if (!signal.aborted) setError(e instanceof Error ? e.message : String(e)); return false; }
  }, intervalMs);
  const withIcons = useMemo(() => accounts && accounts.map(a => a.icon || !icons[a.provider] ? a : { ...a, icon: icons[a.provider] }), [accounts, icons]);
  return { accounts: withIcons, error };
}
