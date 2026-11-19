import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { AudioLines, Plus } from 'lucide-react';
import { Button } from '../ui/Button';
import { ApiError } from '../../lib/mauzcode';
import {
  createVoiceConnection, destinationText, getVoiceState, removeVoiceConnection, setVoiceDefaultRoute, testVoiceConnection, updateVoiceConnection,
  type VoiceConnectionInput, type VoiceConnectionView, type VoiceFieldSpec, type VoiceProviderView, type VoiceState, type VoiceTestResult,
} from '../../lib/voice';
import { SettingsField as Field } from './SettingsField';

type Feedback = { tone: 'success' | 'error'; text: string } | null;
const message = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;
const STATUS_LABEL: Record<VoiceTestResult['status'], string> = { available: 'Available', unavailable: 'Unavailable', configured: 'Configured', disabled: 'Disabled' };
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
    const input: VoiceConnectionInput = { accountName: accountName.trim(), config, secrets };
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
    <div className="ssh-form-actions">{onCancel && <Button variant="ghost" onClick={onCancel} disabled={actions.busy}>Cancel</Button>}<Button variant="primary" type="submit" disabled={actions.busy}>{connection ? 'Save changes' : 'Add connection'}</Button></div>
  </form>;
}

function AddVoiceConnection({ actions, first }: { actions: Actions; first: boolean }) {
  const providers = actions.state.providers;
  const [open, setOpen] = useState(first);
  const [providerId, setProviderId] = useState(providers[0]?.id ?? '');
  const provider = providers.find(p => p.id === providerId) ?? providers[0];
  if (!providers.length) return <p className="settings-note">No voice providers are registered.</p>;
  if (!open) return <Button className="ssh-add-toggle" onClick={() => setOpen(true)}><Plus size={14} strokeWidth={1.5} aria-hidden="true" />Add voice connection</Button>;
  return <section className="ssh-card" aria-label="Add voice connection">
    <h3>Add voice connection</h3>
    <SelectField name="provider" label="Provider" value={provider?.id ?? ''} onChange={setProviderId} options={providers.map(p => ({ value: p.id, label: p.label }))} hint={provider?.description} />
    {provider && <p className="settings-note" role="note">{destinationText(provider.destination)}{provider.models.some(m => m.description) ? ` ${provider.models.map(m => m.description).filter(Boolean).join(' ')}` : ''}</p>}
    {provider && <VoiceConnectionForm key={provider.id} provider={provider} actions={actions} onDone={() => { if (!first) setOpen(false); }} onCancel={first ? undefined : () => setOpen(false)} />}
  </section>;
}

function VoiceConnectionCard({ connection, actions }: { connection: VoiceConnectionView; actions: Actions }) {
  const provider = actions.state.providers.find(p => p.id === connection.provider);
  const [open, setOpen] = useState<'edit' | 'remove' | null>(null);
  const [result, setResult] = useState<VoiceTestResult | null>(null);
  const removeButton = useRef<HTMLButtonElement>(null);
  const toggle = (next: 'edit' | 'remove') => setOpen(current => current === next ? null : next);
  const routes = actions.state.routes.filter(r => r.connectionId === connection.id);
  const test = async () => { const r = await actions.run('Test', () => testVoiceConnection(actions.csrf, connection.id)); if (r) setResult(r); };
  return <article className="ssh-card" aria-label={`${provider?.label ?? connection.provider} · ${connection.accountName}`}>
    <header className="ssh-card-header"><div className="ssh-card-title">
      <h3 className="ssh-card-name"><AudioLines size={16} strokeWidth={1.5} aria-hidden="true" /><span>{connection.accountName}</span></h3>
      <p className="ssh-card-target">{provider ? provider.label : `${connection.provider} — provider is not loaded`}</p>
      {provider && <p className="settings-field-hint">{destinationText(connection.destination ?? provider.destination)}</p>}
      {routes.map(r => <p key={r.route} className="ssh-card-target"><code>{r.route}</code></p>)}
    </div></header>
    {result && <p className="settings-note" role="status">{STATUS_LABEL[result.status]} — {result.message}</p>}
    <div className="ssh-card-tabs" role="group" aria-label={`Actions for ${connection.accountName}`}>
      <button type="button" className="ssh-card-tab" aria-expanded={open === 'edit'} disabled={!provider} onClick={() => toggle('edit')}>Edit</button>
      <button type="button" className="ssh-card-tab" disabled={!provider || actions.busy} onClick={() => { void test(); }}>Test</button>
      <button ref={removeButton} type="button" className="ssh-card-tab is-danger" aria-expanded={open === 'remove'} onClick={() => toggle('remove')}>Remove</button>
    </div>
    {open === 'edit' && provider && <div className="ssh-card-section"><VoiceConnectionForm key={connection.updatedAt} provider={provider} connection={connection} actions={actions} onDone={() => setOpen(null)} onCancel={() => setOpen(null)} /></div>}
    {open === 'remove' && <div className="ssh-card-section settings-confirm" role="group" aria-label="Confirm removal" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(null); removeButton.current?.focus(); } }}>
      <p className="settings-note">Removes <b>{connection.accountName}</b> and its stored key from MauzCode. Chats that use its route will show it as unavailable until another route is chosen.</p>
      <div className="ssh-form-actions"><Button variant="ghost" autoFocus onClick={() => { setOpen(null); removeButton.current?.focus(); }}>Cancel</Button><Button className="button--danger" disabled={actions.busy} onClick={() => { void actions.run('Remove', () => removeVoiceConnection(actions.csrf, connection.id), () => `${connection.accountName} removed`).then(r => r && actions.reload()); }}>Remove connection</Button></div>
    </div>}
  </article>;
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
  return <section className="ssh-card" aria-label="Default voice route">
    <h3>Default route</h3>
    <SelectField name="defaultRoute" label="Voice model for chats" value={defaultRoute.route} onChange={change} options={options} disabled={actions.busy || defaultRoute.fixed || (!routes.length && !defaultRoute.route)} hint={hint} />
  </section>;
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
        <AddVoiceConnection actions={actions} first={state.connections.length === 0} />
        {state.connections.length > 0 && <div className="ssh-list">{state.connections.map(c => <VoiceConnectionCard key={c.id} connection={c} actions={actions} />)}</div>}
      </>}
  </div>;
}
