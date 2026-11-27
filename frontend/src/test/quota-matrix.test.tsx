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

// Antigravity: one standard quota account per model-family pool, captioned by family, with the shared card, tooltip and compact row.
const RESET_A = Date.UTC(2026, 0, 15, 9, 0), RESET_B = Date.UTC(2026, 0, 16, 18, 30);
type Extra = NonNullable<QuotaAccount['additionalWindows']>[number];
type Cell = NonNullable<QuotaAccount['windows']>['fiveHour'];
const cell = (usedPercent: number | null, resetsAt: number | null, tone: 'neutral' | 'warning' | 'critical' | 'error' = 'neutral'): Cell => ({ usedPercent, resetsAt, tone });
const ICON = { src: 'data:image/svg+xml,%3Csvg%2F%3E', custom: false };
const agPool = (family: 'gemini' | 'claude', over: Partial<QuotaAccount> = {}): QuotaAccount => ({ id: `ag:work:${family}`, connectionId: 'ag:work', family, provider: 'antigravity', account: 'work', label: 'Antigravity · work', model: 'antigravity/work', connection: 'mauzcode', kind: 'quota',
  windows: family === 'gemini' ? { fiveHour: cell(20, RESET_A), weekly: cell(60, RESET_B, 'warning') } : { fiveHour: cell(10, RESET_A), weekly: cell(75, RESET_B, 'error') },
  additionalWindows: [], quotaStatus: 'fresh', quotaUpdatedAt: 1794000000000, tone: family === 'gemini' ? 'warning' : 'error', parkedAgents: 0, icon: ICON, ...over });
const anti = (over: Partial<QuotaAccount> = {}) => [agPool('gemini', over), agPool('claude', over)];
const slots = () => [...document.querySelector('.quota-matrix-grid')!.children].map(c => c.classList.contains('quota-card-spacer') ? 'spacer' : c.querySelector('.quota-card')!.getAttribute('data-family') ?? c.querySelector('.quota-card')!.getAttribute('data-kind'));
const poolCards = () => [...document.querySelectorAll<HTMLElement>('.quota-card[data-family]')];
const periodCells = (card: Element) => [...card.querySelectorAll('[data-period]')].map(e => [e.textContent, e.getAttribute('data-tone')]);
const local = (at: number) => new Date(at).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

it('shows adjacent Gemini and Claude standard cards captioned by family and account', () => {
  render(<QuotaMatrix accounts={anti()} />);
  expect(slots()).toEqual(['gemini', 'claude']);
  const [gemini, claudeCard] = poolCards();
  expect(periodCells(gemini!)).toEqual([['20', 'neutral'], ['60', 'warning'], ['—', 'none']]);
  expect(periodCells(claudeCard!)).toEqual([['10', 'neutral'], ['75', 'error'], ['—', 'none']]);
  expect([gemini!.className, claudeCard!.className]).toEqual(['quota-card', 'quota-card']);
  expect(gemini!.getAttribute('data-kind')).toBe('quota');
  expect(gemini!.querySelector('.quota-card-account')).toHaveTextContent('Gemini · work');
  expect(claudeCard!.querySelector('.quota-card-account')).toHaveTextContent('Claude · work');
  for (const card of [gemini!, claudeCard!]) { expect(card).not.toHaveTextContent('Antigravity'); expect(card.querySelector('.quota-card-logo *')).not.toBeNull(); }
  // The accessible name is the same text tooltip as every other card.
  expect(gemini!.getAttribute('aria-label')).toBe(quotaTooltip(agPool('gemini')).replace(/\n/g, '; '));
  expect(gemini).toHaveAttribute('data-tone', 'warning'); expect(claudeCard).toHaveAttribute('data-tone', 'error');
  expect(screen.getByText('использовано, %')).toBeInTheDocument();
});

it('keeps the pair on one row: a spacer moves it when a single slot remains', () => {
  const { rerender } = render(<QuotaMatrix accounts={[kimi, codex, gate, ...anti()]} />);
  expect(slots()).toEqual(['quota', 'quota', 'status', 'spacer', 'gemini', 'claude']);
  const spacer = document.querySelector('.quota-card-spacer')!;
  expect(spacer).toHaveAttribute('aria-hidden', 'true'); expect(spacer.querySelector('button')).toBeNull();
  rerender(<QuotaMatrix accounts={[kimi, codex, ...anti(), gate]} />);
  expect(slots()).toEqual(['quota', 'quota', 'gemini', 'claude', 'status']);
  rerender(<QuotaMatrix accounts={[kimi, codex, gate, agPool('gemini')]} />);
  expect(slots()).toEqual(['quota', 'quota', 'status', 'gemini']);
});

