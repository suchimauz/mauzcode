import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { AudioLines, Plus } from 'lucide-react';
import { Button } from '../ui/Button';
import { ApiError } from '../../lib/mauzcode';
import {
  createVoiceConnection, destinationText, getVoiceState, removeVoiceConnection, setVoiceDefaultRoute, testVoiceConnection, updateVoiceConnection,
  type VoiceConnectionInput, type VoiceConnectionView, type VoiceFieldSpec, type VoiceProviderView, type VoiceState, type VoiceTestResult, type VoiceTransportSpec,
} from '../../lib/voice';
import { VoiceErrors } from './VoiceErrors';
import { SettingsField as Field } from './SettingsField';
import { SettingsGroup, SettingsRow } from './SettingsGroup';

type Feedback = { tone: 'success' | 'error'; text: string } | null;
const message = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;
const STATUS_LABEL: Record<VoiceTestResult['status'], string> = { available: 'Available', unavailable: 'Unavailable', configured: 'Configured', disabled: 'Disabled' };
const TRANSPORT_LABEL: Record<VoiceTransportSpec['kind'], string> = { direct: 'Direct', socks: 'SOCKS5 proxy', 'ssh-tunnel': 'SSH tunnel' };

/** Short route label for a connection card; a missing saved reference is called out instead of hidden. */
function transportText(transport: VoiceTransportSpec | undefined, state: VoiceState): string {
  if (!transport || transport.kind === 'direct') return 'Network: direct';
  if (transport.kind === 'socks') {
    const proxy = state.proxies?.find(p => p.id === transport.proxyId);
    return proxy ? `Network: SOCKS5 · ${proxy.name ?? `${proxy.host}:${proxy.port}`}` : 'Network: SOCKS5 · saved proxy unavailable';
  }
  return state.instances?.includes(transport.instance) ? `Network: SSH · ${transport.instance}` : `Network: SSH · ${transport.instance} (unavailable)`;
}
type Actions = {
  csrf: string; busy: boolean; state: VoiceState;
  run: <T>(label: string, task: () => Promise<T>, success?: (result: T) => string) => Promise<T | null>;
  reload: () => Promise<void>;
};

function SelectField({ label, hint, value, onChange, options, name, disabled }: { label: string; hint?: string; value: string; onChange: (v: string) => void; options: readonly { value: string; label: string }[]; name: string; disabled?: boolean }) {
  const id = useId();
  return <label className="settings-field" htmlFor={id}><span id={`${id}-label`} className="settings-field-label">{label}</span>
    <select id={id} aria-labelledby={`${id}-label`} name={name} className="settings-select" value={value} disabled={disabled} aria-describedby={hint ? `${id}-hint` : undefined} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
    {hint && <span id={`${id}-hint`} className="settings-field-hint">{hint}</span>}</label>;
}

function initialValue(field: VoiceFieldSpec, connection?: VoiceConnectionView): string | boolean {
  if (field.type === 'secret') return '';
  const stored = connection?.config[field.key];
  if (field.type === 'boolean') return typeof stored === 'boolean' ? stored : field.default === true;
  if (stored !== undefined && stored !== null) return String(stored);
  if (field.type === 'select') return String(field.default ?? (field.required ? field.options?.[0]?.value ?? '' : ''));
  return field.default !== undefined ? String(field.default) : '';
}

