import { useCallback, useEffect, useRef, useState } from 'react';

function selectedFromUrl() {
  const { searchParams } = new URL(location.href);
  return searchParams.get('newSession') === '1' ? '' : searchParams.get('agent') || '';
}

function standalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Sidebar selections add history entries; Back/Forward restore the selection without adding another. */
export function useChatSelection() {
  const [selected, setSelected] = useState(selectedFromUrl);
  const current = useRef(selected);
  const apply = useCallback((id: string) => { current.current = id; setSelected(id); }, []);
  const select = useCallback((id: string) => {
    if (id === current.current) return;
    const url = new URL(location.href);
    if (id) { url.searchParams.delete('newSession'); url.searchParams.set('agent', id); url.searchParams.delete('new'); }
    else { url.searchParams.delete('agent'); url.searchParams.set('new', '1'); }
    // A Home Screen app has no Back button, only the edge swipe that collides with Canvas/menu gestures.
    if (standalone()) history.replaceState(null, '', url); else history.pushState(null, '', url);
    apply(id);
  }, [apply]);
  useEffect(() => {
    // The composer's capture-phase popstate listener mutes the old microphone before this switches the view.
    const restore = () => apply(selectedFromUrl());
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [apply]);
  return { selected, current, select };
}
