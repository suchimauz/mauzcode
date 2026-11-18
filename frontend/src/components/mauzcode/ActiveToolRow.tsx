import { useToolReveal } from './useToolReveal';
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { getRunArgs, type ActiveTool } from '../../lib/mauzcode';
import { ToolShimmer } from './ToolShimmer';
import { ToolTiming } from './ToolTiming';
import { toolPresentation } from './toolIcons';
import { ToolCallPanel } from './ToolCallPanel';
import { LiveOutput } from './LiveOutput';
import { useRunOutput } from './useRunOutput';
import { ToolModal } from './ToolModal';
import { useIsMobile } from '../../hooks/useIsMobile';
import './tool-row.css';
/** Running state comes from the live tool registry, never inferred from transcript order. The collapsed row matches the finished row of the same call; expanded it shows the complete call and the full live output. */
export function ActiveToolRow({ run, agentId, autoOpen = true }: { run: ActiveTool; agentId?: string; autoOpen?: boolean }) {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const mobile = useIsMobile();
  // Mobile never expands inline: only an explicit tap opens the live output in a modal.
  const open = mobile ? manualOpen === true : manualOpen ?? autoOpen;
  const live = useRunOutput(agentId, run.id, open, run.outputEnd);
  const [largeArgs, setLargeArgs] = useState<{ args: Record<string, unknown> | null; error: string }>({ args: null, error: '' });
  useEffect(() => {
    if (!open || !run.argsLarge || !agentId || largeArgs.args) return;
    const controller = new AbortController();
    getRunArgs(agentId, run.id, controller.signal).then(response => { if (!controller.signal.aborted) setLargeArgs({ args: response.args, error: '' }); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setLargeArgs({ args: null, error: error instanceof Error ? error.message : 'Не удалось загрузить аргументы' }); });
    return () => controller.abort();
  }, [open, run.argsLarge, run.id, agentId, largeArgs.args]);
  const text = live.loaded ? live.text : run.tail;
  const { row, requestReveal } = useToolReveal(open, text);
  const shown = toolPresentation({ name: run.name, label: run.label, icon: run.icon, category: run.category, summary: run.summary ?? run.subject });
  const Icon = shown.Icon;
  const args = run.argsLarge ? largeArgs.args : run.args ?? null;
  return <section ref={row} className="tool-row" data-state={run.state} data-category={shown.category}>
    <button className="tool-row-summary" type="button" aria-expanded={mobile ? undefined : open} aria-haspopup={mobile ? 'dialog' : undefined} onClick={() => { if (!mobile) requestReveal(!open); setManualOpen(!open); }}>
      <span className="tool-row-leading"><Icon className="tool-row-icon" data-tool-icon={shown.icon} size={14} strokeWidth={1.4} aria-hidden="true" />{open ? <ChevronUp className="tool-row-toggle" size={14} /> : <ChevronDown className="tool-row-toggle" size={14} />}</span>
      <ToolShimmer className="tool-row-words"><span className="tool-row-title">{shown.label}</span>{shown.summary && <><span className="tool-row-dot" aria-hidden="true" /><span className="tool-row-description" title={shown.summary}>{shown.summary}</span></>}</ToolShimmer>
      <ToolTiming startedAt={run.startedAt} timeoutMs={run.timeoutMs} />
      <span className="sr-only">{run.state === 'stopping' ? 'Останавливается' : 'Выполняется'}</span>
    </button>
    {(() => {
      const panel = <div className="tool-row-panel">
        <ToolCallPanel agentId={agentId} args={args} loading={!!run.argsLarge && !largeArgs.args && !largeArgs.error}
          error={largeArgs.error ? <p role="alert">{largeArgs.error}</p> : undefined}
          output={<>{live.error && <p role="alert">{live.error}</p>}<LiveOutput text={text} dropped={live.loaded ? live.start : 0} placeholder={run.state === 'stopping' ? 'Останавливается…' : 'Ожидание вывода…'} /></>} />
      </div>;
      return mobile ? <ToolModal open={open} onOpenChange={setManualOpen} title={shown.summary ? `${shown.label} · ${shown.summary}` : shown.label}>{panel}</ToolModal> : open && panel;
    })()}
  </section>;
}
