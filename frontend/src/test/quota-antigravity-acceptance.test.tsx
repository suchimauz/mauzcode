import { expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QuotaMatrix } from '../components/mauzcode/QuotaMatrix';
import { UsageView } from '../components/settings/ModelsPanel';
import { quotaFamilySummaries, type QuotaAccount } from '../lib/quotas';
// Real GET /api/v1/quotas output for the synthetic summary; src/models/antigravityAcceptance.test.ts keeps it current.
import account from '../../../src/models/fixtures/antigravity-quota-account.json';

const quota = account as unknown as QuotaAccount;
const cellsOf = (card: Element) => [...card.querySelectorAll('[data-period]')].map(e => e.textContent);

it('one Antigravity account from the quota API renders two adjacent family cards with used-percent period cells', () => {
  render(<QuotaMatrix accounts={[quota]} />);
  const cards = [...document.querySelectorAll<HTMLElement>('.quota-card')];
  expect(cards.map(c => c.getAttribute('data-family'))).toEqual(['gemini', 'claude']);
  // Gemini 20% / 60% used, Claude/GPT 10% / 75% used, no monthly reading.
  expect(cards.map(cellsOf)).toEqual([['20', '60', '—'], ['10', '75', '—']]);
  expect(cards[0]).toHaveAccessibleName('Antigravity · work: Gemini, 5 часов 20%, Неделя 60%, Месяц —');
  expect(cards[1]).toHaveAccessibleName('Antigravity · work: Claude, 5 часов 10%, Неделя 75%, Месяц —');
  expect(cards[1]).toHaveAccessibleDescription(/^Claude\/GPT лимиты; 5 часов: 10% использовано, сброс .+; Неделя: 75% использовано, сброс .+$/);
  for (const card of cards) { expect(card).not.toHaveTextContent('Antigravity'); expect(card.querySelector('.quota-card-extra')).toBeNull(); }
  expect(screen.getByText('использовано, %')).toBeInTheDocument();
});

it('settings reads the same observations as the cards', () => {
  const windows = quota.additionalWindows!.map(w => ({ label: w.label, id: w.id, scope: w.scope, ...(w.bucket ? { bucket: w.bucket } : {}), ...(w.period ? { period: w.period } : {}), ...(w.family ? { family: w.family } : {}),
    ...(w.usedPercent != null ? { usedPercent: w.usedPercent } : {}), ...(w.resetsAt != null ? { resetAt: w.resetsAt } : {}), ...(w.observedAt != null ? { observedAt: w.observedAt } : {}) }));
  render(<UsageView usage={{ status: 'available', checkedAt: 1, windows }} />);
  for (const s of quotaFamilySummaries(quota)) {
    const region = screen.getByRole('region', { name: `${s.title} quota` });
    expect(region).toHaveTextContent(`${s.pool} limits`);
    const rows = within(region).getAllByRole('listitem').map(li => li.textContent);
    expect(rows).toEqual([
      expect.stringMatching(new RegExp(`^5 hours${s.windows.fiveHour!.usedPercent}% used · resets `)),
      expect.stringMatching(new RegExp(`^Weekly${s.windows.weekly!.usedPercent}% used · resets `)),
      'Monthlyno data · reset unknown',
    ]);
  }
});
