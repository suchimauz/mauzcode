import { useId, useState, type ReactElement, type ReactNode, type RefObject } from 'react';
import { Popover } from '@base-ui/react/popover';
import './floating.css';
type HoverPanelProps = {
  /** One trigger, or several that share this panel; each reports its own expanded state. */
  trigger: ReactElement | ReactElement[];
  children: ReactNode; label: string; className?: string; open?: boolean; onOpenChange?: (open: boolean) => void; id?: string;
  /** Element to position the panel against instead of the active trigger, so every trigger opens it in one place. */
  anchor?: RefObject<Element | null>;
};
/** Detailed hover card: also opens by click/keyboard, stays open while exploring its content. */
export function HoverPanel({ trigger, children, label, className = '', open, onOpenChange, id, anchor }: HoverPanelProps) {
  const base = useId();
  const triggers = Array.isArray(trigger) ? trigger : [trigger];
  // A controlled popover with several triggers needs to know which one opened it (for its aria-expanded).
  const [activeTrigger, setActiveTrigger] = useState<string | null>(null);
  const shared = triggers.length > 1;
  return <Popover.Root open={open} triggerId={shared ? activeTrigger : undefined} onOpenChange={(next, details) => {
    if (shared && next) setActiveTrigger(details.trigger?.id ?? null);
    onOpenChange?.(next);
  }}>{triggers.map((element, index) => <Popover.Trigger key={index} id={shared ? `${base}-trigger-${index}` : undefined} render={element} openOnHover delay={200} closeDelay={150} />)}
    <Popover.Portal><Popover.Positioner anchor={anchor} side="top" align="end" sideOffset={8} collisionPadding={12} className="floating-positioner">
      <Popover.Popup id={id} className={`ui-hover-panel ${className}`} aria-label={label}>{children}</Popover.Popup>
    </Popover.Positioner></Popover.Portal>
  </Popover.Root>;
}