/** Schema-driven voice connection form. Secret inputs are write-only: empty keeps the stored value, "clear" sends null. */
function VoiceConnectionForm({ provider, connection, actions, onDone, onCancel }: { provider: VoiceProviderView; connection?: VoiceConnectionView; actions: Actions; onDone: () => void; onCancel?: () => void }) {
  const [accountName, setAccountName] = useState(connection?.accountName ?? '');
  const [values, setValues] = useState<Record<string, string | boolean>>(() => Object.fromEntries(provider.fields.map(f => [f.key, initialValue(f, connection)])));
  const [clear, setClear] = useState<Record<string, boolean>>({});
  const proxies = actions.state.proxies ?? [];
  const instances = actions.state.instances ?? [];
  const kinds = provider.transports?.length ? provider.transports : ['direct' as const];
  const saved = connection?.transport;
  const [kind, setKind] = useState<VoiceTransportSpec['kind']>(saved && kinds.includes(saved.kind) ? saved.kind : kinds[0]!);
  const [proxyId, setProxyId] = useState(saved?.kind === 'socks' ? saved.proxyId : proxies[0]?.id ?? '');
  const [instance, setInstance] = useState(saved?.kind === 'ssh-tunnel' ? saved.instance : instances[0] ?? '');
  // A saved reference that no longer exists stays selected (and visibly unavailable) until the user picks another.
  const staleProxy = saved?.kind === 'socks' && !proxies.some(p => p.id === saved.proxyId) ? saved.proxyId : '';
  const staleInstance = saved?.kind === 'ssh-tunnel' && !instances.includes(saved.instance) ? saved.instance : '';
  const proxyOptions = [...proxies.map(p => ({ value: p.id, label: `${p.name ?? 'Proxy'} (${p.host}:${p.port})` })), ...(staleProxy ? [{ value: staleProxy, label: 'Saved proxy (unavailable)' }] : [])];
  const instanceOptions = [...instances.map(n => ({ value: n, label: n })), ...(staleInstance ? [{ value: staleInstance, label: `${staleInstance} (unavailable)` }] : [])];
  const set = (key: string, value: string | boolean) => setValues(v => ({ ...v, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const config: Record<string, unknown> = {}; const secrets: Record<string, string | null> = {};
    for (const field of provider.fields) {
      const value = values[field.key];
      if (field.type === 'secret') { if (clear[field.key]) secrets[field.key] = null; else if (typeof value === 'string' && value) secrets[field.key] = value; continue; }
      if (field.type === 'boolean') { config[field.key] = value === true; continue; }
      if (typeof value !== 'string' || value.trim() === '') continue;
      config[field.key] = field.type === 'number' ? Number(value) : value.trim();
    }
    const transport: VoiceTransportSpec = kind === 'socks' ? { kind, proxyId } : kind === 'ssh-tunnel' ? { kind, instance } : { kind: 'direct' };
    const input: VoiceConnectionInput = { accountName: accountName.trim(), config, secrets, transport };
    const saved = await actions.run(connection ? 'Save' : 'Add', () => connection ? updateVoiceConnection(actions.csrf, connection.id, input) : createVoiceConnection(actions.csrf, provider.id, input), c => connection ? `${c.accountName} saved` : `${c.accountName} added`);
    // Secret values never stay in component state after a successful save.
    if (saved) { setValues(v => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, provider.fields.find(f => f.key === k)?.type === 'secret' ? '' : x]))); setClear({}); onDone(); await actions.reload(); }
  };
  return <form className="ssh-form" onSubmit={submit} aria-label={connection ? `Edit ${connection.accountName}` : `New ${provider.label} connection`}>
    <Field label="Account name" name="accountName" required maxLength={100} value={accountName} onChange={e => setAccountName(e.target.value)} autoComplete="off" hint="Unique within this provider; no slash or colon. Part of the voice route." />
    {provider.fields.map(field => {
      const value = values[field.key];
      if (field.type === 'select') return <SelectField key={field.key} name={field.key} label={field.label} hint={field.help} value={String(value)} onChange={v => set(field.key, v)} options={[...(field.required ? [] : [{ value: '', label: 'Provider default' }]), ...(field.options ?? [])]} />;
      if (field.type === 'boolean') return <label key={field.key} className="settings-check"><input type="checkbox" name={field.key} checked={value === true} onChange={e => set(field.key, e.target.checked)} />{field.label}</label>;
      if (field.type === 'secret') {
        const stored = connection?.secrets[field.key] === true;
        return <div key={field.key} className="models-secret">
          <Field label={field.label} name={field.key} type="password" autoComplete="new-password" spellCheck={false} value={String(value)} disabled={!!clear[field.key]}
            required={field.required && !stored} placeholder={stored ? 'Stored — leave empty to keep' : field.placeholder}
            hint={[stored ? 'A value is stored. It is never shown; type a new one to replace it.' : 'Not set. Stored encrypted on the server and never sent back to the browser.', field.help].filter(Boolean).join(' ')} onChange={e => set(field.key, e.target.value)} />
          {stored && !field.required && <label className="settings-check"><input type="checkbox" checked={!!clear[field.key]} onChange={e => setClear(c => ({ ...c, [field.key]: e.target.checked }))} />Clear stored {field.label}</label>}
        </div>;
      }
      return <Field key={field.key} label={field.label} name={field.key} type={field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'} required={field.required} placeholder={field.placeholder} hint={field.help} autoComplete="off" spellCheck={false} value={String(value)} onChange={e => set(field.key, e.target.value)} />;
    })}
    <fieldset className="models-transport"><legend className="settings-field-label">Network</legend>
      <div className="models-transport-kinds" role="radiogroup" aria-label="Transport">{kinds.map(k => <label key={k} className="settings-check"><input type="radio" name="transport" value={k} checked={kind === k} onChange={() => setKind(k)} />{TRANSPORT_LABEL[k]}</label>)}</div>
      {kind === 'socks' && (proxyOptions.length ? <SelectField name="proxyId" label="Saved proxy" value={proxyId} onChange={setProxyId} options={proxyOptions} hint={proxyId && proxyId === staleProxy ? 'This saved proxy no longer exists. Choose another one; there is no direct fallback.' : 'The recognizer is reached through this proxy; HTTPS/WSS endpoints only.'} /> : <p className="settings-note" role="note">No saved SOCKS5 proxies. Add one in the SOCKS5 tab.</p>)}
      {kind === 'ssh-tunnel' && (instanceOptions.length ? <SelectField name="instance" label="SSH instance" value={instance} onChange={setInstance} options={instanceOptions} hint={instance && instance === staleInstance ? 'This SSH instance is unavailable. Choose another one; there is no direct fallback.' : 'Only instances with a verified host key. HTTPS/WSS endpoints only.'} /> : <p className="settings-note" role="note">No verified SSH instances. Verify one in the SSH Instances tab.</p>)}
    </fieldset>
    <div className="ssh-form-actions">{onCancel && <Button variant="ghost" onClick={onCancel} disabled={actions.busy}>Cancel</Button>}<Button variant="primary" type="submit" disabled={actions.busy || (kind === 'socks' && !proxyId) || (kind === 'ssh-tunnel' && !instance)}>{connection ? 'Save changes' : 'Add connection'}</Button></div>
  </form>;
}

