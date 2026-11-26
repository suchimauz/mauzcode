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

// Antigravity: one account, one card per shown model family with the standard USED-percent period cells.
const RESET_A = Date.UTC(2026, 0, 15, 9, 0), RESET_B = Date.UTC(2026, 0, 16, 18, 30);
type Extra = NonNullable<QuotaAccount['additionalWindows']>[number];
const pool = (family: 'gemini' | 'claude', period: 'fiveHour' | 'weekly', usedPercent: number | null, over: Partial<Extra> = {}): Extra => {
  const bucket = `${family === 'gemini' ? 'gemini' : '3p'}-${period === 'fiveHour' ? '5h' : 'weekly'}`;
  return { id: `antigravity:${bucket}`, label: bucket, scope: 'group', bucket, period, model: null, family, usedPercent, remaining: null, resetsAt: period === 'fiveHour' ? RESET_A : RESET_B, observedAt: 1794000000000, tone: 'neutral', ...over };
};
const FOUR = [pool('gemini', 'fiveHour', 20), pool('gemini', 'weekly', 60, { tone: 'warning' }), pool('claude', 'fiveHour', 10), pool('claude', 'weekly', 75, { tone: 'error' })];
const BOTH = [{ family: 'gemini' as const, partial: false }, { family: 'claude' as const, partial: false }];
const anti = (over: Partial<QuotaAccount> = {}): QuotaAccount => ({ id: 'ag:work', provider: 'antigravity', account: 'work', label: 'Antigravity · work', model: 'antigravity/work', connection: 'mauzcode', kind: 'quota', windows: {},
  additionalWindows: FOUR, families: BOTH, quotaStatus: 'fresh', quotaUpdatedAt: 1794000000000, tone: 'error', parkedAgents: 0, icon: { src: 'data:image/svg+xml,%3Csvg%2F%3E', custom: false }, ...over });
const slots = () => [...document.querySelector('.quota-matrix-grid')!.children].map(c => c.classList.contains('quota-card-spacer') ? 'spacer' : c.querySelector('.quota-card')!.getAttribute('data-family') ?? c.querySelector('.quota-card')!.getAttribute('data-kind'));
const familyCards = () => [...document.querySelectorAll<HTMLElement>('.quota-card--family')];
const periodCells = (card: Element) => [...card.querySelectorAll('[data-period]')].map(e => [e.textContent, e.getAttribute('data-tone')]);
const local = (at: number) => new Date(at).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

it('shows adjacent Gemini and Claude cards with their own used-percent period cells, icon and no provider text', () => {
  render(<QuotaMatrix accounts={[anti()]} />);
  expect(slots()).toEqual(['gemini', 'claude']);
  const [gemini, claudeCard] = familyCards();
  expect(periodCells(gemini!)).toEqual([['20', 'neutral'], ['60', 'warning'], ['—', 'none']]);
  expect(periodCells(claudeCard!)).toEqual([['10', 'neutral'], ['75', 'error'], ['—', 'none']]);
  // Provider identity is the icon and the accessible name, not text on the card face.
  for (const card of [gemini!, claudeCard!]) { expect(card).not.toHaveTextContent('Antigravity'); expect(card.querySelector('.quota-card-logo img, .quota-card-logo svg, .quota-card-logo *')).not.toBeNull(); expect(card).not.toHaveTextContent('ост.'); }
  expect(gemini!.querySelector('.quota-card-account')).toHaveTextContent('Gemini· work');
  expect(claudeCard!.querySelector('.quota-card-family-name')).toHaveTextContent('Claude');
  expect(gemini).toHaveAccessibleName('Antigravity · work: Gemini, 5 часов 20%, Неделя 60%, Месяц —');
  expect(gemini).toHaveAttribute('data-tone', 'warning'); expect(claudeCard).toHaveAttribute('data-tone', 'error');
  // One shared used-percent legend; the old remaining legend is gone.
  expect(screen.getByText('использовано, %')).toBeInTheDocument();
  expect(screen.queryByText(/осталось/)).toBeNull();
});

it('keeps the pair on one row: a spacer moves it when a single slot remains', () => {
  const { rerender } = render(<QuotaMatrix accounts={[kimi, codex, gate, anti()]} />);
  expect(slots()).toEqual(['quota', 'quota', 'status', 'spacer', 'gemini', 'claude']);
  const spacer = document.querySelector('.quota-card-spacer')!;
  expect(spacer).toHaveAttribute('aria-hidden', 'true'); expect(spacer.querySelector('button')).toBeNull();
  rerender(<QuotaMatrix accounts={[kimi, codex, anti(), gate]} />);
  expect(slots()).toEqual(['quota', 'quota', 'gemini', 'claude', 'status']);
  rerender(<QuotaMatrix accounts={[kimi, codex, gate, anti({ families: [BOTH[0]!] })]} />);
  expect(slots()).toEqual(['quota', 'quota', 'status', 'gemini']);
});

