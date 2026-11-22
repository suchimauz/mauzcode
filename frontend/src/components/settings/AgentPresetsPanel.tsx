import { useCallback, useEffect, useId, useState } from 'react';
import { getAgentPresets, type AgentPresetsState, type AgentPresetView } from '../../lib/agentPresets';
import { Button } from '../ui/Button';
import { SettingsGroup, SettingsRow } from './SettingsGroup';

const formatTime = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

function RuleList({ label, items }: { label: string; items: string[] }) {
  const id = useId();
  return <div className="preset-rule">
    <h4 id={id}>{label}</h4>
    {items.length === 0
      ? <p className="preset-none">none</p>
      : <ul className="settings-chips" aria-labelledby={id}>{items.map((item, i) => <li key={`${i}:${item}`}><code>{item}</code>{item === '*' && <span className="preset-everything">everything</span>}</li>)}</ul>}
  </div>;
}

/** One preset row: name, id, badges and default marker; expanded details hold description, rule chips, prompt and metadata. */
function PresetRow({ preset, isDefault, expanded, onToggle }: { preset: AgentPresetView; isDefault: boolean; expanded: boolean; onToggle: () => void }) {
  return <SettingsRow as="section" aria-label={preset.name} className="preset-row" toggleLabel={preset.name}
    label={<><span>{preset.name}</span>
      <span className={`settings-badge ${preset.builtin ? 'is-success' : 'is-pending'}`}>{preset.builtin ? 'Built-in' : 'Custom'}</span>
      {isDefault && <span className="settings-badge is-accent">Default for new sessions</span>}</>}
    subtitle={<code className="preset-id">{preset.id}</code>}
    expanded={expanded} onToggle={onToggle}>
    {preset.description && <p className="preset-description">{preset.description}</p>}
    <div className="preset-rules">
      <RuleList label="Allow" items={preset.allow} />
      <RuleList label="Deny" items={preset.deny} />
      <RuleList label="Plugins" items={preset.plugins} />
      <RuleList label="Excluded prompt sections" items={preset.excludeSections} />
    </div>
    <div className="preset-rule">
      <h4>Prompt</h4>
      {preset.prompt ? <pre className="preset-prompt" tabIndex={0}>{preset.prompt}</pre> : <p className="preset-none">none</p>}
    </div>
    <p className="preset-meta">Sort order {preset.sortOrder} · {preset.builtin ? 'Managed by code' : `Updated ${formatTime(preset.updatedAt)}`}</p>
  </SettingsRow>;
}

/** Owner-only read-only view of code-managed and custom presets and the default selection. */
export function AgentPresetsPanel() {
  const [data, setData] = useState<AgentPresetsState | null>(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(''); setData(null);
    try { setData(await getAgentPresets(signal)); }
    catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'Could not load agent presets.'); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return <section className="settings-panel" aria-label="Agent presets">
    <header className="settings-panel-header">
      <h2>Agent presets</h2>
      <p className="settings-note">Read-only. Built-ins are managed by code; custom presets are stored in the database. Preset changes apply only to new agents; existing agents keep their snapshot. Presets are a guardrail, not a sandbox.</p>
    </header>
    {error
      ? <div className="settings-feedback is-error" role="alert">{error} <Button variant="ghost" onClick={() => { void load(); }}>Retry</Button></div>
      : !data ? <p className="settings-loading" role="status">Loading agent presets…</p>
      : <>
        {data.defaultPresetMissing && <p className="settings-feedback is-error" role="alert">The default preset <code>{data.defaultPresetId}</code> does not exist. New sessions without an explicit preset cannot be created.</p>}
        {data.presets.length === 0
          ? <p className="settings-note" role="status">No agent presets are available.</p>
          : <SettingsGroup title="Presets" className="preset-list">{data.presets.map(p => <PresetRow key={p.id} preset={p} isDefault={!data.defaultPresetMissing && p.id === data.defaultPresetId} expanded={expanded === p.id} onToggle={() => setExpanded(current => current === p.id ? null : p.id)} />)}</SettingsGroup>}
      </>}
  </section>;
}