function AddVoiceConnection({ actions, first }: { actions: Actions; first: boolean }) {
  const providers = actions.state.providers;
  const [open, setOpen] = useState(first);
  const [providerId, setProviderId] = useState(providers[0]?.id ?? '');
  const provider = providers.find(p => p.id === providerId) ?? providers[0];
  if (!providers.length) return <div className="settings-row"><div className="settings-row-main"><div className="settings-row-static"><p className="settings-note">No voice providers are registered.</p></div></div></div>;
  if (!open) return <div className="settings-row"><button type="button" className="settings-row-toggle settings-row-add" onClick={() => setOpen(true)}><span className="settings-row-leading" aria-hidden="true"><Plus size={16} strokeWidth={1.75} /></span><span className="settings-row-label">Add voice connection</span></button></div>;
  return <section className="settings-row settings-row-form ssh-form" aria-label="Add voice connection">
    <h4 className="settings-row-label">Add voice connection</h4>
    <SelectField name="provider" label="Provider" value={provider?.id ?? ''} onChange={setProviderId} options={providers.map(p => ({ value: p.id, label: p.label }))} hint={provider?.description} />
    {provider && <p className="settings-note" role="note">{destinationText(provider.destination)}{provider.models.some(m => m.description) ? ` ${provider.models.map(m => m.description).filter(Boolean).join(' ')}` : ''}</p>}
    {provider && <VoiceConnectionForm key={provider.id} provider={provider} actions={actions} onDone={() => { if (!first) setOpen(false); }} onCancel={first ? undefined : () => setOpen(false)} />}
  </section>;
}

