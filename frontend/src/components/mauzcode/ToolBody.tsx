import { ToolPreview as Preview } from './ToolPreview';
import { HighlightedCode } from './HighlightedCode';
import type { ToolDetails } from '../../lib/mauzcode';

const RTK_OUTCOMES: Record<string, string> = { rewritten: 'команда переписана RTK', unchanged: 'RTK не переписал команду', denied: 'запрещено правилами RTK, команда не выполнялась', fallback: 'сбой RTK — RTK отключён, выполнена исходная команда', stale: 'RTK отключён во время подготовки, выполнена исходная команда', deadline: 'время истекло во время подготовки RTK, команда не выполнялась', inactive: 'RTK не применён' };
/** Original vs actually executed command when the RTK plugin prepared a bash call. */
function RtkNote({ rtk }: { rtk: NonNullable<ToolDetails['rtk']> }) {
  const changed = rtk.executed !== null && rtk.executed !== rtk.original;
  return <div className="tool-body-note" data-rtk-outcome={rtk.outcome}>
    <p>RTK: {RTK_OUTCOMES[rtk.outcome] ?? rtk.outcome}{rtk.code !== null ? ` (код ${rtk.code})` : ''}</p>
    {changed && <div className="tool-terminal-command" aria-label="Выполненная команда"><span aria-hidden="true">→ $ </span><HighlightedCode text={rtk.executed!} language="bash" /></div>}
    {rtk.diagnostic && <p>{rtk.diagnostic}</p>}
  </div>;
}
function pretty(text: string) { try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; } }

/** Argument keys whose full content the output body renders itself, so the Call section does not repeat them. */
export function toolBodyOmits(kind: string): string[] {
  return kind === 'write' ? ['content'] : kind === 'edit' ? ['edits'] : [];
}

/** Output section of an expanded finished call: dsh read/search/diff/terminal presentations over the stored result. The call itself is in ToolCallPanel. */
export function ToolBody({ details, kind, args }: { details: ToolDetails; kind: string; args: Record<string, unknown> }) {
  const path = typeof args.path === 'string' ? args.path : typeof args.file_path === 'string' ? args.file_path : typeof args.file === 'string' ? args.file : '';
  const result = details.result;
  const changes = Array.isArray(args.edits) ? args.edits.filter((value): value is Record<string, unknown> => !!value && typeof value === 'object') : [];
  const textChanges = changes.filter(change => typeof change.oldText === 'string' && typeof change.newText === 'string');
  const diff = kind === 'edit' || kind === 'write';
  return <div className="tool-specialized-body" data-tool-kind={kind} data-error={details.isError || undefined}>
    {kind === 'bash' && details.rtk && <RtkNote rtk={details.rtk} />}
    {kind === 'write' && typeof args.content === 'string' && <Preview text={args.content} path={path} limit={9} numbered tone="tool-row-added" />}
    {kind === 'edit' && textChanges.map((change, i) => <div className="tool-row-diff" key={i}><Preview text={String(change.oldText)} path={path} prefix="− " numbered limit={9} tone="tool-row-removed" /><Preview text={String(change.newText)} path={path} prefix="+ " numbered limit={9} tone="tool-row-added" /></div>)}
    {kind === 'edit' && changes.filter(change => !(typeof change.oldText === 'string' && typeof change.newText === 'string')).map((change, i) => typeof change.text === 'string' ? <Preview key={i} text={change.text} path={path} numbered start={typeof change.anchor === 'string' ? (Number.parseInt(change.anchor, 10) || 1) + (change.op === 'insertAfter' && /^\d/.test(change.anchor) ? 1 : 0) : 1} tone="tool-row-added" prefix="+ " /> : null)}
    {kind === 'read' && result ? <Preview text={result} path={path} read />
      : result ? <Preview text={['bash', 'eval', 'tools_eval'].includes(kind) || diff ? result : pretty(result)} limit={Number.POSITIVE_INFINITY} />
      : <p className="tool-body-note">Вывод отсутствует.</p>}
    {details.isError && <span className="sr-only">Ошибка выполнения</span>}
    {details.resultTruncated && <p>Результат сокращён сервером.</p>}
  </div>;
}
