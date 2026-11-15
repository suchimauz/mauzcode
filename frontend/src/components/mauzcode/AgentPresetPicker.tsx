import { useId } from 'react';
import { Menu } from '@base-ui/react/menu';
import { Check, Network } from 'lucide-react';
import type { AgentPresetOption } from '../../lib/newSession';
/** New-session agent preset chip: radio menu in server sort order, descriptions as secondary text. */
export function AgentPresetPicker({ presets, value, disabled, onChange }: { presets: readonly AgentPresetOption[]; value?: string; disabled: boolean; onChange: (presetId: string) => void }) {
  const base = useId();
  const selected = presets.find(preset => preset.id === value);
  const label = selected?.name ?? 'Режим';
  return <Menu.Root><Menu.Trigger className="new-session-chip agent-preset-picker" disabled={disabled || !presets.length} aria-label={`Режим агента: ${label}`}><Network size={16} strokeWidth={1} aria-hidden="true" /><span>{label}</span></Menu.Trigger>
    <Menu.Portal><Menu.Positioner side="top" align="start" sideOffset={8} collisionPadding={12} className="floating-positioner"><Menu.Popup className="workspace-view-menu agent-preset-menu" aria-label="Режим агента"><Menu.RadioGroup value={selected?.id ?? ''} onValueChange={id => { if (typeof id === 'string' && presets.some(preset => preset.id === id)) onChange(id); }}>
      {presets.map(preset => <Menu.RadioItem key={preset.id} value={preset.id} closeOnClick className="workspace-menu-item agent-preset-item" aria-label={preset.name} aria-describedby={preset.description ? `${base}-${preset.id}` : undefined}>
        <Network size={14} strokeWidth={1} aria-hidden="true" />
        <span className="agent-preset-text"><span className="agent-preset-name">{preset.name}</span>{preset.description && <span className="agent-preset-description" id={`${base}-${preset.id}`}>{preset.description}</span>}</span>
        <Menu.RadioItemIndicator><Check size={14} aria-hidden="true" /></Menu.RadioItemIndicator>
      </Menu.RadioItem>)}
    </Menu.RadioGroup></Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}