/** Voice connection row; expanding it shows destination, network, routes, the test result and Edit/Test/Remove. */
function VoiceConnectionRow({ connection, actions, expanded, onToggle }: { connection: VoiceConnectionView; actions: Actions; expanded: boolean; onToggle: () => void }) {
  const provider = actions.state.providers.find(p => p.id === connection.provider);
  const [open, setOpen] = useState<'edit' | 'remove' | null>(null);
  const [result, setResult] = useState<VoiceTestResult | null>(null);
  const removeButton = useRef<HTMLButtonElement>(null);
  const toggle = (next: 'edit' | 'remove') => setOpen(current => current === next ? null : next);
  useEffect(() => { if (!expanded) setOpen(null); }, [expanded]);
  const routes = actions.state.routes.filter(r => r.connectionId === connection.id);
  const test = async () => { const r = await actions.run('Test', () => testVoiceConnection(actions.csrf, connection.id)); if (r) setResult(r); };
  const tone = result?.status === 'available' ? 'is-success' : result?.status === 'unavailable' ? 'is-error' : 'is-pending';
  return <SettingsRow as="article" aria-label={`${provider?.label ?? connection.provider} · ${connection.accountName}`} className="voice-connection"
    leading={<AudioLines size={16} strokeWidth={1.5} />}
    label={<><span>{connection.accountName}</span>{result && <span className={`settings-badge ${tone}`}><i aria-hidden="true" />{STATUS_LABEL[result.status]}</span>}</>}
    subtitle={<span>{provider ? provider.label : `${connection.provider} — provider is not loaded`}{provider && ` · ${transportText(connection.transport, actions.state).replace(/^Network: /, '')}`}</span>}
    toggleLabel={connection.accountName} expanded={expanded} onToggle={onToggle}>
    {provider && <p className="settings-field-hint">{destinationText(connection.destination ?? provider.destination)}</p>}
    {provider && <p className="settings-field-hint">{transportText(connection.transport, actions.state)}</p>}
    {routes.length > 0 && <ul className="settings-chips" aria-label="Routes">{routes.map(r => <li key={r.route}><code>{r.route}</code></li>)}</ul>}
    {result && <p className="settings-note" role="status">{STATUS_LABEL[result.status]} — {result.message}</p>}
    <div className="settings-detail-actions" role="group" aria-label={`Actions for ${connection.accountName}`}>
      <Button variant="ghost" aria-expanded={open === 'edit'} disabled={!provider} onClick={() => toggle('edit')}>Edit</Button>
      <Button disabled={!provider || actions.busy} onClick={() => { void test(); }}>Test</Button>
      <button ref={removeButton} type="button" className="button button--ghost is-danger" aria-expanded={open === 'remove'} onClick={() => toggle('remove')}>Remove</button>
    </div>
    {open === 'edit' && provider && <div className="settings-detail-section"><VoiceConnectionForm key={connection.updatedAt} provider={provider} connection={connection} actions={actions} onDone={() => setOpen(null)} onCancel={() => setOpen(null)} /></div>}
    {open === 'remove' && <div className="settings-confirm" role="group" aria-label="Confirm removal" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(null); removeButton.current?.focus(); } }}>
      <p className="settings-note">Removes <b>{connection.accountName}</b> and its stored key from MauzCode. Chats that use its route will show it as unavailable until another route is chosen.</p>
      <div className="ssh-form-actions"><Button variant="ghost" autoFocus onClick={() => { setOpen(null); removeButton.current?.focus(); }}>Cancel</Button><Button className="button--danger" disabled={actions.busy} onClick={() => { void actions.run('Remove', () => removeVoiceConnection(actions.csrf, connection.id), () => `${connection.accountName} removed`).then(r => r && actions.reload()); }}>Remove connection</Button></div>
    </div>}
  </SettingsRow>;
}

