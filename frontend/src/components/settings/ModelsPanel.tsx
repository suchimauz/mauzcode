import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Plug, Plus, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { PhosphorIcon } from '../mauzcode/PhosphorIcon';
import { NavigationChatIcon } from '../mauzcode/NavigationChatIcon';
import type { NavigationIcon } from '../../lib/navigation';
import { ApiError } from '../../lib/mauzcode';
import { usePluginUi } from '../../extensions/pluginRuntime';
import type { ExtensionContext } from '../../extensions/types';
import {
  connectionAction, connectionClientVersion, connectionModels, connectionUsage, createConnection, setContextLimits, setModelEnabled, getModelsState, removeConnection, setConnectionEnabled, setProviderEnabled, testConnection, transportLabel, updateConnection,
  type ConnectionInput, type ConnectionModels, type ModelClientVersion, type ModelContextLimit, type ModelConnectionView, type ModelFieldSpec, type ModelInfo, type ModelProviderView, type ModelsState, type ModelTransportSpec, type ModelUsageReport,
} from '../../lib/modelConnections';
import { SettingsField as Field } from './SettingsField';
import { SettingsGroup, SettingsRow, SettingsSwitch } from './SettingsGroup';

type Feedback = { tone: 'success' | 'error'; text: string } | null;
const message = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;
const STATUS_LABEL: Record<ModelUsageReport['status'], string> = { available: 'Available', unavailable: 'Unavailable', configured: 'Configured', disabled: 'Disabled' };
const TRANSPORT_LABEL: Record<ModelTransportSpec['kind'], string> = { direct: 'Direct', socks: 'SOCKS5 proxy', 'ssh-tunnel': 'SSH tunnel' };

/** Human text for machine reason codes from test/usage; unknown codes are shown as-is. */
const REASON_LABEL: Record<string, string> = {
  'models-ok': 'Model list available', 'generation-ok': 'Test generation succeeded', 'usage-ok': 'Usage loaded',
  'models-failed': 'Model list request failed', 'generation-failed': 'Test generation failed', 'usage-failed': 'Usage request failed',
  'test-failed': 'Connection test failed', 'request-failed': 'Provider request failed', 'transport-failed': 'Proxy or tunnel unavailable',
  'unknown-provider': 'Provider is not loaded; restart MauzCode', 'login-required': 'Log in required',
  'not-tested': 'Not tested yet', disabled: 'Connection disabled',
};
export const reasonLabel = (reason: string) => REASON_LABEL[reason] ?? reason;

/** Brand mark for a known provider; custom connections always get a generic plug, others without a mark their declared icon. */
export function ProviderLogo({ logo, providerId, icon }: { logo?: NavigationIcon | null; providerId: string; icon?: string }) {
  if (providerId === 'custom') return <span className="models-provider-logo" data-provider-logo="custom" aria-hidden="true"><Plug size={16} strokeWidth={1.5} /></span>;
  if (logo) return <span className="models-provider-logo" data-provider-logo="brand"><NavigationChatIcon icon={logo} /></span>;
  return <span className="models-provider-logo" data-provider-logo="icon"><PhosphorIcon icon={icon} size={16} /></span>;
}

function formatTime(ms: number) { return new Date(ms).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }); }

