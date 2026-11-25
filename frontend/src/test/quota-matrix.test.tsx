import { afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuotaMatrix } from '../components/mauzcode/QuotaMatrix';
import { WorkspaceSidebar } from '../components/mauzcode/WorkspaceSidebar';
import { quotaTooltip, worstQuotaTone, type QuotaAccount } from '../lib/quotas';

const codex: QuotaAccount = { id: 'codex:su@srv', provider: 'codex', account: 'su', label: 'codex · ssh.srv.su', model: 'codex/su:', connection: 'ssh', host: 'srv', kind: 'quota', windows: { weekly: { usedPercent: 93.4, resetsAt: 1794383304000, tone: 'error' } }, quotaStatus: 'fresh', tone: 'error', planType: 'pro', parkedAgents: 2 };
const kimi: QuotaAccount = { id: 'kimi-coding:t', provider: 'kimi-coding', account: 't', label: 'kimi', model: 'kimi-coding/t:', connection: 'local', kind: 'quota', windows: { fiveHour: { usedPercent: 0, resetsAt: null, tone: 'neutral' }, monthly: { usedPercent: 60, resetsAt: null, tone: 'warning' } }, tone: 'warning', parkedAgents: 0 };
const gate: QuotaAccount = { id: 'oneapi:default', provider: 'oneapi', account: 'default', label: 'Asoft LLM Gate', model: 'oneapi/default:', connection: 'local', kind: 'status', status: 'available', tone: 'neutral', parkedAgents: 0 };
const unmeasured: QuotaAccount = { id: 'claude-code:x@srv', provider: 'claude-code', account: 'x', label: 'claude', model: 'claude-code/x:', connection: 'ssh', host: 'srv', kind: 'quota', windows: {}, quotaStatus: 'unavailable', tone: 'neutral', parkedAgents: 0 };
afterEach(() => { localStorage.clear(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

const cells = (id: string) => [...document.querySelectorAll('.quota-card')].find(c => c.getAttribute('aria-label')?.startsWith(id))!;

it('maps partial windows into fixed 5h / week / month cells with backend tone', () => {
  render(<QuotaMatrix accounts={[codex, kimi]}  />);
  expect(screen.getByText('использовано, %')).toBeInTheDocument();
  const c = [...cells('codex').querySelectorAll('[data-period]')].map(e => [e.getAttribute('data-period'), e.textContent, e.getAttribute('data-tone')]);
  expect(c).toEqual([['fiveHour', '—', 'none'], ['weekly', '93', 'error'], ['monthly', '—', 'none']]);
  const k = [...cells('kimi').querySelectorAll('[data-period]')].map(e => [e.textContent, e.getAttribute('data-tone')]);
  expect(k).toEqual([['0', 'neutral'], ['—', 'none'], ['60', 'warning']]);
  expect(cells('codex')).toHaveAttribute('data-connection', 'ssh');
  expect(cells('codex').textContent).toContain('srv');
});

it('renders status-only providers as a health indicator and unmeasured quota as dashes', () => {
  render(<QuotaMatrix accounts={[gate, unmeasured]}  />);
  const g = document.querySelector('[data-kind="status"]')!;
  expect(g.querySelector('[data-status="available"]')?.textContent).toBe('✓');
  expect(g.querySelector('[data-period]')).toBeNull();
  const u = document.querySelector('[data-kind="quota"]')!;
  expect([...u.querySelectorAll('[data-period]')].map(e => e.textContent)).toEqual(['—', '—', '—']);
});

it('tooltip lists only reported periods, plan and parked agents; worst tone is backend tone', () => {
  const tip = quotaTooltip(codex, 'ru-RU');
  expect(tip).toContain('Неделя: 93%'); expect(tip).not.toContain('5 часов'); expect(tip).toContain('План: pro'); expect(tip).toContain('Ждут агенты: 2');
  expect(quotaTooltip(unmeasured)).toContain('Квота не измерена');
  expect(worstQuotaTone([kimi, gate])).toBe('warning'); expect(worstQuotaTone([kimi, codex])).toBe('error');
});

it('compact mode shows one worst-tone dot and opens quotas on click', async () => {
  const onOpen = vi.fn();
  render(<QuotaMatrix accounts={[kimi, codex]} compact onOpen={onOpen} />);
  const btn = screen.getByRole('button', { name: 'Лимиты моделей' });
  expect(btn).toHaveAttribute('data-tone', 'error');
  expect(document.querySelector('.quota-card')).toBeNull();
  await userEvent.click(btn); expect(onOpen).toHaveBeenCalled();
});

it('sidebar places quotas above the owner resource row and the account bar and hides them when empty', async () => {
  // The owner's server resource row (ResourceMonitor) sits between the quota block and the account bar.
  const metrics = { sampledAt: 1, platform: 'linux', cpu: 10, cores: [10], memory: { total: 8, used: 4, available: 4 }, swap: null, load: [0] };
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(metrics), { headers: { 'content-type': 'application/json' } })));
  const base = { projects: [], user: { name: 'Test User', role: 'owner' as const }, selected: '', theme: 'light' as const, onTheme: vi.fn(), onToggle: vi.fn(), onSelect: vi.fn(), onRetry: vi.fn() };
  const { rerender } = render(<WorkspaceSidebar {...base} quotas={[kimi]} />);
  const matrix = screen.getByRole('region', { name: 'Лимиты моделей' });
  expect(matrix.nextElementSibling).toHaveClass('resource-monitor-row');
  expect(matrix.nextElementSibling?.nextElementSibling).toHaveClass('workspace-account');
  await screen.findByRole('button', { name: /Ресурсы сервера\. CPU 10%, RAM 50%/ });
  rerender(<WorkspaceSidebar {...base} quotas={[]} />);
  expect(screen.queryByRole('region', { name: 'Лимиты моделей' })).toBeNull();
});