function DefaultRoute({ actions }: { actions: Actions }) {
  const { routes, defaultRoute } = actions.state;
  const selected = routes.find(r => r.route === defaultRoute.route);
  const options = [{ value: '', label: 'Not configured' }, ...routes.map(r => ({ value: r.route, label: `${r.label} · ${r.accountName}` }))];
  if (defaultRoute.route && !selected) options.push({ value: defaultRoute.route, label: `${defaultRoute.route} (unavailable)` });
  const change = (route: string) => { void actions.run('Default route', () => setVoiceDefaultRoute(actions.csrf, route), r => r.route ? 'Default voice route saved' : 'Default voice route cleared').then(r => r && actions.reload()); };
  const hint = defaultRoute.fixed ? 'Fixed by an instance settings file; change it there.'
    : !routes.length ? 'Add a voice connection first.'
    : selected ? `${destinationText(selected.destination)}${selected.description ? ` ${selected.description}` : ''}`
    : defaultRoute.route ? 'The saved route is not available. Choose another one; there is no automatic fallback.'
    : 'Chats without their own choice have no voice input until a default is selected.';
  return <SettingsGroup title="Default route" className="voice-default-route">
    <div className="settings-row settings-row-form"><SelectField name="defaultRoute" label="Voice model for chats" value={defaultRoute.route} onChange={change} options={options} disabled={actions.busy || defaultRoute.fixed || (!routes.length && !defaultRoute.route)} hint={hint} /></div>
  </SettingsGroup>;
}

/** Owner settings for live dictation: voice connections, their check and the default voice route. */
export function VoicePanel() {
  const [state, setState] = useState<VoiceState | null>(null);
  const [loadError, setLoadError] = useState<{ text: string; forbidden: boolean } | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    try { setState(await getVoiceState(undefined, signal)); setLoadError(null); }
    catch (error) { if (signal?.aborted) return; setLoadError({ text: message(error, 'Не удалось загрузить настройки голоса'), forbidden: error instanceof ApiError && error.status === 403 }); }
  }, []);
  useEffect(() => { const c = new AbortController(); void load(c.signal); return () => c.abort(); }, [load]);
  const run: Actions['run'] = async (label, task, success) => {
    setBusy(true); setFeedback(null);
    try { const result = await task(); if (success) setFeedback({ tone: 'success', text: success(result) }); return result; }
    catch (error) { setFeedback({ tone: 'error', text: message(error, `${label} failed`) }); return null; }
    finally { setBusy(false); }
  };
  const actions: Actions | null = state && { csrf: state.csrfToken, busy, state, run, reload: () => load() };
  const [expanded, setExpanded] = useState<string | null>(null);
  return <div className="settings-panel" data-page="voice">
    <header className="settings-panel-header">
      <h2>Voice</h2>
      <p>Connections for live dictation in chats. Audio is relayed by the MauzCode server; a saved key is never sent back to the browser. Separate from model connections.</p>
    </header>
    {feedback && <div className={`settings-feedback is-${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'} aria-live="polite">{feedback.text}</div>}
    {loadError ? <div className="settings-feedback is-error" role="alert">{loadError.forbidden ? 'Только владелец может управлять голосовым вводом.' : loadError.text}{!loadError.forbidden && <Button variant="ghost" onClick={() => { void load(); }}>Повторить</Button>}</div>
      : !state || !actions ? <p className="settings-loading" role="status">Загрузка…</p>
      : <>
        <DefaultRoute actions={actions} />
        <SettingsGroup title="Connections" className="voice-connections">
          {state.connections.map(c => <VoiceConnectionRow key={c.id} connection={c} actions={actions} expanded={expanded === c.id} onToggle={() => setExpanded(current => current === c.id ? null : c.id)} />)}
          <AddVoiceConnection actions={actions} first={state.connections.length === 0} />
        </SettingsGroup>
        <VoiceErrors />
      </>}
  </div>;
}