/** Shared renderer of a UsageReport: status and reason, then quota windows and balance when present. */
export function UsageView({ usage }: { usage: ModelUsageReport }) {
  const tone = usage.status === 'available' ? 'is-success' : usage.status === 'unavailable' ? 'is-error' : 'is-pending';
  return <div className="models-usage">
    <p className="models-usage-status"><span className={`settings-badge ${tone}`}><i aria-hidden="true" />{STATUS_LABEL[usage.status] ?? usage.status}</span>{usage.reason && <span className="models-usage-reason" title={usage.reason}>{reasonLabel(usage.reason)}</span>}<span className="models-usage-time">checked {formatTime(usage.checkedAt)}</span></p>
    {usage.windows && usage.windows.length > 0 && <ul className="models-windows" aria-label="Quota windows">{usage.windows.map((w, i) => {
      const used = typeof w.usedPercent === 'number' ? Math.max(0, Math.min(100, w.usedPercent)) : null;
      return <li key={`${w.label}-${i}`} className="models-window">
        <span className="models-window-label">{w.label}</span>
        {used !== null && <span className="models-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(used)} aria-label={`${w.label} used`}><span style={{ width: `${used}%` }} /></span>}
        <span className="models-window-meta">{used !== null ? `${Math.round(used)}% used` : typeof w.remaining === 'number' ? `${w.remaining} left` : ''}{w.resetAt ? ` · resets ${formatTime(w.resetAt)}` : ''}</span>
      </li>;
    })}</ul>}
    {usage.plan && <p className="settings-note">Plan: {usage.plan}</p>}
    {usage.balance && <p className="settings-note">Balance: {usage.balance.amount} {usage.balance.currency}</p>}
  </div>;
}

function SelectField({ label, hint, value, onChange, options, name, required }: { label: string; hint?: string; value: string; onChange: (v: string) => void; options: readonly { value: string; label: string }[]; name: string; required?: boolean }) {
  const id = useId();
  return <label className="settings-field" htmlFor={id}><span id={`${id}-label`} className="settings-field-label">{label}</span>
    <select id={id} aria-labelledby={`${id}-label`} name={name} className="settings-select" value={value} required={required} aria-describedby={hint ? `${id}-hint` : undefined} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
    {hint && <span id={`${id}-hint`} className="settings-field-hint">{hint}</span>}</label>;
}

function initialValue(field: ModelFieldSpec, connection?: ModelConnectionView): string | boolean {
  const stored = connection?.config[field.key];
  if (field.type === 'secret') return '';
  if (field.type === 'boolean') return typeof stored === 'boolean' ? stored : field.default ?? false;
  if (stored !== undefined && stored !== null) return String(stored);
  if (field.type === 'select') return field.default ?? field.options[0]?.value ?? '';
  return field.default !== undefined ? String(field.default) : '';
}

/** Schema-driven connection form. Secret inputs are write-only: empty keeps the stored value, "clear" sends null. */
export function SchemaConnectionForm({ provider, connection, state, onSubmit, onCancel, busy }: { provider: ModelProviderView; connection?: ModelConnectionView; state: Pick<ModelsState, 'proxies' | 'instances'>; onSubmit: (input: ConnectionInput) => Promise<boolean>; onCancel: () => void; busy: boolean }) {
  const [accountName, setAccountName] = useState(connection?.accountName ?? '');
  const [values, setValues] = useState<Record<string, string | boolean>>(() => {
    const initial = Object.fromEntries(provider.fields.map(f => [f.key, initialValue(f, connection)]));
    if ('detectCliVersion' in initial && String(initial.clientVersion ?? '').trim()) initial.detectCliVersion = false;
    return initial;
  });
  const [clear, setClear] = useState<Record<string, boolean>>({});
  const manualStored = connection?.config.models;
  const [manual, setManual] = useState(Array.isArray(manualStored) ? manualStored.join('\n') : '');
  const kinds = provider.transports.length ? provider.transports : ['direct' as const];
  const [kind, setKind] = useState<ModelTransportSpec['kind']>(connection?.transport.kind && kinds.includes(connection.transport.kind) ? connection.transport.kind : kinds[0]);
  const [proxyId, setProxyId] = useState(connection?.transport.kind === 'socks' ? connection.transport.proxyId : state.proxies[0]?.id ?? '');
  const [instance, setInstance] = useState(connection?.transport.kind === 'ssh-tunnel' ? connection.transport.instance : state.instances[0] ?? '');
  const hasDetectionField = provider.fields.some(f => f.key === 'detectCliVersion' && f.type === 'boolean');
  const hasVersionOverride = hasDetectionField && String(values.clientVersion ?? '').trim().length > 0;
  const set = (key: string, value: string | boolean) => setValues(previous => ({ ...previous, [key]: value, ...(hasDetectionField && key === 'clientVersion' && String(value).trim() ? { detectCliVersion: false } : {}) }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const config: Record<string, unknown> = {}; const secrets: Record<string, string | null> = {};
    for (const field of provider.fields) {
      const value = values[field.key];
      if (field.type === 'secret') { if (clear[field.key]) secrets[field.key] = null; else if (typeof value === 'string' && value) secrets[field.key] = value; continue; }
      if (field.type === 'boolean') { config[field.key] = value === true; continue; }
      const text = String(value ?? '').trim();
      if (!text) continue;
      config[field.key] = field.type === 'number' ? Number(text) : text;
    }
    if (hasVersionOverride) config.detectCliVersion = false;
    const models = manual.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    if (models.length) config.models = models;
    const transport: ModelTransportSpec = kind === 'socks' ? { kind, proxyId } : kind === 'ssh-tunnel' ? { kind, instance } : { kind: 'direct' };
    if (await onSubmit({ accountName: accountName.trim(), config, secrets, transport })) { setValues(v => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, provider.fields.find(f => f.key === k)?.type === 'secret' ? '' : x]))); setClear({}); }
  };
  return <form className="ssh-form" onSubmit={submit} aria-label={connection ? `Edit ${connection.accountName}` : `New ${provider.label} connection`}>
    <Field label="Account name" name="accountName" required maxLength={100} value={accountName} onChange={e => setAccountName(e.target.value)} autoComplete="off" hint="Shown in lists; does not need to be unique." />
    {provider.fields.map(field => {
      const value = values[field.key];
      if (field.type === 'select') return <SelectField key={field.key} name={field.key} label={field.label} hint={field.help} required={field.required} value={String(value)} onChange={v => set(field.key, v)} options={field.options} />;
      if (field.type === 'boolean') return <label key={field.key} className="settings-check"><input type="checkbox" name={field.key} checked={value === true && !(field.key === 'detectCliVersion' && hasVersionOverride)} disabled={field.key === 'detectCliVersion' && hasVersionOverride} onChange={e => set(field.key, e.target.checked)} />{field.label}</label>;
      if (field.type === 'secret') {
        const stored = connection?.secrets[field.key] === true;
        return <div key={field.key} className="models-secret">
          <Field label={field.label} name={field.key} type="password" autoComplete="new-password" spellCheck={false} value={String(value)} disabled={!!clear[field.key]}
            required={field.required && !stored} placeholder={stored ? 'Stored — leave empty to keep' : field.placeholder}
            hint={[stored ? 'A value is stored. It is never shown; type a new one to replace it.' : 'Not set.', field.help].filter(Boolean).join(' ')} onChange={e => set(field.key, e.target.value)} />
          {stored && !field.required && <label className="settings-check"><input type="checkbox" checked={!!clear[field.key]} onChange={e => setClear(c => ({ ...c, [field.key]: e.target.checked }))} />Clear stored {field.label}</label>}
        </div>;
      }
      return <Field key={field.key} label={field.label} name={field.key} type={field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'} required={field.required} placeholder={field.placeholder} hint={field.help} autoComplete="off" spellCheck={false} value={String(value)} onChange={e => set(field.key, e.target.value)} />;
    })}
    <label className="settings-field"><span id={`${provider.id}-models-label`} className="settings-field-label">Manual model ids</span><textarea name="models" aria-labelledby={`${provider.id}-models-label`} className="models-textarea" rows={3} value={manual} onChange={e => setManual(e.target.value)} spellCheck={false} aria-describedby={`${provider.id}-models-hint`} /><span id={`${provider.id}-models-hint`} className="settings-field-hint">One per line. Used when the provider cannot list models, and merged with discovered ones otherwise.</span></label>
    <fieldset className="models-transport"><legend className="settings-field-label">Network</legend>
      <div className="models-transport-kinds" role="radiogroup" aria-label="Transport">{kinds.map(k => <label key={k} className="settings-check"><input type="radio" name="transport" value={k} checked={kind === k} onChange={() => setKind(k)} />{TRANSPORT_LABEL[k]}</label>)}</div>
      {kind === 'socks' && (state.proxies.length ? <SelectField name="proxyId" label="Saved proxy" required value={proxyId} onChange={setProxyId} options={state.proxies.map(p => ({ value: p.id, label: `${p.name} (${p.host}:${p.port})` }))} hint="Proxied requests require HTTPS endpoints." /> : <p className="settings-note" role="note">No saved SOCKS5 proxies. Add one in the SOCKS5 tab.</p>)}
      {kind === 'ssh-tunnel' && (state.instances.length ? <SelectField name="instance" label="SSH instance" required value={instance} onChange={setInstance} options={state.instances.map(n => ({ value: n, label: n }))} hint="Only instances with a verified host key. Requires HTTPS endpoints." /> : <p className="settings-note" role="note">No verified SSH instances. Verify one in the SSH Instances tab.</p>)}
    </fieldset>
    <div className="ssh-form-actions"><Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button><Button variant="primary" type="submit" disabled={busy || (kind === 'socks' && !proxyId) || (kind === 'ssh-tunnel' && !instance)}>{connection ? 'Save changes' : 'Add connection'}</Button></div>
  </form>;
}