it('two Antigravity connections each keep their own distinguishable pair', () => {
  const home = (family: 'gemini' | 'claude') => agPool(family, { id: `ag:home:${family}`, connectionId: 'ag:home', account: 'home', label: 'Antigravity · home' });
  render(<QuotaMatrix accounts={[kimi, ...anti(), home('gemini'), home('claude')]} />);
  expect(slots()).toEqual(['quota', 'gemini', 'claude', 'spacer', 'gemini', 'claude']);
  expect(poolCards().map(c => c.querySelector('.quota-card-account')!.textContent)).toEqual(['Gemini · work', 'Claude · work', 'Gemini · home', 'Claude · home']);
});

it('mixed providers: ordinary cards are unchanged next to pool cards', () => {
  render(<QuotaMatrix accounts={[codex, ...anti(), claude, gate]} />);
  expect(slots()).toEqual(['quota', 'gemini', 'claude', 'quota', 'status']);
  expect([...cells('codex').querySelectorAll('[data-period]')].map(e => e.textContent)).toEqual(['—', '93', '—']);
  expect(cells('Claude · me').querySelector('.quota-card-account')).toHaveTextContent('me');
  expect(cells('codex').getAttribute('aria-label')).toBe(quotaTooltip(codex).replace(/\n/g, '; '));
});

it('distinguishes 0% used, 100% used and no data on pool cards like on any card', () => {
  render(<QuotaMatrix accounts={[agPool('gemini', { windows: { fiveHour: cell(0, RESET_A), weekly: cell(100, RESET_B, 'error') } }), agPool('claude', { windows: { fiveHour: cell(null, RESET_A) } })]} />);
  const [gemini, claudeCard] = poolCards();
  expect(periodCells(gemini!)).toEqual([['0', 'neutral'], ['100', 'error'], ['—', 'none']]);
  expect(periodCells(claudeCard!)).toEqual([['—', 'none'], ['—', 'none'], ['—', 'none']]);
});

it('pool details use the standard tooltip: title, account with pool, periods with reset, the pool extra', async () => {
  const extra: Extra = { id: 'antigravity:gemini-pro-weekly', label: '<i>Gemini Pro weekly</i>', scope: 'unknown', bucket: 'gemini-pro-weekly', period: 'weekly', model: null, family: 'gemini', usedPercent: 70, remaining: null, resetsAt: RESET_B, observedAt: 1794000000000, tone: 'warning' };
  render(<QuotaMatrix accounts={[agPool('gemini', { planType: 'ultra', additionalWindows: [extra] }), agPool('claude')]} />);
  expect(poolCards()[0]!.querySelector('.quota-card-extra')).toHaveTextContent('+1');
  expect(poolCards()[1]!.querySelector('.quota-card-extra')).toBeNull();
  await userEvent.hover(poolCards()[0]!);
  const tip = await screen.findByRole('tooltip');
  expect(tip.querySelector('.navigation-tooltip-title')?.textContent).toBe('Gemini · work');
  expect(tip.textContent).toContain('Antigravity · work · Gemini · ultra');
  const rows = [...tip.querySelectorAll(':scope > .quota-tooltip-periods > .quota-tooltip-period')].map(r => [...r.children].map(c => c.textContent));
  expect(rows).toEqual([['5 часов', '20%', `сброс ${local(RESET_A)}`], ['Неделя', '60%', `сброс ${local(RESET_B)}`]]);
  expect(tip.textContent).not.toContain('использовано');
  expect(tip.textContent).toContain('Дополнительные лимиты · 1'); expect(tip.textContent).toContain('<i>Gemini Pro weekly</i>');
  expect(tip.querySelector('i')).toBeNull();
});

it('pool details open on keyboard focus, Escape dismisses and keeps focus, activation opens the connection and family', async () => {
  const onOpen = vi.fn();
  render(<QuotaMatrix accounts={[kimi, ...anti()]} onOpen={onOpen} />);
  await userEvent.tab(); await userEvent.tab(); await userEvent.tab();
  const claudeCard = poolCards()[1]!;
  expect(claudeCard).toHaveFocus();
  const tip = await screen.findByRole('tooltip');
  expect(tip.querySelector('.navigation-tooltip-title')?.textContent).toBe('Claude · work');
  expect(tip.textContent).toContain('Antigravity · work · Claude/GPT');
  await userEvent.keyboard('{Escape}');
  await vi.waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  expect(claudeCard).toHaveFocus();
  expect(onOpen).not.toHaveBeenCalled();
  await userEvent.keyboard('{Enter}');
  expect(onOpen).toHaveBeenLastCalledWith({ account: 'ag:work', family: 'claude' });
  await userEvent.click(poolCards()[0]!);
  expect(onOpen).toHaveBeenLastCalledWith({ account: 'ag:work', family: 'gemini' });
  await userEvent.click(cells('kimi'));
  expect(onOpen).toHaveBeenCalledTimes(3);
  expect(onOpen).toHaveBeenLastCalledWith(undefined);
});

