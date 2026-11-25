import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuotaMatrix } from '../components/mauzcode/QuotaMatrix';
import { UsageView } from '../components/settings/ModelsPanel';
import { quotaFamilySummaries, type QuotaAccount } from '../lib/quotas';
// Real GET /api/v1/quotas output for the synthetic inventory; src/models/antigravityAcceptance.test.ts keeps it current.
import account from '../../../src/models/fixtures/antigravity-quota-account.json';

const quota = account as unknown as QuotaAccount;

it('one Antigravity account from the quota API renders two adjacent family cards with remaining values', () => {
  render(<QuotaMatrix accounts={[quota]} />);
  const cards = [...document.querySelectorAll<HTMLElement>('.quota-card')];
  expect(cards.map(c => c.getAttribute('data-family'))).toEqual(['gemini', 'claude']);
  // Gemini: 75% and 0% remaining measured, other members unknown; Claude: two members at 100%, one unknown.
  expect(cards[0]).toHaveAccessibleName('Antigravity · work: Gemini, осталось 0–75%, частично');
  expect(cards[1]).toHaveAccessibleName('Antigravity · work: Claude, осталось 100%, частично');
  for (const card of cards) { expect(card).toHaveTextContent('Antigravity'); expect(card).toHaveTextContent('ост.'); expect(card.querySelector('.quota-card-extra')).toBeNull(); }
  expect(screen.queryByText('использовано, %')).toBeNull();
});

it('settings reads the same observations as the cards', () => {
  const windows = quota.additionalWindows!.map(w => ({ label: w.label, id: w.id, ...(w.model ? { model: w.model } : {}), ...(w.family ? { family: w.family } : {}),
    ...(w.usedPercent != null ? { usedPercent: w.usedPercent } : {}), ...(w.resetsAt != null ? { resetAt: w.resetsAt } : {}), ...(w.observedAt != null ? { observedAt: w.observedAt } : {}) }));
  const { container } = render(<UsageView usage={{ status: 'available', checkedAt: 1, windows }} />);
  for (const s of quotaFamilySummaries(quota)) {
    expect(s.figure).not.toBeNull();
    expect(container).toHaveTextContent(s.title);
    expect(container).toHaveTextContent(s.figure!);
  }
});
