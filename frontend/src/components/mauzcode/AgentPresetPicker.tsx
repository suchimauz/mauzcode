import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Check, Network } from 'lucide-react';
import type { AgentPresetOption } from '../../lib/newSession';
import './preset-dialog.css';
/** New-session agent preset chip: shows the selected preset and opens the preset dialog. */
export function AgentPresetPicker({ presets, value, disabled, onOpen, chipRef }: { presets: readonly AgentPresetOption[]; value?: string; disabled: boolean; onOpen: () => void; chipRef?: RefObject<HTMLButtonElement | null> }) {
  const label = presets.find(preset => preset.id === value)?.name ?? 'Режим';
  return <button ref={chipRef} type="button" className="new-session-chip agent-preset-picker" disabled={disabled || !presets.length} aria-haspopup="dialog" aria-label={`Режим агента: ${label}`} onClick={onOpen}><Network size={16} strokeWidth={1} aria-hidden="true" /><span>{label}</span></button>;
}
/** Phone layout (bottom sheet): no search autofocus, so the on-screen keyboard does not cover the list. */
const isSheet = () => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 560px)').matches;
const matches = (preset: AgentPresetOption, query: string) => !query || `${preset.name} ${preset.description}`.toLowerCase().includes(query);
/**
 * Modal "Режим агента" dialog: presets in the given (server sort) order with a search field.
 * The selection is local until confirmed; Esc or an outside click closes it without calling onConfirm,
 * so the selection that was active when it opened stays in place.
 */
export function AgentPresetDialog({ open, presets, value, defaultId, onConfirm, onClose, finalFocus }: { open: boolean; presets: readonly AgentPresetOption[]; value?: string; defaultId?: string; onConfirm: (presetId: string) => void; onClose: () => void; finalFocus?: () => HTMLElement | boolean | null }) {
  const base = useId();
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(value);
  // Every opening starts from the current choice and an empty search.
  useEffect(() => { if (open) { setQuery(''); setSelected(value); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const needle = query.trim().toLowerCase();
  const visible = presets.filter(preset => matches(preset, needle));
  const index = visible.findIndex(preset => preset.id === selected);
  const optionId = (id: string) => `${base}-option-${presets.findIndex(preset => preset.id === id)}`;
  useEffect(() => { if (open && selected && index >= 0) document.getElementById(optionId(selected))?.scrollIntoView?.({ block: 'nearest' }); }, [open, selected, index]); // eslint-disable-line react-hooks/exhaustive-deps
  const confirm = () => { if (selected && index >= 0) onConfirm(selected); };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!visible.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = index < 0 ? (step > 0 ? 0 : visible.length - 1) : (index + step + visible.length) % visible.length;
      setSelected(visible[next].id);
    } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); confirm(); }
  };
  return <Dialog.Root open={open} onOpenChange={next => { if (!next) onClose(); }}><Dialog.Portal><Dialog.Backdrop className="preset-dialog-backdrop" /><Dialog.Popup ref={popup} className="preset-dialog" aria-describedby={undefined} initialFocus={() => isSheet() ? popup.current : search.current} finalFocus={finalFocus}>
    <header className="preset-dialog-header"><Dialog.Title>Режим агента</Dialog.Title>
      <input ref={search} className="preset-dialog-search" type="search" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls={`${base}-list`} aria-activedescendant={selected && index >= 0 ? optionId(selected) : undefined} aria-label="Поиск режима" placeholder="Поиск режима" autoComplete="off" spellCheck={false} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={onKeyDown} />
    </header>
    <div ref={list} className="preset-dialog-list" id={`${base}-list`} role="listbox" aria-label="Режимы агента">
      {visible.map(preset => <div key={preset.id} id={optionId(preset.id)} role="option" aria-selected={preset.id === selected} aria-describedby={preset.description ? `${optionId(preset.id)}-description` : undefined} className={`preset-row${preset.id === selected ? ' is-selected' : ''}`} onMouseDown={event => event.preventDefault()} onClick={() => { setSelected(preset.id); if (!isSheet()) search.current?.focus(); }} onDoubleClick={() => onConfirm(preset.id)}>
        <Network size={16} strokeWidth={1} aria-hidden="true" />
        <span className="preset-row-text"><span className="preset-row-name"><span>{preset.name}</span>{preset.id === defaultId && <span className="preset-row-badge">по умолчанию</span>}</span>{preset.description && <span className="preset-row-description" id={`${optionId(preset.id)}-description`}>{preset.description}</span>}</span>
        <span className="preset-row-check" aria-hidden="true"><Check size={14} strokeWidth={2} /></span>
      </div>)}
      {!visible.length && <p className="preset-dialog-empty" role="status">Ничего не найдено</p>}
    </div>
    <footer className="preset-dialog-footer"><span className="preset-dialog-hint" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> выбрать · <kbd>Enter</kbd> подтвердить · <kbd>Esc</kbd> отмена</span><button type="button" className="preset-dialog-continue" disabled={index < 0} onClick={confirm}>Продолжить</button></footer>
  </Dialog.Popup></Dialog.Portal></Dialog.Root>;
}