type Actions = {
  csrf: string; busy: boolean; context: ExtensionContext; state: ModelsState;
  run: <T>(label: string, task: () => Promise<T>, success?: (result: T) => string) => Promise<T | null>;
  reload: () => Promise<void>;
};

/** Uses a granted plugin component for the provider when present, else the schema-driven form. */
function ProviderForm({ provider, connection, actions, onDone }: { provider: ModelProviderView; connection?: ModelConnectionView; actions: Actions; onDone: () => void }) {
  const plugin = usePluginUi().registry.modelProviders.find(entry => entry.provider === provider.id);
  if (plugin) {
    const Component = plugin.component;
    return <div className="models-plugin-form" data-model-provider-component={plugin.key}><Component context={actions.context} provider={provider} connection={connection} onSaved={() => { void actions.reload(); onDone(); }} onCancel={onDone} /></div>;
  }
  const submit = async (input: ConnectionInput) => {
    const saved = await actions.run(connection ? 'Save' : 'Add', () => connection ? updateConnection(actions.csrf, connection.id, input) : createConnection(actions.csrf, provider.id, input), c => `${c.accountName} saved`);
    if (!saved) return false;
    await actions.reload(); onDone(); return true;
  };
  return <SchemaConnectionForm provider={provider} connection={connection} state={actions.state} onSubmit={submit} onCancel={onDone} busy={actions.busy} />;
}

const SOURCE_LABEL: Record<ModelContextLimit['source'], string> = { override: 'Owner override', provider: 'Provider', catalog: 'Catalog', fallback: 'Fallback' };
const FALLBACK_LIMIT = 200_000;
const formatTokens = (n: number) => `${n.toLocaleString('en-US')} tokens`;
/** Parses a context draft: '' resets to the default (null); otherwise a positive safe integer without rounding or coercion. */
function parseLimit(draft: string): { value: number | null } | { error: string } {
  const text = draft.trim();
  if (!text) return { value: null };
  if (!/^\d+$/.test(text)) return { error: 'Enter a whole number of tokens' };
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value <= 0) return { error: 'Enter a positive whole number of tokens' };
  return { value };
}

/**
 * One model's context-limit editor. Lives outside the availability label so typing or
 * pressing its buttons never toggles the model. The draft stays local until Save.
 */
function ContextLimitControl({ model, limit, override, draft, error, saving, disabled, onDraft, onSave, onReset, onDiscard }: {
  model: string; limit?: ModelContextLimit; override: number | null; draft: string | undefined; error?: string; saving: boolean; disabled: boolean;
  onDraft: (value: string) => void; onSave: () => void; onReset: () => void; onDiscard: () => void;
}) {
  const id = useId();
  const stored = override == null ? '' : String(override);
  const value = draft ?? stored;
  const dirty = draft !== undefined && draft.trim() !== stored;
  const effective = limit ?? { provider: null, override, effective: override ?? FALLBACK_LIMIT, source: override != null ? 'override' as const : 'fallback' as const };
  const pendingReset = dirty && !draft!.trim();
  return <div className="models-context" role="group" aria-label={`Context limit ${model}`}>
    <label className="models-context-field" htmlFor={id}><span>Context limit</span>
      <input id={id} type="text" inputMode="numeric" autoComplete="off" spellCheck={false} value={value} placeholder={String(effective.provider ?? effective.catalog ?? FALLBACK_LIMIT)}
        aria-label={`Context limit for ${model}`} aria-invalid={error ? true : undefined} aria-describedby={`${id}-value${error ? ` ${id}-error` : ''}`}
        disabled={saving || disabled} onChange={e => onDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && dirty) { e.preventDefault(); onSave(); } else if (e.key === 'Escape' && draft !== undefined) { e.preventDefault(); onDiscard(); } }} />
    </label>
    <span id={`${id}-value`} className="models-context-value" data-context-source={effective.source}>
      {formatTokens(effective.effective)} · {SOURCE_LABEL[effective.source]}{dirty && <span className="models-context-draft">{pendingReset ? ' · unsaved: reset to default' : ` · unsaved: ${value.trim()}`}</span>}
    </span>
    <span className="models-context-actions">
      {dirty && <Button variant="primary" size="compact" disabled={saving || disabled} onClick={onSave}>{saving ? 'Saving…' : 'Save'}</Button>}
      {override != null && !pendingReset && <Button variant="ghost" size="compact" disabled={saving || disabled} onClick={onReset}>Reset to default</Button>}
      {draft !== undefined && <Button variant="ghost" size="compact" disabled={saving} onClick={onDiscard}>Discard</Button>}
    </span>
    {error && <span id={`${id}-error`} className="models-context-error" role="alert">{error}</span>}
  </div>;
}

