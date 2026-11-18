import { useToolReveal } from './useToolReveal';
import { ToolBody, toolBodyOmits } from './ToolBody';
import { ToolCallPanel } from './ToolCallPanel';
import { ToolTiming } from './ToolTiming';
import { useEffect, useId, useState } from 'react';
import { ChevronDown, ChevronUp, CircleAlert } from 'lucide-react';
import { toolPresentation } from './toolIcons';
import { getToolDetails, type ChatEvent, type ToolDetails } from '../../lib/mauzcode';
import { toolFileTarget, openToolFile } from './toolFileTarget';
import { ToolModal } from './ToolModal';
import { useIsMobile } from '../../hooks/useIsMobile';
import './tool-row.css';

function parseArgs(text?: string): Record<string, unknown> | null {
  try { const value: unknown = JSON.parse(text || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
  catch { return null; }
}
/** A finished call. Label, icon, category and summary come from the server resolver, identical to the running row of the same call. */
export function ToolRow({ event, agentId, initialDetails }: { event: ChatEvent; agentId: string; initialDetails?: ToolDetails }) {
  const [open, setOpen] = useState(false);
  const mobile = useIsMobile();
  const [details, setDetails] = useState<ToolDetails | null>(initialDetails ?? null);
  const [error, setError] = useState('');
  const [fileError, setFileError] = useState('');
  const [openingFile, setOpeningFile] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const panelId = useId();
  const { row, requestReveal } = useToolReveal(open, details ?? error, Boolean(details || error));
  const name = event.name || details?.name || 'tool';
  const shortName = name.split('.').pop() || name;
  const fileTool = ['read', 'write', 'edit'].includes(shortName);
  useEffect(() => {
    if ((!open && !fileTool) || details) return;
    const controller = new AbortController();
    setError('');
    getToolDetails(agentId, event.idx, controller.signal).then(response => {
      if (!controller.signal.aborted) setDetails(response.event);
    }).catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Не удалось загрузить подробности'); });
    return () => controller.abort();
  }, [open, details, agentId, event.idx, fileTool, attempt]);
  const shown = toolPresentation({ name, label: event.toolLabel ?? details?.label, icon: event.toolIcon ?? details?.icon, category: event.toolCategory ?? details?.category, summary: event.toolSummary ?? details?.summary });
  const parsed = details ? parseArgs(details.args) : null;
  const args = parsed ?? {};
  const failed = event.isError || details?.isError;
  const Icon = failed ? CircleAlert : shown.Icon;
  const file = details && !details.argsTruncated && !failed && event.status !== 'interrupted' && event.status !== 'failed' ? toolFileTarget(name, args) : null;
  async function openFile() {
    if (!file || openingFile) return;
    setOpeningFile(true); setFileError('');
    try { await openToolFile(agentId, file); }
    catch (error) { setFileError(error instanceof Error ? error.message : 'Не удалось открыть файл'); }
    finally { setOpeningFile(false); }
  }
  function toggleDisclosure() {
    if (!mobile) requestReveal(!open);
    setOpen(!open);
  }
  return <section ref={row} className="tool-row" data-state={failed ? 'error' : 'ok'} data-error={failed || undefined} data-category={shown.category}>
    <div className="tool-row-header" onClick={toggleDisclosure}>
    <button type="button" className="tool-row-summary" aria-expanded={mobile ? undefined : open} aria-haspopup={mobile ? 'dialog' : undefined} aria-controls={mobile ? undefined : panelId} onClick={event => { event.stopPropagation(); toggleDisclosure(); }}>
      <span className="tool-row-leading"><Icon className="tool-row-icon" data-tool-icon={failed ? 'error' : shown.icon} size={14} strokeWidth={1.4} aria-hidden="true" />{open ? <ChevronUp className="tool-row-toggle" size={14} aria-hidden="true" /> : <ChevronDown className="tool-row-toggle" size={14} aria-hidden="true" />}</span>
      <span className="tool-row-title" title={name}>{shown.label}</span>
      {event.type === 'tool_result' && <span className="tool-row-kind">Результат</span>}
      {!file && shown.summary && <><span className="tool-row-dot" aria-hidden="true" /><span className="tool-row-description" title={shown.summary}>{shown.summary}</span></>}
      {!!event.createdTriggers?.length && <span className="tool-row-badge" title={event.createdTriggers.map(trigger => trigger.id).join(', ')}>{event.createdTriggers.length > 1 ? `Создано триггеров: ${event.createdTriggers.length}` : 'Триггер создан'}</span>}
      {failed && <span className="sr-only">Ошибка выполнения</span>}
    </button>
    {file && <><span className="tool-row-dot" aria-hidden="true" /><button type="button" className="tool-row-file tool-row-description" title={`Открыть в Canvas: ${file.host ? file.host + ':' : ''}${shown.summary || file.path}`} aria-label={`Открыть в Canvas: ${file.path}`} disabled={openingFile} onClick={event => { event.stopPropagation(); void openFile(); }}>{shown.summary || file.path}</button></>}
    <ToolTiming durationMs={event.durationMs} timeoutMs={event.timeoutMs} />
    </div>
    {fileError && <p role="alert" className="tool-row-panel">{fileError}</p>}
    {(() => {
      const panel = <div id={panelId} hidden={!open} className="tool-row-panel">
        {open && <ToolCallPanel agentId={agentId} codeLanguage={name.startsWith('nrepl.') || shortName === 'nrepl_eval' ? 'clojure' : undefined} args={details ? parsed : null} rawArgs={details && !parsed ? details.args : undefined} omit={toolBodyOmits(shortName)} loading={!details && !error}
          error={error ? <div role="alert"><p>{error}</p><button type="button" className="button button--secondary" onClick={() => setAttempt(value => value + 1)}>Повторить</button></div> : undefined}
          output={details ? <>{details.argsTruncated && <p>Аргументы сокращены сервером.</p>}<ToolBody details={details} kind={shortName} args={args} /></> : null} />}
      </div>;
      return mobile ? <ToolModal open={open} onOpenChange={setOpen} title={shown.summary ? `${shown.label} · ${shown.summary}` : shown.label}>{panel}</ToolModal> : panel;
    })()}
  </section>;
}
