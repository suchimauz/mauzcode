import { useEffect, useRef, useState } from 'react';
import { Button, Panel, Stack, requestJson, type ExtensionViewProps, type UiExtension } from '@mauzcode/ui';

type CatalogueOption = { model: string; label: string; groupLabel?: string; connectionId?: string; disabled: boolean };
type Catalogue = { defaultModel: string; models: CatalogueOption[] };
// Enabled models of the stored model connections; reading the catalogue never asks a model for text.
function useEnabledModels() {
  const [state, setState] = useState<{ models: CatalogueOption[]; defaultModel: string; error: string; loading: boolean }>({ models: [], defaultModel: '', error: '', loading: true });
  useEffect(() => {
    const controller = new AbortController();
    requestJson<Catalogue>('/ui-lab-api/new-session', { signal: controller.signal })
      .then(data => { const models = data.models.filter(option => !option.disabled); setState({ models, defaultModel: models.some(m => m.model === data.defaultModel) ? data.defaultModel : models[0]?.model ?? '', error: '', loading: false }); })
      .catch(cause => { if (!controller.signal.aborted) setState({ models: [], defaultModel: '', error: cause instanceof Error ? cause.message : String(cause), loading: false }); });
    return () => controller.abort();
  }, []);
  return state;
}
function Autotext({ context }: ExtensionViewProps) {
  const catalogue = useEnabledModels();
  const [text, setText] = useState(''), [chosen, setModel] = useState(''), [auto, setAuto] = useState(false), [rewrite, setRewrite] = useState(true);
  const [preview, setPreview] = useState<{ text: string; start: number; end: number } | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const model = catalogue.models.some(option => option.model === chosen) ? chosen : catalogue.defaultModel;
  const groups = new Map<string, { label: string; options: CatalogueOption[] }>();
  for (const option of catalogue.models) { const key = option.connectionId ?? option.groupLabel ?? ''; const group = groups.get(key) ?? { label: option.groupLabel ?? key, options: [] }; group.options.push(option); groups.set(key, group); }
  const editor = useRef<HTMLTextAreaElement>(null), pending = useRef<AbortController | null>(null);
  function cancel() { pending.current?.abort(); pending.current = null; setBusy(false); setPreview(null); }
  async function suggest() {
    cancel(); if (context.readOnly || !model) return;
    const cursor = editor.current?.selectionStart ?? text.length, before = text.slice(0, cursor), after = text.slice(cursor);
    if (!before.trim()) return;
    const tail = before.split(/(?<=[.!?\n])\s/).pop()?.slice(-300) ?? '';
    const controller = new AbortController(); pending.current = controller; setBusy(true); setError('');
    try {
      const result = await requestJson<{ text: string; replaceChars?: number }>('/autotext/suggest', { method: 'POST', signal: controller.signal, body: { model, before, after, rewrite: rewrite && tail.length >= 2, tail } });
      if (!controller.signal.aborted) setPreview(result.text ? { text: result.text, start: cursor - (result.replaceChars ?? 0), end: cursor } : null);
    } catch (cause) { if (!controller.signal.aborted) setError(String(cause)); }
    finally { if (!controller.signal.aborted) { setBusy(false); pending.current = null; } }
  }
  function accept() { if (preview) { setText(text.slice(0, preview.start) + preview.text + text.slice(preview.end)); setPreview(null); editor.current?.focus(); } }
  useEffect(() => { if (!auto || !text || context.readOnly) return; const timer = setTimeout(() => { void suggest(); }, 3000); return () => clearTimeout(timer); }, [text, model, auto, rewrite, context.readOnly]);
  useEffect(() => () => pending.current?.abort(), []);
  return <Panel title="Autotext lab"><Stack><p>Compare short prose continuations. Drafts stay in this page; requesting a suggestion sends surrounding text to the selected model.</p>
    <label>Model <select value={model} disabled={!catalogue.models.length} onChange={e => { cancel(); setModel(e.target.value); }}>{[...groups].map(([key, group]) => <optgroup key={key} label={group.label}>{group.options.map(option => <option key={option.model} value={option.model}>{option.label}</option>)}</optgroup>)}</select></label>
    {catalogue.loading && <p role="status">Loading models…</p>}
    {!catalogue.loading && !catalogue.models.length && <p role="alert">{catalogue.error || 'No enabled models. Add or enable a connection in Settings → Models.'}</p>}
    <label><input type="checkbox" checked={auto} onChange={e => { cancel(); setAuto(e.target.checked); }} /> Suggest after 3 seconds</label>
    <label><input type="checkbox" checked={rewrite} onChange={e => { cancel(); setRewrite(e.target.checked); }} /> Fix sentence and continue</label>
    <label>Article draft<textarea ref={editor} value={text} rows={14} maxLength={16000} style={{ width: '100%' }} onChange={e => { cancel(); setText(e.target.value); }} onClick={cancel} onKeyDown={e => { if (e.key === 'Escape') cancel(); else if (e.key === 'Tab' && preview) { e.preventDefault(); accept(); } else if (e.code === 'Space' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void suggest(); } else if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') cancel(); }} /></label>
    <Button disabled={busy || context.readOnly || !text.trim() || !model} onClick={() => void suggest()}>Suggest</Button>
    {busy && <p role="status">Requesting suggestion…</p>}{error && <p role="alert">{error}</p>}
    {preview && <section aria-label="Suggested replacement"><p>{preview.start < preview.end ? 'Replace sentence tail with:' : 'Insert at cursor:'}</p><p style={{ whiteSpace: 'pre-wrap' }}>{preview.text}</p><Button onClick={accept}>Accept (Tab)</Button><Button onClick={cancel}>Dismiss (Esc)</Button></section>}
  </Stack></Panel>;
}

export const utilityExtension: UiExtension = { id: 'utilities', apiVersion: 1, pages: [{ id: 'autotext', title: 'Autotext', component: Autotext }], navigation: [{ page: 'autotext', title: 'Autotext' }] };
