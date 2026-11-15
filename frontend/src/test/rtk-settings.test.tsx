import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import rtkExtension, { RtkSettings, type RtkControl } from '../../../plugins/rtk/ui';
import { createExtensionRegistry } from '../extensions/registry';

const base: RtkControl = { enabled: false, revision: 1, availability: 'unknown', path: null, version: null, reason: null, checkedAt: null };
const healthy: RtkControl = { ...base, revision: 2, availability: 'available', path: '/usr/local/bin/rtk', version: '1.2.0', checkedAt: 1_700_000_000_000 };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const ctx = (readOnly = false) => ({ agentId: null, theme: 'light' as const, readOnly });
type Handler = (body: { action: string } | null) => Response | Promise<Response>;
function mockApi(control: RtkControl, post: Handler) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) =>
    options?.method === 'POST' ? post(JSON.parse(String(options.body))) : json({ control, csrfToken: 'bound' }));
}
const posts = (fetch: ReturnType<typeof mockApi>) => fetch.mock.calls.filter(([, o]) => o?.method === 'POST');
afterEach(() => { vi.restoreAllMocks(); });

describe('RTK settings tab', () => {
  it('declares only a granted settings tab and needs no core component', () => {
    expect(rtkExtension.id).toBe('rtk');
    expect(createExtensionRegistry([rtkExtension], {}).settingsTabs).toEqual([]);
    expect(createExtensionRegistry([rtkExtension], { rtk: { settingsTabs: ['shell'] } }).settingsTabs.map(s => s.key)).toEqual(['rtk/shell']);
  });

  it('keeps the toggle disabled while unknown; a successful check does not auto-enable', async () => {
    const fetch = mockApi(base, () => json({ control: healthy, probe: { ok: true, code: 'ok', reason: null }, stale: false }));
    render(<RtkSettings context={ctx()} />);
    const toggle = await screen.findByRole('switch');
    expect((toggle as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId('rtk-availability').textContent).toBe('не проверено');
    fireEvent.click(screen.getByRole('button', { name: 'Проверить' }));
    await screen.findByText(/Включите его отдельно/);
    expect(screen.getByTestId('rtk-enabled').textContent).toBe('выключен');
    expect((screen.getByRole('switch') as HTMLInputElement).disabled).toBe(false);
    expect(screen.getByText('/usr/local/bin/rtk')).toBeTruthy();
    const [[, options]] = posts(fetch);
    expect(new Headers(options?.headers).get('X-CSRF-Token')).toBe('bound');
    expect(JSON.parse(String(options?.body))).toEqual({ action: 'check' });
  });

  it('shows a server rejection of enable and the authoritative state from the response', async () => {
    const failed = { ...healthy, revision: 3, availability: 'unavailable' as const, reason: 'rtk not found on PATH' };
    mockApi(healthy, () => json({ control: failed, error: 'rtk not found on PATH', code: 'unavailable' }, 409));
    render(<RtkSettings context={ctx()} />);
    fireEvent.click(await screen.findByRole('switch'));
    expect((await screen.findByRole('alert')).textContent).toContain('rtk not found on PATH');
    expect(screen.getByTestId('rtk-availability').textContent).toBe('недоступен');
    expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(false);
  });

  it('blocks duplicate actions while one is in flight and reloads state after a failure without control', async () => {
    let release!: (r: Response) => void;
    const fetch = mockApi({ ...healthy, enabled: true }, () => new Promise<Response>(r => { release = r; }));
    render(<RtkSettings context={ctx()} />);
    const toggle = await screen.findByRole('switch');
    fireEvent.click(toggle); fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: /Провер/ }));
    expect(posts(fetch)).toHaveLength(1);
    expect((screen.getByRole('switch') as HTMLInputElement).disabled).toBe(true);
    await act(async () => { release(json({ error: 'RTK request failed' }, 500)); });
    expect((await screen.findByRole('alert')).textContent).toContain('RTK request failed');
    await waitFor(() => expect(fetch.mock.calls.filter(([, o]) => o?.method !== 'POST')).toHaveLength(2));
  });

  it('readOnly disables every write control and never posts', async () => {
    const fetch = mockApi(healthy, () => json({}));
    render(<RtkSettings context={ctx(true)} />);
    await screen.findByText(/Только чтение/);
    expect((screen.getByRole('switch') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Проверить' }) as HTMLButtonElement).disabled).toBe(true);
    expect(posts(fetch)).toHaveLength(0);
  });

  it('reports a forbidden GET and aborts requests on unmount', async () => {
    let signal: AbortSignal | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, o) => { signal = o?.signal ?? undefined; return new Promise<Response>(() => undefined); });
    const view = render(<RtkSettings context={ctx()} />);
    expect(screen.getByRole('status').textContent).toContain('Загрузка');
    view.unmount();
    expect(signal?.aborted).toBe(true);
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: 'Owner access required' }, 403));
    render(<RtkSettings context={ctx()} />);
    expect((await screen.findByRole('alert')).textContent).toContain('Owner access required');
  });
});