it('uses the shared navigation tooltip with periods, resets and status', async () => {
  render(<QuotaMatrix accounts={[codex]}  />);
  await userEvent.hover(screen.getByRole('button', { name: /^codex/ }));
  const tip = await screen.findByRole('tooltip');
  expect(tip).toHaveClass('navigation-tooltip');
  expect(tip.querySelector('.navigation-tooltip-title')?.textContent).toBe('su');
  expect(tip.textContent).toContain('Неделя'); expect(tip.textContent).toContain('93%'); expect(tip.textContent).toContain('сброс');
  expect(tip.textContent).not.toContain('5 часов');
  expect(tip.querySelector('.navigation-tooltip-status')?.textContent).toBe('Fresh data');
});

it('on phones Usage is collapsed by default, expands on click and remembers the choice', async () => {
  const { unmount } = render(<QuotaMatrix accounts={[kimi, codex]} collapsible />);
  const toggle = screen.getByRole('button', { name: 'Usage' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(document.querySelector('.quota-card')).toBeNull();
  expect(toggle.querySelector('.quota-compact-dot')).toHaveAttribute('data-tone', 'error');
  await userEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(document.querySelectorAll('.quota-card')).toHaveLength(2);
  unmount();
  render(<QuotaMatrix accounts={[kimi]} collapsible />);
  expect(screen.getByRole('button', { name: 'Usage' })).toHaveAttribute('aria-expanded', 'true');
});

it('desktop always shows the full matrix without a Usage toggle', () => {
  render(<QuotaMatrix accounts={[kimi, codex]} />);
  expect(screen.queryByRole('button', { name: 'Usage' })).toBeNull();
  expect(document.querySelectorAll('.quota-card')).toHaveLength(2);
});

const extra = (over: Partial<NonNullable<QuotaAccount['additionalWindows']>[number]> = {}) => ({ id: 'claude:seven_day_opus', label: 'Opus weekly', scope: 'model' as const, period: null, model: 'opus', usedPercent: 81, remaining: null, resetsAt: 1794383304000, observedAt: 1794000000000, tone: 'error' as const, ...over });
const claude: QuotaAccount = { id: 'claude:me', provider: 'claude', account: 'me', label: 'Claude · me', model: 'claude/me', connection: 'mauzcode', kind: 'quota', windows: { fiveHour: { usedPercent: 10, resetsAt: null, tone: 'neutral' }, weekly: { usedPercent: 20, resetsAt: null, tone: 'neutral' } },
  additionalWindows: [extra(), extra({ id: 'claude:x', label: '<b>Long model specific limit name that wraps</b>', scope: 'unknown', model: null, usedPercent: null, remaining: 5, resetsAt: null, observedAt: null, tone: 'neutral' })], quotaStatus: 'fresh', tone: 'error', parkedAgents: 0 };
const onlyExtra: QuotaAccount = { ...claude, id: 'claude:extra', account: 'extra', windows: {}, additionalWindows: [extra()] };

it('no extras: no indicator and no additional section', async () => {
  render(<QuotaMatrix accounts={[kimi]} />);
  expect(document.querySelector('.quota-card-extra')).toBeNull();
  await userEvent.hover(screen.getByRole('button', { name: /^kimi/ }));
  expect((await screen.findByRole('tooltip')).querySelector('.quota-tooltip-extra')).toBeNull();
  expect(quotaTooltip(kimi)).not.toContain('Дополнительные');
});

it('mixed limits keep three main columns and list extras with unknowns as text', async () => {
  render(<QuotaMatrix accounts={[claude]} />);
  const card = cells('Claude');
  expect([...card.querySelectorAll('[data-period]')].map(e => e.textContent)).toEqual(['10', '20', '—']);
  expect(card.querySelector('.quota-card-extra')).toHaveTextContent('+2');
  expect(card.querySelector('.quota-card-extra')).toHaveAttribute('data-tone', 'error');
  expect(card.getAttribute('aria-label')).toContain('Дополнительные лимиты: 2');
  expect(card.getAttribute('aria-label')).toContain('Opus weekly: 81%');
  await userEvent.hover(card);
  const tip = await screen.findByRole('tooltip');
  const section = tip.querySelector('.quota-tooltip-extra')!;
  expect(section.textContent).toContain('Дополнительные лимиты · 2');
  expect(section.textContent).toContain('Opus weekly'); expect(section.textContent).toContain('81%');
  expect(section.textContent).toContain('осталось 5'); expect(section.textContent).toContain('сброс неизвестен');
  expect(section.querySelector('b')).toBeNull();
  expect(section.textContent).toContain('<b>Long model specific limit name that wraps</b>');
  expect(section.textContent).toContain('данные ');
  await userEvent.keyboard('{Escape}');
  await vi.waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
});

it('additional-only account is measured, not "Quota not measured"', async () => {
  expect(quotaTooltip(onlyExtra)).not.toContain('Квота не измерена');
  render(<QuotaMatrix accounts={[onlyExtra]} />);
  const card = cells('Claude');
  expect([...card.querySelectorAll('[data-period]')].map(e => e.textContent)).toEqual(['—', '—', '—']);
  (card as HTMLElement).focus();
  const tip = await screen.findByRole('tooltip');
  expect(tip.querySelector('.navigation-tooltip-status')?.textContent).toBe('Fresh data');
  expect(tip.textContent).toContain('Opus weekly');
});

it('compact mode marks extras and describes them for assistive technology', async () => {
  const onOpen = vi.fn();
  render(<QuotaMatrix accounts={[kimi, claude]} compact onOpen={onOpen} />);
  const btn = screen.getByRole('button', { name: 'Лимиты моделей' });
  expect(btn.querySelector('.quota-compact-extra')).not.toBeNull();
  expect(btn).toHaveAccessibleDescription(/Opus weekly: 81%/);
  await userEvent.hover(btn);
  expect((await screen.findByRole('tooltip')).textContent).toContain('Дополнительные лимиты · 2');
  await userEvent.click(btn); expect(onOpen).toHaveBeenCalled();
});

// Antigravity: one account, one REMAINING card per shown model family. `usedPercent` is the used share.
const RESET_A = Date.UTC(2026, 0, 15, 9, 0), RESET_B = Date.UTC(2026, 0, 16, 18, 30);
type Extra = NonNullable<QuotaAccount['additionalWindows']>[number];
const fam = (family: 'gemini' | 'claude', label: string, usedPercent: number | null, over: Partial<Extra> = {}): Extra =>
  ({ id: `antigravity:${label}`, label, scope: 'model', period: null, model: label.toLowerCase().replace(/\s+/g, '-'), family, usedPercent, remaining: null, resetsAt: RESET_A, observedAt: 1794000000000, tone: 'neutral', ...over });
const BOTH = [{ family: 'gemini' as const, partial: false }, { family: 'claude' as const, partial: false }];
const anti = (over: Partial<QuotaAccount> = {}): QuotaAccount => ({ id: 'ag:work', provider: 'antigravity', account: 'work', label: 'Antigravity · work', model: 'antigravity/work', connection: 'mauzcode', kind: 'quota', windows: {},
  additionalWindows: [fam('gemini', 'Gemini Pro', 25), fam('gemini', 'Gemini Flash', 25), fam('claude', 'Claude Opus', 0)], families: BOTH, quotaStatus: 'fresh', quotaUpdatedAt: 1794000000000, tone: 'neutral', parkedAgents: 0, ...over });
const slots = () => [...document.querySelector('.quota-matrix-grid')!.children].map(c => c.classList.contains('quota-card-spacer') ? 'spacer' : c.querySelector('.quota-card')!.getAttribute('data-family') ?? c.querySelector('.quota-card')!.getAttribute('data-kind'));
const familyCards = () => [...document.querySelectorAll<HTMLElement>('.quota-card--family')];

it('shows adjacent Gemini and Claude cards labeled Antigravity and remaining, without hover', () => {
  render(<QuotaMatrix accounts={[anti()]} />);
  expect(slots()).toEqual(['gemini', 'claude']);
  const [gemini, claudeCard] = familyCards();
  expect(gemini!.querySelector('.quota-card-provider-name')).toHaveTextContent('Antigravity');
  expect(gemini!.querySelector('.quota-card-account')).toHaveTextContent('Gemini· work');
  expect(gemini!.querySelector('.quota-card-remaining')).toHaveTextContent('75%ост.');
  // The family name is its own element, so a long account name can never truncate it.
  expect(gemini!.querySelector('.quota-card-family-name')).toHaveTextContent('Gemini');
  expect(claudeCard!.querySelector('.quota-card-account')).toHaveTextContent('Claude· work');
  expect(claudeCard!.querySelector('.quota-card-remaining')).toHaveTextContent('100%ост.');
  // Never period placeholders, a status symbol or a +N badge on a family card.
  for (const card of familyCards()) { expect(card.querySelector('[data-period]')).toBeNull(); expect(card.querySelector('.quota-card-extra')).toBeNull(); expect(card.querySelector('.quota-card-status')).toBeNull(); expect(card.textContent).not.toContain('—'); }
  expect(gemini).toHaveAccessibleName('Antigravity · work: Gemini, осталось 75%');
  expect(claudeCard).toHaveAccessibleName('Antigravity · work: Claude, осталось 100%');
  // The used-percent legend belongs to period cards; here only the remaining legend is shown.
  expect(screen.queryByText('использовано, %')).toBeNull();
  expect(screen.getByText('ост. — осталось, %')).toBeInTheDocument();
});

it('keeps the pair on one row: a spacer moves it when a single slot remains', () => {
  const { rerender } = render(<QuotaMatrix accounts={[kimi, codex, gate, anti()]} />);
  expect(slots()).toEqual(['quota', 'quota', 'status', 'spacer', 'gemini', 'claude']);
  const spacer = document.querySelector('.quota-card-spacer')!;
  expect(spacer).toHaveAttribute('aria-hidden', 'true'); expect(spacer.querySelector('button')).toBeNull();
  rerender(<QuotaMatrix accounts={[kimi, codex, anti(), gate]} />);
  expect(slots()).toEqual(['quota', 'quota', 'gemini', 'claude', 'status']);
  rerender(<QuotaMatrix accounts={[kimi, codex, gate, claude, anti()]} />);
  expect(slots()).toEqual(['quota', 'quota', 'status', 'quota', 'gemini', 'claude']);
  // A single family card needs no spacer.
  rerender(<QuotaMatrix accounts={[kimi, codex, gate, anti({ families: [BOTH[0]!] })]} />);
  expect(slots()).toEqual(['quota', 'quota', 'status', 'gemini']);
});

it('two Antigravity accounts with partial families stay distinguishable and marked as text', () => {
  const partial = (account: string) => anti({ id: `ag:${account}`, account, label: `Antigravity · ${account}`, additionalWindows: [fam('gemini', 'Gemini Pro', 60), fam('gemini', 'Gemini Flash', null), fam('claude', 'Claude Opus', 0)] });
  render(<QuotaMatrix accounts={[partial('work'), partial('home')]} />);
  const gemini = familyCards().filter(c => c.getAttribute('data-family') === 'gemini');
  expect(gemini.map(c => c.querySelector('.quota-card-account')!.textContent)).toEqual(['Gemini· work', 'Gemini· home']);
  expect(gemini.map(c => c.querySelector('.quota-card-remaining')!.textContent)).toEqual(['40%ост.*', '40%ост.*']);
  expect(gemini.map(c => c.getAttribute('aria-label'))).toEqual(['Antigravity · work: Gemini, осталось 40%, частично', 'Antigravity · home: Gemini, осталось 40%, частично']);
  expect(screen.getByText('ост. — осталось, % · * частично')).toBeInTheDocument();
});

it('two Antigravity accounts each keep their own adjacent pair', () => {
  const second = anti({ id: 'ag:home', account: 'home', label: 'Antigravity · home', additionalWindows: [fam('gemini', 'Gemini Pro', 60), fam('claude', 'Claude Opus', 90, { tone: 'error' })] });
  render(<QuotaMatrix accounts={[kimi, anti(), second]} />);
  // kimi, work pair, then the home pair would split 1 + 1: it moves to the next row.
  expect(slots()).toEqual(['quota', 'gemini', 'claude', 'spacer', 'gemini', 'claude']);
  expect(familyCards().map(c => c.getAttribute('aria-label'))).toEqual([
    'Antigravity · work: Gemini, осталось 75%', 'Antigravity · work: Claude, осталось 100%', 'Antigravity · home: Gemini, осталось 40%', 'Antigravity · home: Claude, осталось 10%']);
  expect(familyCards().map(c => c.querySelector('.quota-card-account')!.textContent)).toEqual(['Gemini· work', 'Claude· work', 'Gemini· home', 'Claude· home']);
  expect(familyCards()[3]).toHaveAttribute('data-tone', 'error');
});

it('mixed providers: ordinary cards keep used percentages, status cards and extra-limit indicators', () => {
  render(<QuotaMatrix accounts={[codex, anti(), claude, gate]} />);
  expect(slots()).toEqual(['quota', 'gemini', 'claude', 'quota', 'status']);
  expect(screen.getByText('использовано, %')).toBeInTheDocument();
  expect(screen.getByText('ост. — осталось, %')).toBeInTheDocument();
  expect([...cells('codex').querySelectorAll('[data-period]')].map(e => e.textContent)).toEqual(['—', '93', '—']);
  expect([...cells('Claude').querySelectorAll('[data-period]')].map(e => e.textContent)).toEqual(['10', '20', '—']);
  expect(cells('Claude').querySelector('.quota-card-extra')).toHaveTextContent('+2');
  expect(document.querySelector('[data-kind="status"] [data-status="available"]')?.textContent).toBe('✓');
  expect(cells('codex').getAttribute('aria-label')).toBe(quotaTooltip(codex).replace(/\n/g, '; '));
});

it('distinguishes 0% remaining, a range, partial and no data as text', () => {
  render(<QuotaMatrix accounts={[anti({ additionalWindows: [fam('gemini', 'Gemini Pro', 60, { tone: 'warning' }), fam('gemini', 'Gemini Flash', 15), fam('gemini', 'Gemini Lite', null), fam('claude', 'Claude Opus', 100, { tone: 'error' })] })]} />);
  const [gemini, claudeCard] = familyCards();
  expect(gemini).toHaveAttribute('data-state', 'partial');
  expect(gemini!.querySelector('.quota-card-remaining')).toHaveTextContent('40–85%ост.*');
  // A range keeps both bounds and the unit: the figure is sized down rather than cut.
  expect(gemini!.querySelector('.quota-card-remaining')).toHaveAttribute('data-long', 'l');
  expect(claudeCard!.querySelector('.quota-card-remaining')).not.toHaveAttribute('data-long');
  // Partial is a visible character explained by the legend, and the account stays on the card.
  expect(gemini!.querySelector('.quota-card-account')).toHaveTextContent('Gemini· work');
  expect(screen.getByText('ост. — осталось, % · * частично')).toBeInTheDocument();
  expect(claudeCard!.querySelector('.quota-card-remaining-partial')).toBeNull();
  expect(gemini).toHaveAccessibleName('Antigravity · work: Gemini, осталось 40–85%, частично');
  expect(gemini).toHaveAccessibleDescription(/Нет показаний: Gemini Lite/);
  expect(gemini).toHaveAttribute('data-tone', 'warning');
  expect(claudeCard!.querySelector('.quota-card-remaining')).toHaveTextContent('0%ост.');
  expect(claudeCard).toHaveAccessibleName('Antigravity · work: Claude, осталось 0%');
  expect(claudeCard).toHaveAttribute('data-tone', 'error');
});

it('all-unknown data shows no data on both cards, never 0% or 100%', () => {
  const { rerender } = render(<QuotaMatrix accounts={[anti({ additionalWindows: [fam('gemini', 'Gemini Pro', null), fam('claude', 'Claude Opus', null, { resetsAt: null })] })]} />);
  const check = () => {
    expect(slots()).toEqual(['gemini', 'claude']);
    for (const card of familyCards()) {
      expect(card).toHaveAttribute('data-state', 'none');
      expect(card.querySelector('.quota-card-remaining')).toHaveTextContent('нет данных');
      expect(card.querySelector('.quota-card-remaining')).toHaveAttribute('data-tone', 'none');
      expect(card.textContent).not.toMatch(/\d\s*%/);
      expect(card.getAttribute('aria-label')).toMatch(/: (Gemini|Claude), нет данных$/);
    }
  };
  check();
  // A known reset stays reachable without a percentage.
  expect(familyCards()[0]).toHaveAccessibleDescription(/Gemini Pro: нет данных, сброс \d/);
  expect(familyCards()[1]).toHaveAccessibleDescription(/Claude Opus: нет данных, сброс неизвестен/);
  // Usage unavailable: a status account with shown families and no windows still renders the family cards.
  rerender(<QuotaMatrix accounts={[anti({ kind: 'status', status: 'unavailable', windows: undefined, additionalWindows: undefined, quotaStatus: 'unavailable', tone: 'error' })]} />);
  check();
  expect(document.querySelector('.quota-card-status')).toBeNull();
});

it('shows only the families with an enabled model, and the ordinary card when none is shown', () => {
  const windows = [fam('gemini', 'Gemini Pro', 25), fam('claude', 'Claude Opus', 0)];
  const { rerender } = render(<QuotaMatrix accounts={[anti({ additionalWindows: [fam('gemini', 'Gemini Pro', 25)], families: [BOTH[0]!] })]} />);
  // No Claude models: one Gemini card, no Claude card and no placeholder slot.
  expect(slots()).toEqual(['gemini']);
  expect(document.querySelector('.quota-card-spacer')).toBeNull();
  // Every Claude model disabled: its readings still arrive but the family is not shown.
  rerender(<QuotaMatrix accounts={[anti({ additionalWindows: windows, families: [BOTH[0]!] })]} />);
  expect(slots()).toEqual(['gemini']);
  expect(document.body.textContent).not.toContain('Claude');
  // Re-enabled: the Claude card is back next to Gemini.
  rerender(<QuotaMatrix accounts={[anti({ additionalWindows: windows, families: BOTH })]} />);
  expect(slots()).toEqual(['gemini', 'claude']);
  // No shown family: the connection keeps its ordinary status card.
  rerender(<QuotaMatrix accounts={[anti({ kind: 'status', status: 'available', windows: undefined, additionalWindows: undefined, families: [] })]} />);
  expect(slots()).toEqual(['status']);
  expect(document.querySelector('[data-status="available"]')?.textContent).toBe('✓');
  rerender(<QuotaMatrix accounts={[anti({ kind: 'status', status: 'available', windows: undefined, additionalWindows: undefined, families: undefined })]} />);
  expect(slots()).toEqual(['status']);
  expect(screen.queryByText('ост. — осталось, %')).toBeNull();
});

it('classifies windows only by the structured family, never by label or provider id', () => {
  render(<QuotaMatrix accounts={[anti({ provider: 'someone-else', label: 'Workbench · team', account: 'team', additionalWindows: [fam('claude', 'Gemini lookalike', 10), { ...fam('gemini', 'Claude weekly', 99), family: null }] })]} />);
  const [gemini, claudeCard] = familyCards();
  expect(gemini).toHaveAccessibleName('Workbench · team: Gemini, нет данных');
  expect(claudeCard).toHaveAccessibleName('Workbench · team: Claude, осталось 90%');
  expect(gemini!.querySelector('.quota-card-provider-name')).toHaveTextContent('Workbench');
});

it('family details open by pointer and list account, family, models, remaining values and local resets as text', async () => {
  const many = ['Gemini 3 Pro Low', 'Gemini 3 Pro High', 'Gemini 3 Flash', '<i>Gemini experimental with a very long descriptive model name that must wrap</i>'].map(l => fam('gemini', l, 25));
  render(<QuotaMatrix accounts={[anti({ planType: 'ultra', additionalWindows: [...many, fam('gemini', 'Gemini Lite', 60, { resetsAt: RESET_B, tone: 'warning' }), fam('gemini', 'Gemini Nano', null, { resetsAt: null }), fam('claude', 'Claude Opus', 0)] })]} />);
  await userEvent.hover(familyCards()[0]!);
  const tip = await screen.findByRole('tooltip');
  expect(tip).toHaveClass('navigation-tooltip');
  expect(tip.querySelector('.navigation-tooltip-title')?.textContent).toBe('Antigravity · Gemini');
  expect(tip.textContent).toContain('Antigravity · work · ultra');
  expect(tip.querySelector('.quota-tooltip-family-total')?.textContent).toBe('Осталось · частично40–75%');
  const rows = [...tip.querySelectorAll('.quota-tooltip-family .quota-tooltip-period')].map(r => [...r.children].map(c => c.textContent));
  const local = (at: number) => new Date(at).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  expect(rows).toEqual([
    ['Gemini 3 Pro Low, Gemini 3 Pro High, Gemini 3 Flash, <i>Gemini experimental with a very long descriptive model name that must wrap</i>', '75%', `сброс ${local(RESET_A)}`],
    ['Gemini Lite', '40%', `сброс ${local(RESET_B)}`],
    ['Gemini Nano', 'нет данных', 'сброс неизвестен'],
  ]);
  expect(tip.querySelector('.quota-tooltip-note')?.textContent).toBe('Нет показаний: Gemini Nano');
  // Labels are text: nothing is parsed as markup, and the long list lives in the scrollable section.
  expect(tip.querySelector('i')).toBeNull();
  expect(tip.querySelector('.quota-tooltip-extra.quota-tooltip-family')).not.toBeNull();
  // Only this family's readings; no extra-limit count stands in for them.
  expect(tip.textContent).not.toContain('Claude Opus'); expect(tip.textContent).not.toContain('Дополнительные лимиты');
  expect(tip.querySelector('.navigation-tooltip-status')?.textContent).toBe('Fresh data');
});

it('family details open on keyboard focus, Escape dismisses and keeps focus, activation opens the same target', async () => {
  const onOpen = vi.fn();
  render(<QuotaMatrix accounts={[kimi, anti()]} onOpen={onOpen} />);
  await userEvent.tab(); await userEvent.tab(); await userEvent.tab();
  const claudeCard = familyCards()[1]!;
  expect(claudeCard).toHaveFocus();
  const tip = await screen.findByRole('tooltip');
  expect(tip.querySelector('.navigation-tooltip-title')?.textContent).toBe('Antigravity · Claude');
  expect(tip.textContent).toContain('Claude Opus'); expect(tip.textContent).toContain('100%');
  await userEvent.keyboard('{Escape}');
  await vi.waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  expect(claudeCard).toHaveFocus();
  expect(onOpen).not.toHaveBeenCalled();
  // Keyboard activation and a click or tap open the same account with that family selected.
  await userEvent.keyboard('{Enter}');
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(onOpen).toHaveBeenLastCalledWith({ account: 'ag:work', family: 'claude' });
  await userEvent.click(familyCards()[0]!);
  expect(onOpen).toHaveBeenLastCalledWith({ account: 'ag:work', family: 'gemini' });
  // Ordinary cards keep their plain navigation: no target, and never the click event.
  await userEvent.click(cells('kimi'));
  expect(onOpen).toHaveBeenCalledTimes(3);
  expect(onOpen).toHaveBeenLastCalledWith();
});

it('family cards expose account, provider, family, remaining value and row details to assistive technology', () => {
  render(<QuotaMatrix accounts={[anti({ quotaStatus: 'stale', additionalWindows: [fam('gemini', 'Gemini Pro', 60), fam('gemini', 'Gemini Flash', 15, { resetsAt: RESET_B }), fam('claude', 'Claude Opus', null)] })]} />);
  const gemini = screen.getByRole('button', { name: 'Antigravity · work: Gemini, осталось 40–85%' });
  expect(gemini).toHaveAccessibleDescription(/^Gemini Pro: осталось 40%, сброс \d\d\.\d\d, \d\d:\d\d · данные \d\d\.\d\d, \d\d:\d\d; Gemini Flash: осталось 85%, сброс .+; Данные устарели$/);
  expect(gemini).toHaveAttribute('data-stale', 'true');
  expect(screen.getByRole('button', { name: 'Antigravity · work: Claude, нет данных' })).toHaveAccessibleDescription(/Claude Opus: нет данных, сброс \d/);
});

it('stale family data shows its observation time; a truncated family says so', async () => {
  render(<QuotaMatrix accounts={[anti({ families: [{ family: 'gemini', partial: true }], quotaUpdatedAt: 1794000000000 + 3_600_000, additionalWindows: [fam('gemini', 'Gemini Pro', 25)] })]} />);
  expect(familyCards()[0]).toHaveAccessibleName('Antigravity · work: Gemini, осталось 75%, частично');
  await userEvent.hover(familyCards()[0]!);
  const tip = await screen.findByRole('tooltip');
  expect(tip.querySelector('.quota-tooltip-reset')?.textContent).toMatch(/^сброс .+ · данные \d\d\.\d\d, \d\d:\d\d$/);
  expect(tip.querySelector('.quota-tooltip-note')?.textContent).toBe('Часть показаний не получена');
});

it('a family account keeps its non-family limits apart from the family readings', async () => {
  render(<QuotaMatrix accounts={[anti({ windows: { weekly: { usedPercent: 30, resetsAt: null, tone: 'neutral' } }, additionalWindows: [fam('gemini', 'Gemini Pro', 25), fam('claude', 'Claude Opus', 0), { ...extra({ id: 'ag:pool', label: 'Shared pool' }), family: null }] })]} />);
  await userEvent.hover(familyCards()[0]!);
  const tip = await screen.findByRole('tooltip');
  expect(tip.querySelector('.quota-tooltip-family')?.textContent).not.toContain('Shared pool');
  expect(tip.textContent).toContain('Неделя · использовано'); expect(tip.textContent).toContain('30%');
  expect(tip.textContent).toContain('Дополнительные лимиты · 1'); expect(tip.textContent).toContain('Shared pool');
});

it('the expanded mobile Usage section shows the same pair with the same values', async () => {
  const onOpen = vi.fn();
  render(<QuotaMatrix accounts={[kimi, codex, gate, anti()]} collapsible onOpen={onOpen} />);
  const toggle = screen.getByRole('button', { name: 'Usage' });
  expect(familyCards()).toHaveLength(0);
  await userEvent.click(toggle);
  expect(slots()).toEqual(['quota', 'quota', 'status', 'spacer', 'gemini', 'claude']);
  expect(familyCards().map(c => c.querySelector('.quota-card-remaining')!.textContent)).toEqual(['75%ост.', '100%ост.']);
  expect(screen.getByText('использовано, %')).toBeInTheDocument(); expect(screen.getByText('ост. — осталось, %')).toBeInTheDocument();
  // Tapping a card gives access to its details in the opened quota settings.
  await userEvent.click(familyCards()[1]!);
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(onOpen).toHaveBeenLastCalledWith({ account: 'ag:work', family: 'claude' });
  expect(familyCards()[1]).toHaveAccessibleDescription(/Claude Opus: осталось 100%, сброс/);
});

it('the compact rail keeps one shared trigger whose details name each shown family and its remaining value', async () => {
  const onOpen = vi.fn();
  const { rerender } = render(<QuotaMatrix accounts={[kimi, anti()]} compact onOpen={onOpen} />);
  expect(screen.getAllByRole('button')).toHaveLength(1);
  const btn = screen.getByRole('button', { name: 'Лимиты моделей' });
  expect(document.querySelector('.quota-card')).toBeNull();
  expect(btn).toHaveAccessibleDescription(/Antigravity · work; Gemini: осталось 75%; Claude: осталось 100%/);
  // Family readings are named in the rows, so they do not raise the extra-limits mark.
  expect(btn.querySelector('.quota-compact-extra')).toBeNull();
  await userEvent.hover(btn);
  const tip = await screen.findByRole('tooltip');
  expect([...tip.querySelectorAll('[data-family]')].map(r => [...r.children].map(c => c.textContent))).toEqual([['Antigravity · work · Gemini', 'осталось 75%'], ['Antigravity · work · Claude', 'осталось 100%']]);
  expect(tip.textContent).toContain('0 · — · 60');
  expect(tip.querySelector('.quota-tooltip-extra')).toBeNull();
  await userEvent.click(btn); expect(onOpen).toHaveBeenCalledTimes(1);
  expect(onOpen).toHaveBeenLastCalledWith();
  // Only shown families are named; unknown stays an explicit unknown.
  rerender(<QuotaMatrix accounts={[anti({ families: [BOTH[1]!], additionalWindows: [fam('gemini', 'Gemini Pro', 25)] })]} compact />);
  expect(screen.getByRole('button', { name: 'Лимиты моделей' })).toHaveAccessibleDescription('Antigravity · work; Claude: нет данных');
});
