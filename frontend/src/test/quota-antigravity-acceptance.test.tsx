import { expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QuotaMatrix } from '../components/mauzcode/QuotaMatrix';
import { UsageView } from '../components/settings/ModelsPanel';
import type { QuotaAccount } from '../lib/quotas';
// Real GET /api/v1/quotas output for the synthetic summary; src/models/antigravityAcceptance.test.ts keeps it current.
import fixture from '../../../src/models/fixtures/antigravity-quota-account.json';

const accounts = fixture as unknown as QuotaAccount[];
const cellsOf = (card: Element) => [...card.querySelectorAll('[data-period]')].map(e => e.textContent);

it('the two Antigravity pool accounts from the quota API render as adjacent standard cards captioned by family', () => {
  render(<QuotaMatrix accounts={accounts} />);
  const cards = [...document.querySelectorAll<HTMLElement>('.quota-card')];
  expect(cards.map(c => c.getAttribute('data-family'))).toEqual(['gemini', 'claude']);
  expect(cards.every(c => c.classList.length === 1)).toBe(true);
  // Gemini 20% / 60% used, Claude/GPT 10% / 75% used, no monthly reading.
  expect(cards.map(cellsOf)).toEqual([['20', '60', '—'], ['10', '75', '—']]);
  expect(cards.map(c => c.querySelector('.quota-card-account')!.textContent)).toEqual(['Gemini · work', 'Claude · work']);
  expect(cards[1]!.getAttribute('aria-label')).toMatch(/^Antigravity · work · Claude\/GPT; 5 часов: 10%, сброс .+; Неделя: 75%, сброс /);
  for (const card of cards) expect(card.querySelector('.quota-card-extra')).toBeNull();
});

it('settings reads the same observations, in two standard sections', () => {
  // The usage report the quota API was built from: the pool windows with their standard labels.
  const windows = accounts.flatMap(a => (['fiveHour', 'weekly'] as const).flatMap(p => { const w = a.windows?.[p]; return w ? [{ label: p === 'fiveHour' ? 'Session (5h)' : 'Weekly (7d)', family: a.family, scope: 'group' as const, period: p, ...(w.usedPercent != null ? { usedPercent: w.usedPercent } : {}), ...(w.resetsAt != null ? { resetAt: w.resetsAt } : {}) }] : []; }));
  render(<UsageView usage={{ status: 'available', checkedAt: 1, windows }} />);
  for (const [title, a] of [['Gemini', accounts[0]!], ['Claude/GPT', accounts[1]!]] as const) {
    const region = screen.getByRole('region', { name: `${title} quota` });
    expect(within(region).getByRole('heading').textContent).toBe(title);
    expect(within(region).getAllByRole('listitem').map(li => li.textContent)).toEqual([
      expect.stringMatching(new RegExp(`^Session \\(5h\\)${a.windows!.fiveHour!.usedPercent}% used · resets `)),
      expect.stringMatching(new RegExp(`^Weekly \\(7d\\)${a.windows!.weekly!.usedPercent}% used · resets `)),
    ]);
  }
});
