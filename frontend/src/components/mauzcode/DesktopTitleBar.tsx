import { useLayoutEffect, type MouseEvent } from 'react';
import { Ellipsis } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { BrandMark } from './BrandMark';
import type { DesktopWindowBridge } from '../../lib/live';

/** The desktop window bridge when this page runs inside the MauzCode desktop client, otherwise null. */
export const desktopWindow = (): DesktopWindowBridge | null => typeof window !== 'undefined' && window.mauzcodeDesktopWindow?.version === 1 ? window.mauzcodeDesktopWindow : null;

/**
 * Integrated title strip of the desktop client: a draggable bar in product colours that leaves room
 * for the native window controls and opens the shell menu (settings, retry, reload, zoom, quit) from ⋯.
 * Renders nothing in an ordinary browser. While mounted, <html> gets `mauzcode-desktop-frame` so the
 * shell's fallback strip for older pages is switched off and the app height excludes the strip.
 */
export function DesktopTitleBar({ title }: { title: string }) {
  const bridge = desktopWindow();
  useLayoutEffect(() => {
    if (!bridge) return;
    const root = document.documentElement;
    root.classList.add('mauzcode-desktop-frame');
    root.style.setProperty('--desktop-titlebar-height', `${bridge.titleBar.height}px`);
    return () => { root.classList.remove('mauzcode-desktop-frame'); root.style.removeProperty('--desktop-titlebar-height'); };
  }, [bridge]);
  useLayoutEffect(() => { if (bridge) document.title = title ? `${title} — MauzCode` : 'MauzCode'; }, [bridge, title]);
  if (!bridge) return null;
  // Anchor the native menu under the button (keyboard activation has no pointer position).
  const openMenu = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    bridge.openMenu(Math.max(0, Math.round(rect.left)), Math.max(0, Math.round(rect.bottom || bridge.titleBar.height)));
  };
  return <header className={`desktop-titlebar desktop-titlebar--controls-${bridge.titleBar.controls} desktop-titlebar--${bridge.platform}`} aria-label="Заголовок окна">
    <span className="desktop-titlebar-brand" aria-hidden="true"><BrandMark /></span>
    <span className="desktop-titlebar-title">{title || 'MauzCode'}</span>
    <IconButton className="desktop-titlebar-menu button--compact" label="Меню приложения" onClick={openMenu}><Ellipsis size={16} aria-hidden="true" /></IconButton>
  </header>;
}
