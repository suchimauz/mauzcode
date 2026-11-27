import { afterEach, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useQuotas } from '../hooks/useQuotas';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const body = { updatedAt: 1, accounts: [{ id: 'codex:a', provider: 'codex', account: 'a', label: 'a', model: 'codex/a:', connection: 'local', kind: 'quota', windows: {}, tone: 'neutral', parkedAgents: 0 }] };

it('reads /api/v1/quotas immediately and polls every 60 s', async () => {
  vi.useFakeTimers();
  const icon = { src: 'data:image/svg+xml,%3Csvg%2F%3E', custom: false };
  const all = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('provider-icons') ? { icons: { codex: icon } } : body), { headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', all);
  const fetchMock = { get mock() { return { calls: all.mock.calls.filter(c => String(c[0]) === '/api/v1/quotas') }; } };
  const { result, unmount } = renderHook(() => useQuotas());
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(fetchMock.mock.calls).toHaveLength(1);
  expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe('/api/v1/quotas');
  expect(result.current.accounts?.map(a => a.id)).toEqual(['codex:a']);
  expect(result.current.accounts?.[0].icon).toEqual(icon);
  expect(all.mock.calls.filter(c => String(c[0]) === '/ui-lab-api/provider-icons')).toHaveLength(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(59000); });
  expect(fetchMock.mock.calls).toHaveLength(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(fetchMock.mock.calls).toHaveLength(2);
  unmount();
  await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
  expect(fetchMock.mock.calls).toHaveLength(2);
});

it('keeps the last snapshot when a later read fails', async () => {
  vi.useFakeTimers();
  let n = 0;
  const all = vi.fn(async (url: string) => url.includes('provider-icons')
    ? new Response(JSON.stringify({ icons: {} }), { headers: { 'Content-Type': 'application/json' } })
    : n++ === 0 ? new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
      : new Response(JSON.stringify({ error: 'down' }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', all);
  const fetchMock = { get mock() { return { calls: all.mock.calls.filter(c => String(c[0]) === '/api/v1/quotas') }; } };
  const { result } = renderHook(() => useQuotas());
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(fetchMock.mock.calls).toHaveLength(2);
  expect(result.current.accounts).toHaveLength(1);
  expect(result.current.error).toBe('down');
});

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const hidden = (value: boolean) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => value }); document.dispatchEvent(new Event('visibilitychange')); };
const account = (used: number | null, updatedAt: number, status: 'fresh' | 'stale' = 'fresh') => ({ ...body.accounts[0], id: 'ag:work:gemini', connectionId: 'ag:work', family: 'gemini', provider: 'antigravity', quotaStatus: status, quotaUpdatedAt: updatedAt,
  windows: { fiveHour: { usedPercent: used, resetsAt: null, tone: 'neutral' } }, additionalWindows: [] });

it('pauses while hidden, re-reads an expired snapshot on return and reuses a fresh one', async () => {
  vi.useFakeTimers();
  try {
    const reads: number[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('provider-icons') ? json({ icons: {} }) : (reads.push(Date.now()), json(body))));
    renderHook(() => useQuotas());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(reads).toHaveLength(1);
    // Hidden after 20 s: nothing is polled in the background, however long it stays hidden.
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    hidden(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });
    expect(reads).toHaveLength(1);
    // Back after expiry: one immediate read.
    hidden(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(reads).toHaveLength(2);
    // Hidden and back within the interval: the fresh snapshot is reused; the next read comes when it is due.
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    hidden(true); hidden(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(reads).toHaveLength(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(50_000); });
    expect(reads).toHaveLength(3);
    expect(reads[2]! - reads[1]!).toBe(60_000);
  } finally { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); }
});

it('shows a changed value on the next poll, keeps a stale snapshot with its success time and recovers', async () => {
  vi.useFakeTimers();
  let n = 0;
  const replies = [json({ updatedAt: 1, accounts: [account(20, 1_000)] }), json({ updatedAt: 2, accounts: [account(70, 61_000)] }), json({ error: 'down' }, 500),
    json({ updatedAt: 3, accounts: [account(70, 61_000, 'stale')] }), json({ updatedAt: 4, accounts: [account(null, 181_000)] })];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('provider-icons') ? json({ icons: {} }) : replies[Math.min(n++, replies.length - 1)]!));
  const { result } = renderHook(() => useQuotas());
  const shown = () => [result.current.accounts?.[0]?.windows?.fiveHour?.usedPercent, result.current.accounts?.[0]?.quotaStatus, result.current.accounts?.[0]?.quotaUpdatedAt];
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(shown()).toEqual([20, 'fresh', 1_000]);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(shown()).toEqual([70, 'fresh', 61_000]);
  // A failed request keeps the last good snapshot and its success time.
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(shown()).toEqual([70, 'fresh', 61_000]);
  expect(result.current.error).toBe('down');
  // The server reports its own failed read as stale, with the original success time.
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(shown()).toEqual([70, 'stale', 61_000]);
  expect(result.current.error).toBeNull();
  // Recovery clears stale, advances the time and replaces a now-missing value instead of showing the old one.
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(shown()).toEqual([null, 'fresh', 181_000]);
});
