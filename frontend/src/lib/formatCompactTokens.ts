/**
 * Compact token count for the composer metrics row: under 1000 as is, under 10k with one decimal (`9.4k`),
 * otherwise whole `k` (`184k`) or `M` (`1.2M` under 10M, then whole). `null`/`undefined` render as `—`.
 * Exact values belong in the accessible name and the context details panel.
 */
export function formatCompactTokens(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const value = Math.max(0, Math.round(n));
  const scaled = (amount: number, unit: string) => {
    if (amount < 10) { const one = Math.round(amount * 10) / 10; return one >= 10 ? `${Math.round(amount)}${unit}` : `${one}${unit}`; }
    return `${Math.round(amount)}${unit}`;
  };
  if (value < 1000) return String(value);
  if (value < 999_500) return scaled(value / 1000, 'k');
  return scaled(value / 1_000_000, 'M');
}
