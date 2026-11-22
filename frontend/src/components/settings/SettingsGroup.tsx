import { useId, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * Inset grouped list (macOS System Settings style): optional uppercase title above, one rounded surface with
 * hairline-separated rows, optional footnote below. Children are `SettingsRow`s or any custom row markup.
 */
export function SettingsGroup({ title, footnote, children, className = '', label, list, ...rest }: { title?: ReactNode; footnote?: ReactNode; children: ReactNode; className?: string; label?: string; /** Render the surface as a list (`ul`) of `li` rows. */ list?: boolean } & Omit<HTMLAttributes<HTMLElement>, 'title'>) {
  const titleId = useId();
  const Surface = list ? 'ul' : 'div';
  return <section {...rest} className={`settings-group ${className}`} aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : label}>
    {title && <h3 id={titleId} className="settings-group-title">{title}</h3>}
    <Surface className="settings-group-surface">{children}</Surface>
    {footnote && <div className="settings-group-footnote">{footnote}</div>}
  </section>;
}

/**
 * One grouped-list row: leading label/subtitle, trailing slot. With `onToggle` the leading content and a chevron
 * become a single disclosure button (`aria-expanded`/`aria-controls`) named by the label and described by the subtitle; `trailing` stays a sibling of that button,
 * so switches and buttons there never toggle the row. `children` are the details, rendered only while expanded.
 */
export function SettingsRow({ label, subtitle, leading, trailing, expanded, onToggle, children, className = '', toggleLabel, as: Tag = 'div', ...rest }: {
  label: ReactNode; subtitle?: ReactNode; leading?: ReactNode; trailing?: ReactNode;
  expanded?: boolean; onToggle?: () => void; children?: ReactNode; className?: string;
  /** Accessible name of the disclosure button when the visible label is not plain text. */
  toggleLabel?: string;
  as?: 'div' | 'li' | 'article' | 'section';
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>) {
  const detailsId = useId();
  const labelId = `${detailsId}-label`;
  const subtitleId = `${detailsId}-subtitle`;
  const body = <>
    {leading && <span className="settings-row-leading" aria-hidden="true">{leading}</span>}
    <span className="settings-row-text"><span id={labelId} className="settings-row-label">{label}</span>{subtitle && <span id={subtitleId} className="settings-row-subtitle">{subtitle}</span>}</span>
  </>;
  const open = !!onToggle && !!expanded;
  return <Tag {...rest} className={`settings-row ${onToggle ? 'is-expandable' : ''} ${open ? 'is-expanded' : ''} ${className}`}>
    <div className="settings-row-main">
      {onToggle
        ? <button type="button" className="settings-row-toggle" aria-expanded={open} aria-controls={detailsId} aria-label={toggleLabel} aria-labelledby={toggleLabel ? undefined : labelId} aria-describedby={subtitle ? subtitleId : undefined} onClick={onToggle}>{body}<ChevronRight className="settings-row-chevron" size={14} strokeWidth={2} aria-hidden="true" /></button>
        : <div className="settings-row-static">{body}</div>}
      {trailing && <div className="settings-row-trailing">{trailing}</div>}
    </div>
    {onToggle ? <div id={detailsId} className="settings-row-details" hidden={!open}>{open && children}</div> : children && <div className="settings-row-details">{children}</div>}
  </Tag>;
}

/** Native checkbox styled as a switch; keeps `role="switch"` and label semantics of the existing toggles. */
export function SettingsSwitch({ label, className = '', ...input }: { label: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'>) {
  return <input type="checkbox" role="switch" aria-label={label} className={`settings-switch ${className}`} {...input} />;
}
