import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, Button, Stack, requestJson, type ExtensionSettingsTabProps, type UiExtension } from '@mauzcode/ui';

/** Safe instance-wide RTK state served by the owner-only GET/POST /rtk/api. */
export type RtkControl = {
  enabled: boolean;
  revision: number;
  availability: 'unknown' | 'available' | 'unavailable';
  path: string | null;
  version: string | null;
  reason: string | null;
  checkedAt: number | null;
};
type Loaded = { control: RtkControl; csrfToken: string };
type Action = 'check' | 'enable' | 'disable';

const API = '/rtk/api';
const AVAILABILITY: Record<RtkControl['availability'], string> = { unknown: 'не проверено', available: 'доступен', unavailable: 'недоступен' };
const controlOf = (data: unknown): RtkControl | null =>
  data && typeof data === 'object' && 'control' in data && data.control && typeof data.control === 'object' ? data.control as RtkControl : null;
const message = (error: unknown) => error instanceof ApiError
  ? error.status === 401 ? 'Нужно войти в систему.' : error.status === 403 ? `Нет доступа: ${error.message}` : error.message
  : 'Не удалось связаться с сервером.';

/**
 * Own Settings tab for RTK. Reads the authoritative state from GET /rtk/api and changes it only through
 * POST /rtk/api with the cookie-bound CSRF token. A successful check never turns RTK on; enable is offered only after a
 * successful check and the server re-checks it. One action at a time; every request is aborted on unmount.
 */
export function RtkSettings({ context }: ExtensionSettingsTabProps) {
  const [data, setData] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState<Action | 'load' | null>('load');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requests = useRef(new Set<AbortController>());
  const inFlight = useRef(false);

  const track = () => { const c = new AbortController(); requests.current.add(c); return c; };
  const load = useCallback(async () => {
    const c = track();
    try {
      const next = await requestJson<Loaded>(API, { signal: c.signal });
      if (!c.signal.aborted) setData(next);
      return next;
    } finally { requests.current.delete(c); }
  }, []);

  useEffect(() => {
    const set = requests.current;
    load().then(() => setError(null), e => { if (!(e instanceof DOMException && e.name === 'AbortError')) setError(message(e)); }).finally(() => setBusy(b => b === 'load' ? null : b));
    return () => { for (const c of set) c.abort(); set.clear(); };
  }, [load]);

  const run = async (action: Action) => {
    if (inFlight.current || !data || context.readOnly) return;
    inFlight.current = true; setBusy(action); setError(null); setNotice(null);
    const c = track();
    try {
      const r = await requestJson<{ control: RtkControl; probe?: { ok: boolean; reason: string | null }; stale?: boolean }>(API, { method: 'POST', body: { action }, csrfToken: data.csrfToken, signal: c.signal });
      if (c.signal.aborted) return;
      setData({ ...data, control: r.control });
      if (action === 'check') setNotice(r.probe?.ok ? (r.control.enabled ? 'RTK доступен.' : 'RTK доступен. Включите его отдельно, если нужно.') : `Проверка не прошла: ${r.probe?.reason ?? 'RTK недоступен.'}`);
      else setNotice(action === 'enable' ? 'RTK включён.' : 'RTK выключен.');
    } catch (e) {
      if (c.signal.aborted) return;
      setError(message(e));
      const control = e instanceof ApiError ? controlOf(e.data) : null;
      if (control) setData({ ...data, control });
      else await load().catch(() => undefined);
    } finally {
      requests.current.delete(c); inFlight.current = false;
      if (!c.signal.aborted) setBusy(null);
    }
  };

  if (!data) return <Stack gap={2}>
    {busy === 'load' && <p className="settings-note" role="status">Загрузка состояния RTK…</p>}
    {error && <p role="alert">{error}</p>}
    {error && <div><Button onClick={() => { setBusy('load'); setError(null); load().catch(e => setError(message(e))).finally(() => setBusy(null)); }}>Повторить</Button></div>}
  </Stack>;

  const c = data.control;
  const locked = busy !== null || context.readOnly;
  const canEnable = c.availability === 'available';
  const toggleDisabled = locked || (!c.enabled && !canEnable);
  return <Stack gap={3} aria-busy={busy !== null}>
    <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: 'var(--space-1) var(--space-3)', margin: 0 }}>
      <dt>Состояние</dt><dd data-testid="rtk-enabled">{c.enabled ? 'включён' : 'выключен'}</dd>
      <dt>Доступность</dt><dd data-testid="rtk-availability">{busy === 'check' ? 'проверка…' : AVAILABILITY[c.availability]}</dd>
      <dt>Путь</dt><dd style={{ overflowWrap: 'anywhere' }}><code>{c.path ?? '—'}</code></dd>
      <dt>Версия</dt><dd>{c.version ?? '—'}</dd>
      <dt>Проверено</dt><dd>{c.checkedAt ? new Date(c.checkedAt).toLocaleString() : 'никогда'}</dd>
      {c.reason && <><dt>Причина</dt><dd>{c.reason}</dd></>}
    </dl>
    <Stack direction="horizontal" gap={2} wrap>
      <Button onClick={() => run('check')} disabled={locked}>{busy === 'check' ? 'Проверка…' : 'Проверить'}</Button>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <input type="checkbox" role="switch" checked={c.enabled} disabled={toggleDisabled} aria-describedby="rtk-toggle-help" onChange={() => run(c.enabled ? 'disable' : 'enable')} />
        Сжимать вывод локального bash через RTK
      </label>
    </Stack>
    <p id="rtk-toggle-help" className="settings-note">
      {context.readOnly ? 'Только чтение: менять настройку может владелец.' : !c.enabled && !canEnable ? 'Сначала выполните успешную проверку — включить можно только доступный RTK.' : 'Настройка общая для всего экземпляра; SSH и Terminal не затрагиваются. Разовый обход — параметр rtk:false у вызова bash.'}
    </p>
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
  </Stack>;
}

export default { id: 'rtk', apiVersion: 1, settingsTabs: [{ id: 'shell', title: 'RTK', description: 'Сжатие вывода локальных вызовов bash через установленный RTK. По умолчанию выключено.', component: RtkSettings }] } satisfies UiExtension;