it('two Antigravity accounts each keep their own distinguishable pair', () => {
  const second = anti({ id: 'ag:home', account: 'home', label: 'Antigravity · home', additionalWindows: [pool('gemini', 'fiveHour', 40), pool('claude', 'weekly', 90, { tone: 'error' })] });
  render(<QuotaMatrix accounts={[kimi, anti(), second]} />);
  expect(slots()).toEqual(['quota', 'gemini', 'claude', 'spacer', 'gemini', 'claude']);
  expect(familyCards().map(c => c.getAttribute('aria-label'))).toEqual([
    'Antigravity · work: Gemini, 5 часов 20%, Неделя 60%, Месяц —', 'Antigravity · work: Claude, 5 часов 10%, Неделя 75%, Месяц —',
    'Antigravity · home: Gemini, 5 часов 40%, Неделя —, Месяц —', 'Antigravity · home: Claude, 5 часов —, Неделя 90%, Месяц —']);
  expect(familyCards().map(c => c.querySelector('.quota-card-account')!.textContent)).toEqual(['Gemini· work', 'Claude· work', 'Gemini· home', 'Claude· home']);
});

it('mixed providers: ordinary cards are unchanged next to family cards', () => {
  render(<QuotaMatrix accounts={[codex, anti(), claude, gate]} />);
  expect(slots()).toEqual(['quota', 'gemini', 'claude', 'quota', 'status']);
  expect([...cells('codex').querySelectorAll('[data-period]')].map(e => e.textContent)).toEqual(['—', '93', '—']);
  expect([...cells('Claude').querySelectorAll('[data-period]')].map(e => e.textContent)).toEqual(['10', '20', '—']);
  expect(cells('Claude').querySelector('.quota-card-extra')).toHaveTextContent('+2');
  expect(document.querySelector('[data-kind="status"] [data-status="available"]')?.textContent).toBe('✓');
  expect(cells('codex').getAttribute('aria-label')).toBe(quotaTooltip(codex).replace(/\n/g, '; '));
});

it('distinguishes 0% used, 100% used and no data; all-unknown is never 0% or 100%', () => {
  const { rerender } = render(<QuotaMatrix accounts={[anti({ additionalWindows: [pool('gemini', 'fiveHour', 0), pool('gemini', 'weekly', 100, { tone: 'error' }), pool('claude', 'fiveHour', null)] })]} />);
  const [gemini, claudeCard] = familyCards();
  expect(periodCells(gemini!)).toEqual([['0', 'neutral'], ['100', 'error'], ['—', 'none']]);
  expect(periodCells(claudeCard!)).toEqual([['—', 'none'], ['—', 'none'], ['—', 'none']]);
  expect(claudeCard).toHaveAttribute('data-state', 'none');
  expect(claudeCard).toHaveAccessibleDescription(/^Claude\/GPT лимиты; 5 часов: нет данных, сброс \d/);
  // Usage unavailable: a status account with shown families and no windows still renders the family cards.
  rerender(<QuotaMatrix accounts={[anti({ kind: 'status', status: 'unavailable', windows: undefined, additionalWindows: undefined, quotaStatus: 'unavailable', tone: 'error' })]} />);
  expect(slots()).toEqual(['gemini', 'claude']);
  for (const card of familyCards()) expect(periodCells(card).map(c => c[0])).toEqual(['—', '—', '—']);
  expect(document.querySelector('.quota-card-status')).toBeNull();
});

it('shows only the families with an enabled model, and the ordinary card when none is shown', () => {
  const { rerender } = render(<QuotaMatrix accounts={[anti({ families: [BOTH[0]!] })]} />);
  expect(slots()).toEqual(['gemini']);
  expect(document.body.textContent).not.toContain('Claude');
  rerender(<QuotaMatrix accounts={[anti({ additionalWindows: [], families: BOTH })]} />);
  // An eligible family with an unknown quota still has its card.
  expect(slots()).toEqual(['gemini', 'claude']);
  rerender(<QuotaMatrix accounts={[anti({ kind: 'status', status: 'available', windows: undefined, additionalWindows: undefined, families: [] })]} />);
  expect(slots()).toEqual(['status']);
  expect(document.querySelector('[data-status="available"]')?.textContent).toBe('✓');
});

