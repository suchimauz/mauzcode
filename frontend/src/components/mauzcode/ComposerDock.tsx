import type { HTMLAttributes, ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import './composer-dock.css';

type DockProps = Omit<HTMLAttributes<HTMLElement>, 'aria-label'> & {
  /** Accessible name of the dock region. */
  label: string;
  /** Disclosure expansion (by the person or forced); drives stacking. Always-open bodies leave it unset. */
  expanded?: boolean;
  children: ReactNode;
};
/** Card shell of a panel stacked above the composer; stacking follows `data-expanded`, never nested `aria-expanded`. */
export function Dock({ label, expanded, className = '', children, ...props }: DockProps) {
  return <section {...props} className={`dock ${className}`.trim()} aria-label={label} data-expanded={expanded ? 'true' : undefined}>{children}</section>;
}

type DockHeaderProps = {
  /** Leading 16px icon; decorative. */
  icon: ReactNode;
  /** Summary that fills the row and truncates with an ellipsis. */
  children: ReactNode;
  /** Trailing meta inside the header (counters, badges, status text without live regions). */
  meta?: ReactNode;
  /** Trailing actions and live status indicators, rendered as siblings of the disclosure button. */
  actions?: ReactNode;
  /** Disclosure state; omit together with `onToggle` for the static, always-open variant. */
  expanded?: boolean;
  onToggle?: () => void;
  /** Id of the body controlled by the disclosure. */
  controls?: string;
  /** Forced expansion: the disclosure stays expanded and cannot be activated. */
  disabled?: boolean;
  /** Explicit accessible name of the disclosure button; defaults to its content. */
  label?: string;
  /** Id of a sibling status indicator describing the disclosure. */
  describedBy?: string;
};
/** Header row: disclosure button (icon, chevron, summary, meta) plus a sibling actions slot. */
export function DockHeader({ icon, children, meta, actions, expanded, onToggle, controls, disabled, label, describedBy }: DockHeaderProps) {
  const content = <>
    <span className="dock-lead" aria-hidden="true">{icon}</span>
    {/* A static header keeps the chevron slot empty, so titles stay aligned across docks. */}
    {onToggle ? (expanded ? <ChevronDown size={14} className="dock-chevron" aria-hidden="true" /> : <ChevronRight size={14} className="dock-chevron" aria-hidden="true" />) : <span className="dock-chevron dock-chevron--empty" aria-hidden="true" />}
    <span className="dock-summary">{children}</span>
    {meta != null && meta !== false && <span className="dock-meta">{meta}</span>}
  </>;
  return <div className="dock-header">
    {onToggle
      ? <button type="button" className="dock-toggle" aria-expanded={!!expanded} aria-controls={controls} aria-label={label} aria-describedby={describedBy} disabled={disabled} onClick={onToggle}>{content}</button>
      : <div className="dock-toggle dock-toggle--static">{content}</div>}
    {actions && <div className="dock-actions">{actions}</div>}
  </div>;
}

/** Shared pill badge for header meta (todo pause mark, trigger kind counts). */
export function DockBadge({ className = '', ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={`dock-badge ${className}`.trim()} />;
}

type DockNoticeProps = {
  /** `error` is announced as an alert, `info` as a status message. */
  tone: 'error' | 'info';
  children: ReactNode;
  /** Optional inline text-button action such as refresh or dismiss. */
  action?: { label: string; onClick: () => void; disabled?: boolean };
};
/** Notice line at the bottom of a dock. */
export function DockNotice({ tone, children, action }: DockNoticeProps) {
  return <p className="dock-notice" role={tone === 'error' ? 'alert' : 'status'}>
    {children}
    {action && <button type="button" className="dock-notice-action" disabled={action.disabled} onClick={action.onClick}>{action.label}</button>}
  </p>;
}