/** Effective client version of a connection; lookup never blocks the overview or raises a toast on initial failure. */
function useClientVersion(connection: ModelConnectionView, provider: ModelProviderView | undefined, actions: Actions) {
  const enabled = !!provider?.hasClientVersion;
  const [report, setReport] = useState<ModelClientVersion | null>(null);
  const [loading, setLoading] = useState(enabled);
  const generation = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    const current = ++generation.current;
    setReport(null); setLoading(true);
    void connectionClientVersion(actions.csrf, connection.id).then(value => {
      if (current === generation.current) setReport(value);
    }).catch(() => {}).finally(() => { if (current === generation.current) setLoading(false); });
    return () => { generation.current++; };
  }, [enabled, actions.csrf, connection.id, connection.updatedAt]);
  const detectField = provider?.fields.find(f => f.key === 'detectCliVersion' && f.type === 'boolean');
  const detection = connection.config.detectCliVersion ?? detectField?.default ?? false;
  const canDetect = enabled && detection === true && !String(connection.config.clientVersion ?? '').trim();
  const refresh = async () => {
    const current = ++generation.current;
    setLoading(true);
    const result = await actions.run('Re-detect', () => connectionClientVersion(actions.csrf, connection.id, true));
    if (current === generation.current) { setReport(result); setLoading(false); }
  };
  const source = report?.source === 'detected' ? `detected: ${provider?.id} --version` : report?.source === 'override' ? 'connection override' : report?.source === 'fallback' ? 'built-in fallback' : 'built-in default';
  const text = !enabled ? null : <span aria-live="polite">{loading ? <span aria-label="Loading client version"> · v…</span> : report ? <span title={report.detail}> · v{report.version} ({source})</span> : null}</span>;
  return { text, canDetect, loading, refresh };
}

/** Most used quota window as a short row summary, e.g. `5h 42%`. */
function quotaSummary(usage: ModelUsageReport | null): { text: string; tone: string } | null {
  const windows = (usage?.windows ?? []).filter(w => typeof w.usedPercent === 'number');
  if (!windows.length) return null;
  const top = windows.reduce((a, b) => (b.usedPercent! > a.usedPercent! ? b : a));
  const used = Math.round(Math.max(0, Math.min(100, top.usedPercent!)));
  return { text: `${top.label} ${used}%`, tone: used >= 90 ? 'is-critical' : used >= 70 ? 'is-warning' : 'is-ok' };
}

type DetailSection = 'edit' | 'remove' | null;

/**
 * One connection row: account, status, transport, client version, quota summary and the enable switch. Expanding it
 * shows usage, login, Re-detect, the model list (requested on expand, registered providers only) and Test/Edit/Remove.
 */