it('classifies windows only by the structured family and scope, never by label or provider id', () => {
  render(<QuotaMatrix accounts={[anti({ provider: 'someone-else', label: 'Workbench · team', account: 'team', additionalWindows: [pool('claude', 'fiveHour', 10, { label: 'Gemini lookalike' }), { ...pool('gemini', 'weekly', 99), family: null }] })]} />);
  const [gemini, claudeCard] = familyCards();
  expect(periodCells(gemini!).map(c => c[0])).toEqual(['—', '—', '—']);
  expect(periodCells(claudeCard!).map(c => c[0])).toEqual(['10', '—', '—']);
  expect(gemini).toHaveAccessibleName('Workbench · team: Gemini, 5 часов —, Неделя —, Месяц —');
});

it('family details open by pointer: provider, account, shared pool, each period with local reset, the family extra', async () => {
  const extra: Extra = { ...pool('gemini', 'weekly', 70), id: 'antigravity:gemini-pro-weekly', bucket: 'gemini-pro-weekly', label: '<i>Gemini Pro weekly</i>', scope: 'unknown', tone: 'warning' };
  render(<QuotaMatrix accounts={[anti({ planType: 'ultra', additionalWindows: [...FOUR, extra] })]} />);
  // The extra raises a mark on its own family card, never fills a cell.
  expect(periodCells(familyCards()[0]!).map(c => c[0])).toEqual(['20', '60', '—']);
  expect(familyCards()[0]!.querySelector('.quota-card-extra')).toHaveTextContent('+1');
  expect(familyCards()[1]!.querySelector('.quota-card-extra')).toBeNull();
  await userEvent.hover(familyCards()[0]!);
  const tip = await screen.findByRole('tooltip');
  expect(tip.querySelector('.navigation-tooltip-title')?.textContent).toBe('Antigravity · Gemini');
  expect(tip.textContent).toContain('Antigravity · work · ultra');
  expect(tip.querySelector('.quota-tooltip-pool')?.textContent).toBe('Лимиты Gemini');
  const rows = [...tip.querySelectorAll('.quota-tooltip-family .quota-tooltip-period')].map(r => [...r.children].map(c => c.textContent));
  expect(rows).toEqual([['5 часов · использовано', '20%', `сброс ${local(RESET_A)}`], ['Неделя · использовано', '60%', `сброс ${local(RESET_B)}`], ['Месяц · использовано', '—']]);
  expect(tip.textContent).toContain('Дополнительные лимиты · 1'); expect(tip.textContent).toContain('<i>Gemini Pro weekly</i>');
  expect(tip.querySelector('i')).toBeNull();
  expect(tip.textContent).not.toContain('3p-5h');
  expect(tip.querySelector('.navigation-tooltip-status')?.textContent).toBe(`Updated ${local(1794000000000)}`);
});

it('family details open on keyboard focus, Escape dismisses and keeps focus, activation opens the same target', async () => {
  const onOpen = vi.fn();
  render(<QuotaMatrix accounts={[kimi, anti()]} onOpen={onOpen} />);
  await userEvent.tab(); await userEvent.tab(); await userEvent.tab();
  const claudeCard = familyCards()[1]!;
  expect(claudeCard).toHaveFocus();
  const tip = await screen.findByRole('tooltip');
  expect(tip.querySelector('.navigation-tooltip-title')?.textContent).toBe('Antigravity · Claude');
  expect(tip.querySelector('.quota-tooltip-pool')?.textContent).toBe('Лимиты Claude/GPT');
  expect(tip.textContent).toContain('75%');
  await userEvent.keyboard('{Escape}');
  await vi.waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  expect(claudeCard).toHaveFocus();
  expect(onOpen).not.toHaveBeenCalled();
  await userEvent.keyboard('{Enter}');
  expect(onOpen).toHaveBeenLastCalledWith({ account: 'ag:work', family: 'claude' });
  await userEvent.click(familyCards()[0]!);
  expect(onOpen).toHaveBeenLastCalledWith({ account: 'ag:work', family: 'gemini' });
  await userEvent.click(cells('kimi'));
  expect(onOpen).toHaveBeenCalledTimes(3);
  expect(onOpen).toHaveBeenLastCalledWith();
});

