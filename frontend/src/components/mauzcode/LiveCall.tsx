import { HighlightedCode } from './HighlightedCode';

const scalar = (value: unknown) => typeof value === 'string' ? value : value === null || typeof value !== 'object' ? String(value) : JSON.stringify(value);

/** The call of a running tool, shown once and without chrome: the whole command (`$ …`) or code, else the arguments as plain `key value` lines. */
export function LiveCall({ args, loading = false, error = '' }: { args: Record<string, unknown> | null; loading?: boolean; error?: string }) {
  if (loading) return <p className="tool-live-note" role="status">Загрузка команды…</p>;
  if (error) return <p role="alert">{error}</p>;
  const command = typeof args?.command === 'string' ? args.command : null;
  const code = command === null && typeof args?.code === 'string' ? args.code : null;
  if (command !== null || code !== null) {
    return <div className="tool-live-command" aria-label="Команда">
      {command !== null && <span className="tool-live-prompt" aria-hidden="true">$ </span>}
      <HighlightedCode text={command ?? code!} language={command !== null ? 'bash' : 'typescript'} />
    </div>;
  }
  const entries = Object.entries(args ?? {});
  if (!entries.length) return null;
  return <div className="tool-live-command tool-live-args" aria-label="Аргументы">
    {entries.map(([key, value]) => <div key={key}><span className="tool-live-key">{key}</span> {scalar(value)}</div>)}
  </div>;
}