function ConnectionRow({ connection, provider, actions, expanded, onToggle }: { connection: ModelConnectionView; provider?: ModelProviderView; actions: Actions; expanded: boolean; onToggle: () => void }) {
  // Global provider switch gates network controls; the connection-level switch stays operable.
  const providerOff = provider?.enabled === false;
  const registered = connection.providerRegistered && !!provider;
  const [usage, setUsage] = useState<ModelUsageReport | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [open, setOpen] = useState<DetailSection>(null);
  const [models, setModels] = useState<ConnectionModels | null>(null);
  const [updatingModels, setUpdatingModels] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  const editReasonId = useId();
  const version = useClientVersion(connection, provider, actions);
  const loadUsage = useCallback(async (refresh: boolean, signal?: AbortSignal) => {
    try { setUsage(await connectionUsage(actions.csrf, connection.id, refresh, signal)); setUsageError(null); }
    catch (error) { if (!signal?.aborted) setUsageError(message(error, 'Usage unavailable')); }
  }, [actions.csrf, connection.id]);
  useEffect(() => { const c = new AbortController(); void loadUsage(false, c.signal); return () => c.abort(); }, [loadUsage, connection.updatedAt, connection.enabled]);
  useEffect(() => { if (open === 'remove') confirmRef.current?.querySelector<HTMLButtonElement>('.button--danger')?.focus(); }, [open]);
  useEffect(() => { if (!expanded) setOpen(null); }, [expanded]);
  // The model list is requested when the row expands, and only for a registered provider. It loads locally,
  // without the panel-wide busy state, so the other controls of the row stay operable meanwhile.
  const [modelsError, setModelsError] = useState<string | null>(null);
  useEffect(() => {
    if (!expanded || !registered) return;
    let live = true;
    setModels(null); setModelsError(null);
    connectionModels(actions.csrf, connection.id).then(r => { if (live) setModels(r); }, error => { if (live) setModelsError(message(error, 'Model list unavailable')); });
    return () => { live = false; };
  }, [expanded, registered, actions.csrf, connection.id]);
  const toggle = (section: Exclude<DetailSection, null>) => setOpen(open === section ? null : section);
  const test = async () => { const result = await actions.run('Test', () => testConnection(actions.csrf, connection.id), r => `${connection.accountName}: ${r.message}`); if (result) await loadUsage(true); };
  const updateModels = async () => {
    setUpdatingModels(true);
    try { const r = await actions.run('Update models', () => connectionModels(actions.csrf, connection.id, true), r => r.error ? `Update failed: ${r.error}` : `${r.models.length} models updated`); if (r) setModels(r); }
    finally { setUpdatingModels(false); }
  };
  // Toggles only edit a local draft; Save sends the changed models, so a click never hits the server.
  const [draftOff, setDraftOff] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraftOff(new Set((models?.models ?? []).filter(m => m.disabled).map(m => m.id))); }, [models]);
  const changed = (models?.models ?? []).filter(m => !!m.disabled !== draftOff.has(m.id));
  const toggleDraft = (id: string) => setDraftOff(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const saveModels = async () => {
    if (!changed.length) return;
    setSaving(true);
    try {
      const saved = await actions.run('Save models', async () => {
        let last: ModelConnectionView | null = null;
        for (const m of changed) last = await setModelEnabled(actions.csrf, connection.id, m.id, !draftOff.has(m.id));
        return last!;
      }, () => `Saved ${changed.length} model ${changed.length === 1 ? 'change' : 'changes'}`);
      if (saved) { const off = new Set(saved.disabledModels ?? []); setModels(prev => prev && { ...prev, models: prev.models.map(x => ({ ...x, disabled: off.has(x.id) })) }); }
    } finally { setSaving(false); }
  };
  // Context-limit drafts are keyed by model id and independent of the catalogue rows,
  // so refreshing models never discards them, even when a model temporarily disappears.
  const [contextDrafts, setContextDrafts] = useState<Record<string, string>>({});
  const [contextErrors, setContextErrors] = useState<Record<string, string>>({});
  const [contextSaving, setContextSaving] = useState<string | null>(null);
  const overrides = models?.contextOverrides ?? {};
  const setDraft = (id: string, value: string | undefined) => {
    setContextDrafts(prev => { const next = { ...prev }; if (value === undefined) delete next[id]; else next[id] = value; return next; });
    setContextErrors(prev => { if (!(id in prev)) return prev; const next = { ...prev }; delete next[id]; return next; });
  };
  const saveContext = async (id: string) => {
    const parsed = parseLimit(contextDrafts[id] ?? '');
    if ('error' in parsed) { setContextErrors(prev => ({ ...prev, [id]: parsed.error })); return; }
    setContextSaving(id);
    try {
      const saved = await setContextLimits(actions.csrf, connection.id, { [id]: parsed.value });
      setModels(prev => prev && { ...prev, contextOverrides: saved.overrides, contextLimits: { ...prev.contextLimits, ...saved.limits } });
      setDraft(id, undefined);
    } catch (error) {
      setContextErrors(prev => ({ ...prev, [id]: message(error, 'Saving the context limit failed') }));
    } finally { setContextSaving(null); }
  };
  const contextControl = (id: string, limit?: ModelContextLimit) => <ContextLimitControl model={id} limit={limit} override={overrides[id] ?? null} draft={contextDrafts[id]} error={contextErrors[id]}
    saving={contextSaving === id} disabled={contextSaving !== null && contextSaving !== id}
    onDraft={v => setDraft(id, v)} onSave={() => { void saveContext(id); }} onReset={() => setDraft(id, '')} onDiscard={() => setDraft(id, undefined)} />;
  const listed = new Set((models?.models ?? []).map(m => m.id));
  const pendingAbsent = Object.keys(contextDrafts).filter(id => !listed.has(id)).sort();
  const label = provider?.label ?? connection.provider;
  const tone = usage?.status === 'available' ? 'is-success' : usage?.status === 'unavailable' ? 'is-error' : 'is-pending';
  const quota = quotaSummary(usage);
  const enableSwitch = <SettingsSwitch label="Enabled" checked={connection.enabled} disabled={actions.busy} onChange={e => { const enabled = e.target.checked; void actions.run(enabled ? 'Enable' : 'Disable', () => setConnectionEnabled(actions.csrf, connection.id, enabled), () => `${connection.accountName} ${enabled ? 'enabled' : 'disabled'}`).then(r => r && actions.reload()); }} />;
  return <SettingsRow as="article" aria-label={connection.accountName} data-model-connection={connection.id}
    className={`models-connection${providerOff ? ' is-provider-disabled' : ''}`}
    leading={<ProviderLogo logo={actions.state.providerLogos?.[connection.provider]} providerId={connection.provider} icon={provider?.icon} />}
    label={<><span className="models-connection-name">{connection.accountName}</span>
      {usage ? <span className={`settings-badge ${tone}`}><i aria-hidden="true" />{STATUS_LABEL[usage.status] ?? usage.status}</span> : !usageError && <span className="settings-badge" role="status">Checking…</span>}
      {!connection.enabled && <span className="settings-badge is-pending">Disabled</span>}</>}
    subtitle={<><span>{label}{!connection.providerRegistered && ' (provider not loaded)'} · {transportLabel(connection.transport, actions.state.proxies)}{version.text}</span>
      {quota && <span className={`llm-quota ${quota.tone}`}>{quota.text}</span>}
      {usageError && <span role="status">{usageError}</span>}</>}
    toggleLabel={connection.accountName}
    trailing={enableSwitch} expanded={expanded} onToggle={onToggle}>
    <div className="settings-detail-section" aria-live="polite">{usage ? <UsageView usage={usage} /> : usageError ? <p className="settings-note">{usageError}</p> : <p className="settings-loading">Checking…</p>}</div>
    {['codex', 'claude', 'qwen'].includes(connection.provider) && connection.providerRegistered && <ProviderLogin connection={connection} actions={actions} />}
    {version.canDetect && <div className="settings-detail-section"><Button variant="ghost" size="compact" className="models-redetect" onClick={() => { void version.refresh(); }} disabled={version.loading || actions.busy || actions.context.readOnly}>Re-detect</Button></div>}
    {registered ? <section className="settings-detail-section" aria-label={`Models of ${connection.accountName}`} aria-live="polite"><h4>Models</h4>{!models ? (modelsError ? <p className="settings-note" role="status">{modelsError}</p> : <p className="settings-loading" role="status">Loading models…</p>) : <>
      {models.error && <p className="settings-note" role="status">Discovery failed: {models.error}</p>}
      {models.models.length ? <ul className="models-list" aria-label={`Models of ${connection.accountName}`}>{models.models.map(m => { const off = draftOff.has(m.id); return <li key={m.id} className={off ? 'is-disabled' : undefined} data-model-disabled={off ? 'true' : undefined}>
        <label className="models-model-row"><input type="checkbox" role="switch" className="settings-switch" aria-label={`Enabled ${m.id}`} checked={!off} disabled={saving} onChange={() => toggleDraft(m.id)} />
          <code>{m.id}</code>{m.label && m.label !== m.id && <span className="models-model-label">{m.label}</span>}{off && <span className="settings-badge is-pending">Disabled</span>}</label>
        {contextControl(m.id, models.contextLimits?.[m.id])}
      </li>; })}</ul> : <p className="settings-note">No models.</p>}
      {pendingAbsent.length > 0 && <div className="models-context-pending" role="group" aria-label="Pending context edits for models not in the current list">
        <p className="settings-field-hint">Unsaved context edits for models missing from the current list:</p>
        <ul className="models-list">{pendingAbsent.map(id => <li key={id}><code>{id}</code>{contextControl(id)}</li>)}</ul>
      </div>}
      <p className="settings-field-hint models-context-help">Context limit is a local budget for compaction and context usage. It cannot increase what the provider accepts; empty means the provider value or 200,000.</p>
      {changed.length > 0 && <div className="ssh-form-actions models-save">
        <Button variant="ghost" disabled={saving} onClick={() => setDraftOff(new Set(models.models.filter(m => m.disabled).map(m => m.id)))}>Reset</Button>
        <Button disabled={saving || actions.busy} onClick={() => { void saveModels(); }}>{saving ? 'Saving…' : `Save (${changed.length})`}</Button>
      </div>}
      <div className="models-cache-row">
        <p className="settings-field-hint">{models.cachedAt ? `Updated ${formatTime(models.cachedAt)} · refreshes hourly` : `Source: ${models.source}`}</p>
        <Button variant="ghost" disabled={updatingModels || actions.busy || !connection.enabled || providerOff} onClick={() => { void updateModels(); }}><RefreshCw size={14} strokeWidth={1.5} aria-hidden="true" />{updatingModels ? 'Updating…' : 'Update models'}</Button>
      </div></>}</section>
      : <p id={editReasonId} className="settings-note" role="note">The {label} provider is not loaded, so its models and settings are unavailable. Restart MauzCode or remove this connection.</p>}
    <div className="settings-detail-actions" role="group" aria-label={`Actions for ${connection.accountName}`}>
      <Button onClick={() => { void test(); }} disabled={actions.busy || !connection.enabled || !registered || providerOff}><RefreshCw size={14} strokeWidth={1.5} aria-hidden="true" />Test</Button>
      <Button variant="ghost" aria-expanded={open === 'edit'} disabled={!registered} aria-describedby={registered ? undefined : editReasonId} onClick={() => toggle('edit')}>Edit</Button>
      <Button variant="ghost" className="is-danger" aria-expanded={open === 'remove'} onClick={() => toggle('remove')}>Remove</Button>
    </div>
    {open === 'edit' && provider && registered && <div className="settings-detail-section"><ProviderForm key={connection.updatedAt} provider={provider} connection={connection} actions={actions} onDone={() => setOpen(null)} /></div>}
    {open === 'remove' && <div className="settings-confirm" role="group" aria-label="Confirm removal">
      <p className="settings-note">Removes <b>{connection.accountName}</b> and its stored secrets from MauzCode. This cannot be undone.</p>
      <div className="ssh-form-actions" ref={confirmRef}><Button variant="ghost" onClick={() => setOpen(null)}>Cancel</Button><Button className="button--danger" disabled={actions.busy} onClick={() => { void actions.run('Remove', () => removeConnection(actions.csrf, connection.id), () => `${connection.accountName} removed`).then(r => r && actions.reload()); }}>Remove connection</Button></div>
    </div>}
  </SettingsRow>;
}

