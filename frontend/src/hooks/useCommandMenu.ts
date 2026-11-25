import { useEffect, useState } from 'react';
import { getCommands, supportedCommand, type CommandCatalogue, type CommandDescriptor, type CommandOption } from '../lib/commands';

export type ComposerCommand = CommandDescriptor & { option?: CommandOption };
/** Both triggers share one agent-scoped catalogue. Arguments are suggestions, not constraints. */
export function useCommandMenu(value: string, enabled: boolean, options: { plusOpen?: boolean; claimed?: boolean; onClose?: () => void; agentId?: string; projectId?: string; presetId?: string } = {}) {
  const [catalogue, setCatalogue] = useState<CommandCatalogue | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [retry, setRetry] = useState(0);
  const match = /^\s*\/([\w-]*(?:\.[\w-]*)*(?::[\w-]*)?)(?:[ \t]+([^\n]*))?$/.exec(value);
  const wanted = !!(enabled && (options.plusOpen || match));
  useEffect(() => {
    if (!wanted) return;
    const controller = new AbortController();
    setCatalogue(null); setStatus('loading'); setError('');
    // A changed project or preset discards the previous response: the abort below ignores a late reply.
    void getCommands({ agentId: options.agentId, projectId: options.projectId, presetId: options.presetId }, controller.signal).then(result => {
      if (!controller.signal.aborted) { setCatalogue(result); setStatus('ready'); }
    }).catch(reason => {
      if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : String(reason)); setStatus('error'); }
    });
    return () => controller.abort();
  }, [wanted, options.plusOpen, options.agentId, options.projectId, options.presetId, retry]);
  const [navigated, setNavigated] = useState(false);
  useEffect(() => { setIndex(0); setNavigated(false); setDismissed(null); }, [value, options.plusOpen]);
  const sections = [...(catalogue?.sections ?? [])].sort((a, b) => a.order - b.order);
  const rows = (catalogue?.commands ?? []).filter(supportedCommand).sort((a, b) => a.order - b.order);
  const filter = options.plusOpen ? '' : (match?.[1] ?? '').toLowerCase();
  const args = options.plusOpen ? undefined : match?.[2]?.toLowerCase();
  const exact = rows.find(c => c.name === match?.[1]);
  const matches: ComposerCommand[] = args !== undefined ? (exact?.args?.options ?? []).filter(o => [o.value, o.label].some(s => s?.toLowerCase().includes(args))).map(option => ({ ...exact!, option })) : sections.flatMap(section => rows.filter(c => c.section === section.id && [c.name, c.label, c.skill?.source ?? ''].some(s => s.toLowerCase().includes(filter))));
  const open = wanted && (options.plusOpen || dismissed !== value) && (args !== undefined ? matches.length > 0 : !options.claimed || options.plusOpen);
  return { open, matches, sections, exact, status, error, argumentMode: args !== undefined, navigated,
    index: Math.min(index, Math.max(0, matches.length - 1)), setIndex: (next: number) => { setIndex(next); setNavigated(true); },
    dismiss: () => { setDismissed(value); options.onClose?.(); }, retry: () => setRetry(n => n + 1) };
}
