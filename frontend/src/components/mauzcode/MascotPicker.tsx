import { Menu } from '@base-ui/react/menu';
import { Check, PawPrint, Shuffle } from 'lucide-react';
import { CrabMascot } from './CrabMascot';
import { mascotNames, normalizeMascotChoice, type MascotChoice } from '../../lib/mascots';
/** New-session pet picker: the mascot preview itself is the menu trigger, replacing its poke control. */
export function MascotPicker({ value, disabled, onChange }: { value?: MascotChoice; disabled: boolean; onChange: (value: MascotChoice) => void }) {
  const choice = normalizeMascotChoice(value);
  const label = `Выбрать питомца: ${choice === 'random' ? 'Случайный' : mascotNames[choice]}`;
  const page = choice === 'random' ? null : { mascot: choice, agentId: 'new-session-preview', events: [], olderBefore: null, hasOlder: false, isRunning: false, runState: 'idle' as const, lastError: null, partial: null };
  return <Menu.Root>
    <CrabMascot page={page} control={hit => <Menu.Trigger className={`${hit} mascot-picker-trigger`} disabled={disabled} aria-label={label} title={label}>{choice === 'random' && <Shuffle className="mascot-picker-badge" size={12} strokeWidth={1.5} aria-hidden="true" />}</Menu.Trigger>} />
    <Menu.Portal><Menu.Positioner side="top" align="end" sideOffset={8} collisionPadding={12} className="floating-positioner"><Menu.Popup className="workspace-view-menu" aria-label="Питомец нового чата"><Menu.RadioGroup value={choice} onValueChange={value => onChange(normalizeMascotChoice(value))}>
      <Menu.RadioItem value="random" closeOnClick className="workspace-menu-item"><Shuffle size={14} strokeWidth={1} /><span>Случайный</span><Menu.RadioItemIndicator><Check size={14} /></Menu.RadioItemIndicator></Menu.RadioItem>
      {Object.entries(mascotNames).map(([id, name]) => <Menu.RadioItem key={id} value={id} closeOnClick className="workspace-menu-item"><PawPrint size={14} strokeWidth={1} /><span>{name}</span><Menu.RadioItemIndicator><Check size={14} /></Menu.RadioItemIndicator></Menu.RadioItem>)}
    </Menu.RadioGroup></Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}