type LoginFlow = { flowId: string; kind: 'device-code' | 'authorization-code'; status: 'pending' | 'succeeded' | 'failed' | 'expired'; verificationUri?: string; authorizationUrl?: string; userCode?: string; callbackListening?: boolean; expiresAt: number; message?: string };
type LoginStatus = { loggedIn: boolean; needsLogin: boolean; expiresAt: number | null; account?: { name?: string; email?: string; plan?: string } | null; flow: LoginFlow | null };

/** Native provider login; the browser authorization step opens separately from the connection transport. */
function ProviderLogin({ connection, actions }: { connection: ModelConnectionView; actions: Actions }) {
  const providerOff = actions.state.providers.find(p => p.id === connection.provider)?.enabled === false;
  const [status, setStatus] = useState<LoginStatus | null>(null);
  const [flow, setFlow] = useState<LoginFlow | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const providerLabel = actions.state.providers.find(p => p.id === connection.provider)?.label ?? connection.provider;
  const { csrf } = actions;
  // actions is rebuilt on every render; keep reload in a ref so polling is not restarted.
  const reloadRef = useRef(actions.reload); reloadRef.current = actions.reload;
  const reload = useCallback(() => reloadRef.current(), []);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (providerOff) return null; // Backend refuses provider actions while disabled; do not even ask.
    try {
      const s = await connectionAction<LoginStatus>(csrf, connection.id, 'loginStatus', null, signal);
      setStatus(s); setFlow(s.flow);
      return s;
    } catch { return null; }
  }, [csrf, connection.id, providerOff]);
  useEffect(() => { const c = new AbortController(); void refresh(c.signal); return () => c.abort(); }, [refresh, connection.updatedAt]);
  const pending = flow?.status === 'pending';
  useEffect(() => {
    if (!pending) return;
    const c = new AbortController();
    const timer = setInterval(() => { void refresh(c.signal).then(s => { if (s?.flow?.status === 'succeeded') void reload(); }); }, 2000);
    return () => { clearInterval(timer); c.abort(); };
  }, [pending, refresh, reload]);
  const start = async () => { setCopied(false); setCode(''); setSubmitError(null); const f = await actions.run('Log in', () => connectionAction<LoginFlow>(csrf, connection.id, 'login')); if (f) setFlow(f); };
  const cancel = async () => { const f = await actions.run('Cancel login', () => connectionAction<LoginFlow | null>(csrf, connection.id, 'cancelLogin')); if (f !== null) setFlow(f); };
  const logout = async () => {
    const r = await actions.run('Log out', () => connectionAction(csrf, connection.id, 'logout'), () => `${connection.accountName} logged out`);
    setConfirmLogout(false);
    if (r) { setFlow(null); await refresh(); await reload(); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!flow || !code.trim() || actions.busy) return;
    setSubmitError(null);
    const result = await actions.run('Submit login', () => connectionAction<LoginFlow>(csrf, connection.id, 'submitLogin', { flowId: flow.flowId, code: code.trim() }));
    if (result) {
      setFlow(result);
      setSubmitError(result.message ?? null);
      if (result.status === 'succeeded') { setCode(''); await refresh(); await reload(); }
    }
  };
  const copy = async () => { if (!flow?.userCode) return; try { await navigator.clipboard.writeText(flow.userCode); setCopied(true); } catch { setCopied(false); } };
  const live = providerOff ? 'Provider is disabled' : !status ? 'Checking login…'
    : pending ? 'Waiting for authorization in the browser…'
    : flow?.status === 'failed' || flow?.status === 'expired' ? (flow.message ?? 'Login failed')
    : status.loggedIn ? 'Logged in' : status.needsLogin && status.expiresAt ? 'Login expired; log in again' : 'Not logged in';
  const failed = flow?.status === 'failed' || flow?.status === 'expired';
  const tone = pending ? 'is-pending' : failed ? 'is-error' : status?.loggedIn ? 'is-success' : 'is-pending';
  const account = status?.loggedIn ? status.account : null;
  const who = account ? [account.email ?? account.name, account.plan && `${account.plan} plan`].filter(Boolean).join(' · ') : '';
  return <section className="settings-detail-section models-login" aria-label={`${providerLabel} login for ${connection.accountName}`}>
    <div className="models-login-head">
      <p className="models-login-state" role="status" aria-live="polite"><span className={`settings-badge ${tone}`}><i aria-hidden="true" />{live}</span></p>
      {who && <p className="models-login-account">{who}</p>}
    </div>
    {pending && flow && <div className="models-login-code">
      {flow.kind === 'authorization-code' ? <>
        <p><a href={flow.authorizationUrl} target="_blank" rel="noopener noreferrer">Open {providerLabel} authorization</a></p>
        <p className="settings-note">{flow.callbackListening ? 'Local callback is listening. Login completes automatically when the browser is on this machine; otherwise paste the callback URL below.' : 'Local callback is unavailable. Paste the callback URL from your browser’s address bar, even if that page did not load.'}</p>
        <form className="ssh-form" onSubmit={event => { void submit(event); }} aria-label="Submit authorization code">
          <Field label="Callback URL or authorization code" value={code} onChange={event => setCode(event.target.value)} autoComplete="off" spellCheck={false} hint="Paste the complete callback URL or the code returned by the provider." />
          {submitError && <p role="alert" className="settings-note">{submitError}</p>}
          <Button type="submit" disabled={actions.busy || !code.trim()}>Submit code</Button>
        </form>
      </> : <>
        <ol className="models-login-steps">
          <li>Open <a href={flow.verificationUri} target="_blank" rel="noopener noreferrer">{flow.verificationUri}</a></li>
          <li>Check that the page shows this code and approve:
            <span className="models-login-code-row"><code aria-label="One-time code">{flow.userCode}</code><Button variant="ghost" onClick={() => { void copy(); }}>{copied ? 'Copied' : 'Copy code'}</Button></span></li>
          <li>Return here — login finishes automatically.</li>
        </ol>
      </>}
      <p className="settings-field-hint">Expires {formatTime(flow.expiresAt)}</p>
    </div>}
    {confirmLogout ? <div className="settings-confirm" role="group" aria-label="Confirm logout">
      <p className="settings-note">Deletes the stored {providerLabel} tokens of <b>{connection.accountName}</b>.</p>
      <div className="ssh-form-actions"><Button variant="ghost" onClick={() => setConfirmLogout(false)}>Cancel</Button><Button className="button--danger" disabled={actions.busy} onClick={() => { void logout(); }}>Log out</Button></div>
    </div> : <div className="ssh-form-actions">
      {pending ? <Button variant="ghost" disabled={actions.busy} onClick={() => { void cancel(); }}>Cancel login</Button>
        : <Button disabled={actions.busy || !connection.enabled || providerOff} onClick={() => { void start(); }}>{status?.loggedIn ? 'Log in again' : 'Log in'}</Button>}
      {status?.loggedIn && !pending && <Button variant="ghost" disabled={actions.busy || providerOff} onClick={() => setConfirmLogout(true)}>Log out</Button>}
    </div>}
  </section>;
}

