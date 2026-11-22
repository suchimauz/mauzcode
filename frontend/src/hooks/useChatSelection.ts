import { useCallback, useEffect, useRef, useState } from 'react';

function selectedFromUrl() {
  const { searchParams } = new URL(location.href);
  return searchParams.get('newSession') === '1' ? '' : searchParams.get('agent') || '';
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
    history.pushState(null, '', url);
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