it('stale family data keeps its values, marks the card and names the last success time; a truncated family says so', async () => {
  render(<QuotaMatrix accounts={[anti({ quotaStatus: 'stale', families: [{ family: 'gemini', partial: true }, BOTH[1]!] })]} />);
  const [gemini] = familyCards();
  expect(gemini).toHaveAttribute('data-stale', 'true');
  expect(periodCells(gemini!).map(c => c[0])).toEqual(['20', '60', '—']);
  expect(gemini).toHaveAccessibleDescription(new RegExp(`Часть показаний не получена; Данные устарели, обновлено ${local(1794000000000).replace(/[.]/g, '\\.')}$`));
  await userEvent.hover(gemini!);
  const tip = await screen.findByRole('tooltip');
  expect(tip.querySelector('.quota-tooltip-note')?.textContent).toBe('Часть показаний не получена');
  expect(tip.querySelector('.navigation-tooltip-status')?.textContent).toBe(`Stale · updated ${local(1794000000000)}`);
});

it('the expanded mobile Usage section shows the same pair with the same values', async () => {
  const onOpen = vi.fn();
  render(<QuotaMatrix accounts={[kimi, codex, gate, anti()]} collapsible onOpen={onOpen} />);
  const toggle = screen.getByRole('button', { name: 'Usage' });
  expect(familyCards()).toHaveLength(0);
  await userEvent.click(toggle);
  expect(slots()).toEqual(['quota', 'quota', 'status', 'spacer', 'gemini', 'claude']);
  expect(familyCards().map(c => periodCells(c).map(x => x[0]))).toEqual([['20', '60', '—'], ['10', '75', '—']]);
  await userEvent.click(familyCards()[1]!);
  expect(onOpen).toHaveBeenLastCalledWith({ account: 'ag:work', family: 'claude' });
});

it('the compact rail names each family with its separate periods and lists extras without hover', async () => {
  const onOpen = vi.fn();
  const extra: Extra = { ...pool('gemini', 'weekly', 70), id: 'antigravity:gemini-pro-weekly', bucket: 'gemini-pro-weekly', label: 'Gemini Pro weekly', scope: 'unknown' };
  const orphan: Extra = { ...pool('gemini', 'weekly', 50), id: 'antigravity:other', bucket: 'other', label: 'Other daily', scope: 'unknown', period: null, family: null };
  const { rerender } = render(<QuotaMatrix accounts={[kimi, anti()]} compact onOpen={onOpen} />);
  expect(screen.getAllByRole('button')).toHaveLength(1);
  const btn = screen.getByRole('button', { name: 'Лимиты моделей' });
  expect(btn).toHaveAccessibleDescription(/Antigravity · work; Gemini \(Gemini\): 5 часов 20%, Неделя 60%, Месяц —; Claude \(Claude\/GPT\): 5 часов 10%, Неделя 75%, Месяц —/);
  expect(btn).toHaveAttribute('data-tone', 'error');
  expect(btn.querySelector('.quota-compact-extra')).toBeNull();
  await userEvent.hover(btn);
  const tip = await screen.findByRole('tooltip');
  expect([...tip.querySelectorAll('[data-family]')].map(r => [...r.children].map(c => c.textContent))).toEqual([
    ['Antigravity · work · Gemini (Gemini)', '20 · 60 · —'], ['Antigravity · work · Claude (Claude/GPT)', '10 · 75 · —']]);
  await userEvent.click(btn); expect(onOpen).toHaveBeenLastCalledWith();
  // A family extra and an extra of no eligible family both appear in the indicator details, never as a period.
  rerender(<QuotaMatrix accounts={[anti({ additionalWindows: [...FOUR, extra, orphan] })]} compact />);
  const btn2 = screen.getByRole('button', { name: 'Лимиты моделей' });
  expect(btn2.querySelector('.quota-compact-extra')).not.toBeNull();
  expect(btn2).toHaveAccessibleDescription(/Дополнительные лимиты: 2; Gemini Pro weekly: 70%.*; Other daily: 50%/);
});

it('a family reading at alert raises the account and compact indicator without an account-wide cell', () => {
  const hot = anti({ additionalWindows: [pool('claude', 'fiveHour', 90, { tone: 'error' })], tone: 'error' });
  const { rerender } = render(<QuotaMatrix accounts={[kimi, hot]} compact />);
  expect(screen.getByRole('button', { name: 'Лимиты моделей' })).toHaveAttribute('data-tone', 'error');
  rerender(<QuotaMatrix accounts={[hot]} />);
  expect(periodCells(familyCards()[1]!)[0]).toEqual(['90', 'error']);
  expect(document.querySelectorAll('.quota-card:not(.quota-card--family)')).toHaveLength(0);
});