function AddConnection({ actions, first }: { actions: Actions; first: boolean }) {
  // Disabled providers are never offered for new connections; the backend refuses creation independently.
  const providers = actions.state.providers.filter(p => p.enabled !== false);
  const [open, setOpen] = useState(first);
  const [providerId, setProviderId] = useState(providers.find(p => p.id === 'custom')?.id ?? providers[0]?.id ?? '');
  const provider = providers.find(p => p.id === providerId) ?? providers[0];
  if (!actions.state.providers.length) return <p className="settings-note">No model providers are registered.</p>;
  if (!providers.length) return <p className="settings-note" role="note">All model providers are disabled. Enable a provider below to add a connection.</p>;
  if (!open) return <div className="settings-group-surface models-add"><button type="button" className="settings-row-toggle settings-row-add models-add-toggle" onClick={() => setOpen(true)}><span className="settings-row-leading" aria-hidden="true"><Plus size={16} strokeWidth={1.75} /></span><span className="settings-row-label">Add connection</span></button></div>;
  return <SettingsGroup className="models-add-form" label="Add connection" title="Add connection">
    <div className="settings-row-form ssh-form">
      {provider && <p className="models-add-provider"><ProviderLogo logo={actions.state.providerLogos?.[provider.id]} providerId={provider.id} icon={provider.icon} />{provider.label}</p>}
      <SelectField name="provider" label="Provider" value={provider?.id ?? ''} onChange={setProviderId} options={providers.map(p => ({ value: p.id, label: p.label }))} hint={provider?.description} />
      {provider && <ProviderForm key={provider.id} provider={provider} actions={actions} onDone={() => { if (!first) setOpen(false); }} />}
    </div>
  </SettingsGroup>;
}

