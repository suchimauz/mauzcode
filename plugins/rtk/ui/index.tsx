import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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
const AVAILABILITY: Record<RtkControl['availability'], string> = { unknown: 'Не проверено', available: 'Доступен', unavailable: 'Недоступен' };
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

  // Host Settings classes keep the tab in the dialog's visual language (key/value card, feedback banners, check rows).
  if (!data) return <Stack gap={3}>
    {busy === 'load' && <p className="settings-loading" role="status">Загрузка состояния RTK…</p>}
    {error && <p role="alert" className="settings-feedback is-error">{error}</p>}
    {error && <div className="settings-actions"><Button onClick={() => { setBusy('load'); setError(null); load().catch(e => setError(message(e))).finally(() => setBusy(null)); }}>Повторить</Button></div>}
  </Stack>;

  const c = data.control;
  const locked = busy !== null || context.readOnly;
  const canEnable = c.availability === 'available';
  const toggleDisabled = locked || (!c.enabled && !canEnable);
  const row = (label: string, value: ReactNode, testId?: string) => <div className="settings-kv-row"><dt>{label}</dt><dd data-testid={testId}>{value}</dd></div>;
  return <Stack gap={4} aria-busy={busy !== null}>
    {notice && <p role="status" className={`settings-feedback ${notice.startsWith('Проверка не прошла') ? 'is-error' : 'is-success'}`}>{notice}</p>}
    {error && <p role="alert" className="settings-feedback is-error">{error}</p>}
    <dl className="settings-kv">
      {row('Состояние', c.enabled ? 'Включён' : 'Выключен', 'rtk-enabled')}
      {row('Доступность', busy === 'check' ? 'Проверка…' : AVAILABILITY[c.availability], 'rtk-availability')}
      {row('Путь', <code>{c.path ?? '—'}</code>)}
      {row('Версия', c.version ?? '—')}
      {row('Проверено', c.checkedAt ? new Date(c.checkedAt).toLocaleString() : 'Никогда')}
      {c.reason && row('Причина', <span className="settings-kv-flag">{c.reason}</span>)}
    </dl>
    <label className="settings-check">
      <input type="checkbox" role="switch" checked={c.enabled} disabled={toggleDisabled} aria-describedby="rtk-toggle-help" onChange={() => run(c.enabled ? 'disable' : 'enable')} />
      <span>Сжимать вывод локального bash через RTK
        <span id="rtk-toggle-help" className="settings-field-hint" style={{ display: 'block' }}>
          {context.readOnly ? 'Только чтение: менять настройку может владелец.' : !c.enabled && !canEnable ? 'Сначала выполните успешную проверку — включить можно только доступный RTK.' : 'Настройка общая для всего экземпляра; SSH и Terminal не затрагиваются. Разовый обход — параметр rtk:false у вызова bash.'}
        </span>
      </span>
    </label>
    <div className="settings-actions">
      <Button onClick={() => run('check')} disabled={locked}>{busy === 'check' ? 'Проверка…' : 'Проверить RTK'}</Button>
    </div>
  </Stack>;
}

export default { id: 'rtk', apiVersion: 1, settingsTabs: [{ id: 'shell', title: 'RTK', description: 'Сжатие вывода локальных вызовов bash через установленный RTK. По умолчанию выключено.', component: RtkSettings }] } satisfies UiExtension;