it('stale pool data keeps its values and marks the card; a truncated pool says so', async () => {
  render(<QuotaMatrix accounts={[agPool('gemini', { quotaStatus: 'stale', partial: true })]} />);
  const [gemini] = poolCards();
  expect(gemini).toHaveAttribute('data-stale', 'true');
  expect(periodCells(gemini!).map(c => c[0])).toEqual(['20', '60', '—']);
  await userEvent.hover(gemini!);
  const tip = await screen.findByRole('tooltip');
  expect(tip.querySelector('.quota-tooltip-note')?.textContent).toBe('Часть показаний не получена');
  expect(tip.querySelector('.navigation-tooltip-status')?.textContent).toBe(`Updated ${local(1794000000000)}`);
});

it('the expanded mobile Usage section shows the same pair with the same values', async () => {
  const onOpen = vi.fn();
  render(<QuotaMatrix accounts={[kimi, codex, gate, ...anti()]} collapsible onOpen={onOpen} />);
  const toggle = screen.getByRole('button', { name: 'Usage' });
  expect(poolCards()).toHaveLength(0);
  await userEvent.click(toggle);
  expect(slots()).toEqual(['quota', 'quota', 'status', 'spacer', 'gemini', 'claude']);
  expect(poolCards().map(c => periodCells(c).map(x => x[0]))).toEqual([['20', '60', '—'], ['10', '75', '—']]);
  await userEvent.click(poolCards()[1]!);
  expect(onOpen).toHaveBeenLastCalledWith({ account: 'ag:work', family: 'claude' });
});

it('the compact rail lists each pool as an ordinary row and its extras without hover', async () => {
  const onOpen = vi.fn();
  const extra: Extra = { id: 'antigravity:gemini-pro-weekly', label: 'Gemini Pro weekly', scope: 'unknown', bucket: 'gemini-pro-weekly', period: 'weekly', model: null, family: 'gemini', usedPercent: 70, remaining: null, resetsAt: null, observedAt: null, tone: 'neutral' };
  const { rerender } = render(<QuotaMatrix accounts={[kimi, ...anti()]} compact onOpen={onOpen} />);
  expect(screen.getAllByRole('button')).toHaveLength(1);
  const btn = screen.getByRole('button', { name: 'Лимиты моделей' });
  expect(btn).toHaveAttribute('data-tone', 'error');
  expect(btn.querySelector('.quota-compact-extra')).toBeNull();
  await userEvent.hover(btn);
  const tip = await screen.findByRole('tooltip');
  expect([...tip.querySelectorAll('[data-family]')].map(r => [...r.children].map(c => c.textContent))).toEqual([['Gemini · work', '20 · 60 · —'], ['Claude · work', '10 · 75 · —']]);
  await userEvent.click(btn); expect(onOpen).toHaveBeenLastCalledWith();
  rerender(<QuotaMatrix accounts={[agPool('gemini', { additionalWindows: [extra] }), agPool('claude')]} compact />);
  const btn2 = screen.getByRole('button', { name: 'Лимиты моделей' });
  expect(btn2.querySelector('.quota-compact-extra')).not.toBeNull();
  expect(btn2).toHaveAccessibleDescription(/Дополнительные лимиты: 1; Gemini Pro weekly: 70%/);
});

it('a pool reading at alert raises only that card and the compact indicator', () => {
  const hot = [agPool('gemini', { tone: 'neutral', windows: { fiveHour: cell(5, null) } }), agPool('claude', { windows: { fiveHour: cell(90, null, 'error') }, tone: 'error' })];
  const { rerender } = render(<QuotaMatrix accounts={[kimi, ...hot]} compact />);
  expect(screen.getByRole('button', { name: 'Лимиты моделей' })).toHaveAttribute('data-tone', 'error');
  rerender(<QuotaMatrix accounts={hot} />);
  expect(poolCards().map(c => c.getAttribute('data-tone'))).toEqual(['neutral', 'error']);
  expect(periodCells(poolCards()[1]!)[0]).toEqual(['90', 'error']);
});