type Expansion = { expanded: string | null; onToggle: (id: string) => void };

/** Provider group: header row with mark, label, disabled badge and global switch, then one row per connection. */
function ProviderSection({ provider, connections, actions, expansion }: { provider: ModelProviderView; connections: ModelConnectionView[]; actions: Actions; expansion: Expansion }) {
  const enabled = provider.enabled !== false;
  const locked = provider.enabledLocked === true;
  const hintId = useId();
  const hint = locked ? 'Fixed by an instance settings file; change models.disabledProviders there.'
    : enabled ? 'Turning this off hides the provider’s models everywhere; active sessions using them fail on their next request.'
    : 'Provider is disabled: its models are hidden and active sessions using them fail on their next request. Connections and secrets are kept.';
  const toggle = (next: boolean) => {
    if (locked || actions.busy) return; // A file-fixed switch never sends a request, even via label forwarding.
    void actions.run(next ? 'Enable provider' : 'Disable provider',
      () => setProviderEnabled(actions.csrf, provider.id, next),
      () => `${provider.label} ${next ? 'enabled' : 'disabled'}`).then(r => r && actions.reload());
  };
  return <SettingsGroup className="models-provider-group" data-model-provider={provider.id} label={`${provider.label} provider`}
    footnote={<p id={hintId} className="models-provider-hint">{hint}</p>}>
    <SettingsRow className="models-provider-header"
      leading={<ProviderLogo logo={actions.state.providerLogos?.[provider.id]} providerId={provider.id} icon={provider.icon} />}
      label={<><h3 className="models-provider-name">{provider.label}</h3>{!enabled && <span className="settings-badge is-pending">Disabled</span>}{connections.length > 0 && <span className="llm-group-count">{connections.length}</span>}</>}
      trailing={<SettingsSwitch label={`Enable ${provider.label} provider`} aria-describedby={hintId} checked={enabled} disabled={actions.busy || locked} onChange={e => toggle(e.target.checked)} />} />
    {connections.map(c => <ConnectionRow key={c.id} connection={c} provider={provider} actions={actions} expanded={expansion.expanded === c.id} onToggle={() => expansion.onToggle(c.id)} />)}
  </SettingsGroup>;
}

/** Settings → Models: owner management of provider connections through /models/api. */
export function ModelsPanel({ context }: { context: ExtensionContext }) {
  const [state, setState] = useState<ModelsState | null>(null);
  const [loadError, setLoadError] = useState<{ text: string; forbidden: boolean } | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    try { setState(await getModelsState(signal)); setLoadError(null); }
    catch (error) { if (signal?.aborted) return; setLoadError({ text: message(error, 'Не удалось загрузить модели'), forbidden: error instanceof ApiError && error.status === 403 }); }
  }, []);
  useEffect(() => { const c = new AbortController(); void load(c.signal); return () => c.abort(); }, [load]);
  const run: Actions['run'] = async (label, task, success) => {
    setBusy(true); setFeedback(null);
    try { const result = await task(); if (success) setFeedback({ tone: 'success', text: success(result) }); return result; }
    catch (error) { setFeedback({ tone: 'error', text: message(error, `${label} failed`) }); return null; }
    finally { setBusy(false); }
  };
  const actions: Actions | null = state && { csrf: state.csrfToken, busy, context, state, run, reload: () => load() };
  // At most one connection row is expanded at a time across all provider groups.
  const [expanded, setExpanded] = useState<string | null>(null);
  const expansion: Expansion = { expanded, onToggle: id => setExpanded(current => current === id ? null : id) };
  return <div className="settings-panel" data-page="models">
    <header className="settings-panel-header">
      <h2>Models</h2>
      <p>Connect model providers. These connections do not affect agents yet; agents still use LLM Connections.</p>
    </header>
    {feedback && <div className={`settings-feedback is-${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'} aria-live="polite">{feedback.text}</div>}
    {loadError ? <div className="settings-feedback is-error" role="alert">{loadError.forbidden ? 'Только владелец может управлять моделями.' : loadError.text}{!loadError.forbidden && <Button variant="ghost" onClick={() => { void load(); }}>Повторить</Button>}</div>
      : !state || !actions ? <p className="settings-loading" role="status">Загрузка…</p>
      : <>
        <AddConnection actions={actions} first={state.connections.length === 0} />
        {state.providers.length > 0 && <div className="models-provider-groups">
          {state.providers.map(p => <ProviderSection key={p.id} provider={p} connections={state.connections.filter(c => c.provider === p.id)} actions={actions} expansion={expansion} />)}
          {/* Connections whose provider is no longer registered keep their row, in a separate group. */}
          {state.connections.some(c => !state.providers.some(p => p.id === c.provider)) && <SettingsGroup title="Unavailable providers" className="models-orphans">{state.connections.filter(c => !state.providers.some(p => p.id === c.provider)).map(c => <ConnectionRow key={c.id} connection={c} actions={actions} expanded={expanded === c.id} onToggle={() => expansion.onToggle(c.id)} />)}</SettingsGroup>}
        </div>}
      </>}
  </div>;
}
