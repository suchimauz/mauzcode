import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Check, ChevronDown, ChevronRight, Cpu } from 'lucide-react';
import { NavigationChatIcon } from './NavigationChatIcon';
import { connectionGroupLabel, effortAfterSwitch, effortLabel, modelGroup, modelGroupKey, modelSourceLabel, selectableModels, unavailableGroups, getDraftModelSettings, getModelSettings, setAgentEffort, setAgentModel, type ModelSettings } from '../../lib/models';
import { rememberSessionSelection } from '../../lib/newSession';
import { useChatControls, type Speed, type Verbosity } from './useChatControls';
import './model-picker.css';

const choiceLabel = (value: string) => value[0]!.toUpperCase() + value.slice(1);

type Page = 'main' | 'models' | 'effort' | 'speed' | 'verbosity';
export type ModelPickerDraft = { model: string; effort: string; onChange: (model: string, effort: string) => void };
export function ModelPicker({ agentId = '', running = false, busy = false, revision = 0, onSaved, onBusyChange, onReadyChange, draft }: { agentId?: string; running?: boolean; busy?: boolean; revision?: number; onSaved?: () => void; onBusyChange?: (busy: boolean) => void; onReadyChange?: (ready: boolean) => void; draft?: ModelPickerDraft }) {
  const [settings, setData] = useState<ModelSettings | null>(null);
  const isDraft = !!draft;
  const draftModel = draft?.model ?? '';
  const draftEffort = draft?.effort ?? 'auto';
  const selected = settings?.models.find(option => option.model === draftModel);
  // Keep the controlled selection visible while read-only capability metadata refreshes.
  const data = settings && draft ? { ...settings, model: draftModel || settings.model, label: selected?.label ?? (draftModel || settings.label), icon: selected?.icon ?? settings.icon,
    effort: { ...settings.effort, requested: draftEffort } } : settings;
  // Selection policy: disabled models and models of disabled connections are never offered, so they are removed
  // before searching and grouping. Those entries stay visible in Models settings, where they can be re-enabled.
  const choices = data ? selectableModels(data) : [];
  const notices = data ? unavailableGroups(data) : [];
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<Page>('main');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const popup = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const [retry, setRetry] = useState(0);
  const draftChange = useRef(draft?.onChange); draftChange.current = draft?.onChange;
  const readyChange = useRef(onReadyChange); readyChange.current = onReadyChange;
  useEffect(() => {
    readyChange.current?.(!loading && !error && !!settings && (!isDraft || (settings.model === draftModel && settings.effort.requested === draftEffort)));
  }, [loading, error, settings, isDraft, draftModel, draftEffort]);
  useEffect(() => {
    const controller = new AbortController(); const current = ++generation.current;
    setLoading(true);
    void (isDraft ? getDraftModelSettings(draftModel, draftEffort, controller.signal) : getModelSettings(agentId, controller.signal)).then(value => {
      if (!controller.signal.aborted && generation.current === current) {
        setData(value); setError('');
        if (isDraft && (draftModel !== value.model || draftEffort !== value.effort.requested)) draftChange.current?.(value.model, value.effort.requested);
      }
    }).catch(err => { if (!controller.signal.aborted && generation.current === current) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!controller.signal.aborted && generation.current === current) setLoading(false); });
    return () => { controller.abort(); generation.current++; };
  }, [agentId, running, revision, retry, isDraft, draftModel, draftEffort]);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => (popup.current?.querySelector<HTMLElement>(page === 'models' ? 'input' : '[role^="menuitem"]') ?? popup.current?.querySelector<HTMLElement>('[role^="menuitem"]'))?.focus());
    return () => cancelAnimationFrame(frame);
  }, [page, open, loading]);
  const changeOpen = (value: boolean) => { setOpen(value); if (value) { setPage('main'); setQuery(''); setRetry(n => n + 1); } };
  const choose = async (kind: 'model' | 'effort', value: string) => {
    if (lock.current || busy || running || loading) return;
    if (kind === 'effort' && !data?.effort.supported.includes(value)) return;
    if (kind === 'model' && !choices.some(option => option.model === value)) return;
    if ((kind === 'model' ? data?.model : data?.effort.requested) === value) { setOpen(false); return; }
    if (draft) {
      // A different model starts at Default; an account-only switch keeps a level the target lists (normalized on fetch).
      const effort = kind === 'effort' ? value : effortAfterSwitch(draft.model || data?.model || '', value, draft.effort);
      draft.onChange(kind === 'model' ? value : (draft.model || data?.model || ''), effort);
      if (kind === 'model') rememberSessionSelection({ model: value });
      setError(''); setOpen(false);
      return;
    }
    if (!agentId) return;
    lock.current = true; setLoading(false); setSaving(true); onBusyChange?.(true); setError('');
    const current = ++generation.current;
    try {
      if (kind === 'model') { await setAgentModel(agentId, value); rememberSessionSelection({ model: value }); } else await setAgentEffort(agentId, value);
      if (generation.current !== current) return;
      // Read back the committed pair: the server resets effort with a model change, so no second mutation is sent.
      const updated = await getModelSettings(agentId);
      if (generation.current === current) { setData(updated); setOpen(false); onSaved?.(); }
    } catch (err) { if (generation.current === current) setError(err instanceof Error ? err.message : String(err)); }
    finally { lock.current = false; setSaving(false); onBusyChange?.(false); }
  };
  const route = typeof data?.model === 'string' ? data.model : '';
  const chat = useChatControls(!draft && route ? agentId : '', route, open, revision + retry);
  const controls = !draft && route.startsWith('codex/') && choices.some(m => m.model === route) ? chat.view : null;
  const speeds = controls?.speeds?.filter(speed => speed === 'fast' || speed === 'ultrafast') ?? [];
  const verbosities = controls?.verbosities ?? [];
  const saveResponse = async (kind: 'speed' | 'verbosity', value: string) => {
    if (lock.current || !controls || loading || busy || running) return;
    if ((kind === 'speed' ? controls.speed : controls.verbosity ?? 'default') === value) { setOpen(false); return; }
    lock.current = true; setSaving(true); onBusyChange?.(true); setError('');
    try {
      await chat.save(kind === 'speed' ? value as Speed : controls.speed, kind === 'verbosity' ? value === 'default' ? null : value as Verbosity : controls.verbosity);
      setOpen(false); onSaved?.();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save response settings'); setPage('main'); }
    finally { lock.current = false; setSaving(false); onBusyChange?.(false); }
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
    if (event.target instanceof HTMLInputElement && ['Home','End'].includes(event.key)) return;
    const items = [...(popup.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? [])];
    if (!items.length) return;
    event.preventDefault(); const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
    items[next].focus();
  };
  const groups = new Map<string, { label: string; options: ModelSettings['models'] }>();
  for (const option of choices) {
    if (!`${option.label} ${option.provider} ${option.model} ${modelGroup(option)}`.toLowerCase().includes(query.trim().toLowerCase())) continue;
    const key = modelGroupKey(option); const group = groups.get(key) ?? { label: modelGroup(option), options: [] }; group.options.push(option); groups.set(key, group);
  }
  const effort = data?.effort;
  const hasEffort = !!effort && effort.mode !== 'none' && effort.supported.length > 0;
  const label = data?.label || data?.model || 'Model';
  // Provider caption of the selected route: the route itself carries host, provider and account, so a disabled or
  // uncatalogued current model still shows its provider without changing the stored route.
  const source = data?.model ? modelSourceLabel(data.model) : '';
  return <>{chat.notice && <p ref={chat.display} className="model-picker-note" role="status">{chat.notice.message}{chat.canDismiss && <button type="button" onClick={chat.dismiss}>Dismiss</button>}</p>}<Popover.Root open={open} onOpenChange={(value, details) => {
    if (!value && details.reason === 'escape-key' && page !== 'main') { details.cancel(); setPage('main'); setQuery(''); return; }
    changeOpen(value);
  }}>
    <Popover.Trigger render={<button type="button" className="model-picker-trigger" title={data?.model || 'Выбрать модель'} aria-label={`Выбрать модель: ${label}${source ? `, ${source}` : ''}`} disabled={saving || busy} />}>
      {data?.icon ? <NavigationChatIcon icon={data.icon} /> : <Cpu size={14} strokeWidth={1} />}
      <span className="model-picker-body"><span className="model-picker-row"><span className="model-picker-label">{label}</span>{hasEffort && <span className="model-picker-effort">{effortLabel(effort.requested === 'auto' ? 'auto' : effort.applied)}</span>}</span>{source && <span className="model-picker-tech" aria-hidden="true">{source}</span>}</span><ChevronDown size={14} strokeWidth={1} className="model-picker-chevron" />
    </Popover.Trigger>
    <Popover.Portal><Popover.Positioner side="top" align="end" sideOffset={8} collisionPadding={12} className="floating-positioner">
      <Popover.Popup ref={popup} className="model-picker-menu" aria-label="Model and effort" aria-busy={saving || loading} onKeyDown={keyboard}>
        {loading && !data ? <p className="model-picker-note" role="status">Загрузка моделей…</p> : <>
          {page === 'main' && <div role="menu" aria-label="Настройки модели">
            <button type="button" role="menuitem" className="model-picker-cell" disabled={!data || saving} onClick={() => setPage('models')}><span>Model</span><span className="model-picker-cell-value">{label}</span><ChevronRight size={14} strokeWidth={1} /></button>
            {hasEffort && <button type="button" role="menuitem" className="model-picker-cell" disabled={saving} onClick={() => setPage('effort')}><span>Effort</span><span className="model-picker-cell-value">{effortLabel(effort.requested)}</span><ChevronRight size={14} strokeWidth={1} /></button>}
            {speeds.length > 0 && <button type="button" role="menuitem" className="model-picker-cell" disabled={saving} onClick={() => setPage('speed')}><span>Speed</span><span className="model-picker-cell-value">{choiceLabel(controls!.speed)}</span><ChevronRight size={14} /></button>}
            {verbosities.length > 0 && <button type="button" role="menuitem" className="model-picker-cell" disabled={saving} onClick={() => setPage('verbosity')}><span>Response verbosity</span><span className="model-picker-cell-value">{choiceLabel(controls!.verbosity ?? 'default')}</span><ChevronRight size={14} /></button>}
          </div>}
          {(page === 'speed' || page === 'verbosity') && controls && <><div role="menu" aria-label={page === 'speed' ? 'Speed' : 'Response verbosity'}>{(page === 'speed' ? ['standard', ...speeds] : ['default', ...verbosities]).map(value => <button type="button" role="menuitemradio" key={value} aria-checked={value === (page === 'speed' ? controls.speed : controls.verbosity ?? 'default')} aria-description={page === 'speed' && value !== 'standard' ? 'Accelerated speeds may use additional quota.' : undefined} className="model-picker-option" disabled={loading || saving || running || busy} onClick={() => void saveResponse(page, value)}>{choiceLabel(value)}<span className="model-picker-check">{value === (page === 'speed' ? controls.speed : controls.verbosity ?? 'default') && <Check size={16} strokeWidth={1} />}</span></button>)}</div>{page === 'speed' && <p className="model-picker-note">Accelerated speeds may use additional quota.</p>}</>}
          {page === 'models' && <>{choices.length > 4 && <input className="model-picker-search" aria-label="Search models" placeholder="Search models" value={query} onChange={event => setQuery(event.target.value)} />}
            <div role="menu" aria-label="Model" className="model-picker-scroll">{[...groups].map(([key, { label: groupName, options }]) => <section role="group" aria-label={groupName} key={key}>
              <div className="model-picker-group">{groupName}</div>{options.map(option => <button type="button" key={option.model} role="menuitemradio" aria-checked={option.model === data?.model} className="model-picker-option" aria-label={option.label} aria-description={modelSourceLabel(option.model) || undefined} title={option.model} disabled={saving || running || busy} onClick={() => void choose('model', option.model)}>
                <NavigationChatIcon icon={option.icon} /><span className="model-picker-option-text"><span>{option.label}</span>{modelSourceLabel(option.model) && <span className="model-picker-option-source" aria-hidden="true">{modelSourceLabel(option.model)}</span>}</span><span className="model-picker-check">{option.model === data?.model && <Check size={16} strokeWidth={1} />}</span>
              </button>)}
            </section>)}{notices.map(group => { const heading = connectionGroupLabel(group.provider, group.accountName); return <section role="group" aria-label={heading} key={group.connectionId}><div className="model-picker-group">{heading}</div><p className="model-picker-note" title={group.error}>Недоступно: список моделей не загрузился{group.error ? ` (${group.error})` : ''}</p></section>; })}{!groups.size && !notices.length && <p className="model-picker-note">Модели не найдены</p>}</div></>}
          {page === 'effort' && <div role="menu" aria-label="Effort">{[...new Set(['auto', ...(effort?.supported ?? [])])].map(value => <button type="button" role="menuitemradio" key={value} aria-checked={value === effort?.requested} className="model-picker-option" disabled={saving || running || busy} onClick={() => void choose('effort', value)}><span>{effortLabel(value)}</span><span className="model-picker-check">{value === effort?.requested && <Check size={16} strokeWidth={1} />}</span></button>)}</div>}
        </>}
        {page === 'models' && !choices.length && !loading && <a href="/?settings=models" className="model-picker-note">Open Models settings to update the catalogue</a>}
        {chat.error && !draft && data?.model.startsWith('codex/') && <p role="alert" className="model-picker-error">{chat.error}</p>}
        {running && <p className="model-picker-note">Смена доступна после завершения ответа.</p>}
        {saving && <p className="model-picker-note" role="status">Сохранение…</p>}
        {error && <div className="model-picker-error" role="alert">{error}<button type="button" disabled={saving} onClick={() => setRetry(n => n + 1)}>Повторить загрузку</button></div>}
      </Popover.Popup>
    </Popover.Positioner></Popover.Portal>
  </Popover.Root></>;
}
