import { useEffect, useId, useState } from 'react';
import { ApiError } from '../../lib/mauzcode';
import { getVoiceError, isVoiceErrorId, listVoiceErrors, type VoiceErrorRecord } from '../../lib/voice';
import { Button } from '../ui/Button';
import { SettingsField } from './SettingsField';

type Result = { records: VoiceErrorRecord[] } | { message: string };

function Journal() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState({ id: '' });
  const [result, setResult] = useState<Result | null>(null);
  const search = (id: string) => { setResult(null); setQuery({ id }); };
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const { id } = query;
    async function load() {
      try {
        const records = !id ? await listVoiceErrors(signal) : isVoiceErrorId(id) ? [await getVoiceError(id, signal)] : [];
        if (!signal.aborted) setResult({ records });
      } catch (err) {
        if (signal.aborted) return;
        if (id && err instanceof ApiError && err.status === 404) setResult({ records: [] });
        else setResult({ message: err instanceof ApiError && err.status === 403 ? 'Only the owner can view voice errors.' : 'Could not load voice errors. Try again.' });
      }
    }
    void load();
    return () => controller.abort();
  }, [query]);
  return <>
    <p>Recent provider failures are available for seven days.</p>
    <form onSubmit={e => { e.preventDefault(); if (input.trim()) search(input.trim()); }}>
      <SettingsField label="Error ID" value={input} onChange={e => setInput(e.target.value)} autoComplete="off" spellCheck={false} />
      <div className="ssh-form-actions"><Button type="submit" disabled={!input.trim()}>Look up</Button>
        <Button variant="ghost" onClick={() => { setInput(''); search(''); }}>Show recent</Button></div>
    </form>
    {!result ? <p role="status">Loading errors…</p> : 'message' in result ? <p role="alert">{result.message}</p> : !result.records.length ? <p role="status">{query.id ? 'No matching error' : 'No recent errors'}</p> : <>
      <p role="status">{query.id ? 'Matching error' : 'Recent errors'}</p>
      <ul>{result.records.map(r => <li key={r.id}>
        <code>{r.id}</code> · <time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleString()}</time><br />
        Provider: {r.provider ?? 'unknown'} · Model: {r.model ?? 'unknown'}<br />
        Stage: {r.stage} · Cause: {r.cause}
      </li>)}</ul>
    </>}
  </>;
}

/** Fetch diagnostics only when the owner opens Errors; closing clears the view. */
export function VoiceErrors() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <section className="ssh-card" aria-label="Voice errors">
    <Button aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}>Errors</Button>
    <div id={id} hidden={!open}>{open && <Journal />}</div>
  </section>;
}
