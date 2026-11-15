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
