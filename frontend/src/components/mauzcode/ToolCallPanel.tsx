import { useState, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { CodeBlock } from './CodeBlock';
import { openToolFile } from './toolFileTarget';

const CODE_KEYS: Record<string, string> = { command: 'bash', code: 'typescript' };

function ArgValue({ value }: { value: unknown }) {
  if (typeof value === 'string') return value.includes('\n') ? <pre className="tool-call-text">{value}</pre> : <span className="tool-call-text">{value}</span>;
  if (value === null || typeof value !== 'object') return <span className="tool-call-text">{String(value)}</span>;
  const count = Array.isArray(value) ? value.length : Object.keys(value).length;
  const label = Array.isArray(value) ? `[ ] ${count} ${count === 1 ? 'элемент' : 'элементов'}` : `{ } ${count} ${count === 1 ? 'ключ' : 'ключей'}`;
  return <details className="tool-call-nested"><summary>{label}</summary><pre className="tool-call-text">{JSON.stringify(value, null, 2)}</pre></details>;
}

function PathArg({ agentId, path, host }: { agentId?: string; path: string; host?: string }) {
  const [state, setState] = useState<{ busy: boolean; error: string }>({ busy: false, error: '' });
  async function open() {
    if (!agentId || state.busy) return;
    setState({ busy: true, error: '' });
    try { await openToolFile(agentId, host ? { path, host } : { path }); setState({ busy: false, error: '' }); }
    catch (error) { setState({ busy: false, error: error instanceof Error ? error.message : 'Не удалось открыть файл' }); }
  }
  return <>
    <span className="tool-call-text tool-call-path">{host ? `${host}:` : ''}{path}</span>
    {agentId && !/[\r\n\0]/.test(path) && <button type="button" className="tool-call-open" disabled={state.busy} onClick={() => { void open(); }} aria-label={`Открыть файл в Canvas: ${path}`} title="Открыть в Canvas"><ExternalLink size={12} strokeWidth={1.5} aria-hidden="true" />Открыть</button>}
    {state.error && <span role="alert" className="tool-call-error">{state.error}</span>}
  </>;
}

/** Shared expanded view for finished, running and mobile tool rows: the complete call first, then its output. Nothing is truncated. */
export function ToolCallPanel({ agentId, args, rawArgs, omit = [], loading = false, error, output, codeLanguage }: {
  agentId?: string;
  /** Language of a `code` argument (eval is TypeScript, nREPL eval is Clojure). */
  codeLanguage?: string;
  /** Parsed, server-redacted arguments. */
  args: Record<string, unknown> | null;
  /** Unparseable argument text from an older server, shown verbatim. */
  rawArgs?: string;
  /** Argument keys the output body already renders in full (write content, edit pairs). */
  omit?: string[];
  loading?: boolean;
  error?: ReactNode;
  output: ReactNode;
}) {
  const entries = Object.entries(args ?? {}).filter(([key]) => !omit.includes(key));
  const code = entries.filter(([key, value]) => key in CODE_KEYS && typeof value === 'string');
  const path = entries.find(([key, value]) => key === 'path' && typeof value === 'string')?.[1] as string | undefined;
  const host = typeof args?.host === 'string' && args.host.trim() ? args.host : undefined;
  const rest = entries.filter(([key, value]) => !(key in CODE_KEYS && typeof value === 'string') && key !== 'path' && !(key === 'host' && path !== undefined));
  const hasCall = code.length > 0 || path !== undefined || rest.length > 0 || !!rawArgs;
  return <div className="tool-call-panel">
    <section className="tool-call-section" aria-label="Вызов">
      <h4>Вызов</h4>
      {loading && <p role="status">Загрузка подробностей…</p>}
      {error}
      {!loading && !hasCall && !error && <p className="tool-call-empty">Без аргументов</p>}
      {code.map(([key, value]) => <CodeBlock key={key} compact text={String(value)} language={key === 'code' && codeLanguage ? codeLanguage : CODE_KEYS[key]} />)}
      {(path !== undefined || rest.length > 0) && <dl className="tool-call-args">
        {path !== undefined && <div><dt>path</dt><dd><PathArg agentId={agentId} path={path} host={host} /></dd></div>}
        {rest.map(([key, value]) => <div key={key}><dt>{key}</dt><dd><ArgValue value={value} /></dd></div>)}
      </dl>}
      {rawArgs && <pre className="tool-call-text">{rawArgs}</pre>}
    </section>
    <section className="tool-call-section" aria-label="Вывод">
      <h4>Вывод</h4>
      {output}
    </section>
  </div>;
}
