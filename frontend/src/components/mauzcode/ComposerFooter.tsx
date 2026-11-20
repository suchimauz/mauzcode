import { useEffect, useId, useRef, useState } from 'react';
import { HoverPanel } from '../ui/HoverPanel';
import { ContextDetailsPanel } from './ContextDetailsPanel';
import { ContextPie } from './ContextPie';
import { RollingNumber } from '../ui/RollingNumber';
import { getContextBudget, type ContextBudget, type ContextDetails } from '../../lib/mauzcode';
import { formatCompactTokens } from '../../lib/formatCompactTokens';
import './composer-footer.css';
/**
 * Metrics row below the input: usage at the left (cost, input/output tokens, cache hit) and the context meter at the
 * right. They are two controls with their own hover and focus state that open one shared context details panel,
 * anchored to the row's right edge. As the composer narrows only the used/total tokens hide; nothing wraps or scrolls.
 * The model picker and voice controls live in the input bar (see `LiveComposer`).
 */
export function ComposerFooter({ agentId, running, revision }: { agentId: string; running: boolean; busy?: boolean; revision: number }) {
  const [contextOpen, setContextOpen] = useState(false);
  const contextId = useId();
  const row = useRef<HTMLDivElement>(null);
  const [details, setDetails] = useState<ContextDetails | null>(null);
  const [budget, setBudget] = useState<ContextBudget | null>(null);
  useEffect(() => {
    const controller = new AbortController(); let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try { const result = await getContextBudget(agentId, controller.signal); if (!controller.signal.aborted) { setBudget(result.budget); setDetails(result.details ?? null); } }
      catch { if (!controller.signal.aborted) { setBudget(null); setDetails(null); } }
      finally { pending = false; }
    };
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', visible);
    void refresh(); const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [agentId, running, revision]);
  const used = budget ? budget.usedTokens ?? budget.estimatedTokens : 0;
  const exact = budget?.usedSource === 'provider';
  const windowSize = budget?.contextWindow && budget.contextWindow > 0 ? budget.contextWindow : null;
  const percent = budget && windowSize ? Math.round(used / windowSize * 100) : null;
  const label = percent == null ? 'Оценка контекста недоступна' : `${percent}% of context used`;
  const detail = budget ? `${exact ? '' : '~'}${used.toLocaleString('ru-RU')} токенов${windowSize ? ` из ${windowSize.toLocaleString('ru-RU')}` : '; размер окна неизвестен'}. ${exact ? 'Последний запрос по данным провайдера плюс оценка новых сообщений.' : 'Оценка следующего запроса.'}` : 'Не удалось получить оценку следующего запроса.';
  const usage = details?.usage;
  // Input already includes cache reads and writes; adding them again double-counts usage.
  const formatTokens = (n: number | null | undefined) => n == null ? '—' : Math.round(n).toLocaleString('en-US');
  const cache = usage?.cacheHitRatio == null ? null : Math.round(usage.cacheHitRatio * 100);
  const formatUsd = (n: number | null | undefined) => n == null ? '$—' : n > 0 && n < 0.01 ? '<$0.01' : `$${n.toLocaleString('en-US', n < 10 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 })}`;
  const costLabel = usage?.costUsd == null ? 'Цена неизвестна' : `Примерная цена по API-прайсу ${formatUsd(usage.costUsd)}`;
  const contextLabel = `${label}. ${detail} Открыть статистику контекста`;
  const usageLabel = `Input: ${formatTokens(usage?.inputTokens)} tok. Output: ${formatTokens(usage?.outputTokens)} tok. ${cache == null ? 'Нет замера кэша' : `Попадание в кэш ${cache}%`}. ${costLabel}. Открыть статистику контекста`;
  const level = percent == null ? 'unknown' : percent >= 80 ? 'high' : percent >= 48 ? 'medium' : 'low';
  return <div className="composer-footer">
    <div ref={row} className="composer-metrics-row">
      <HoverPanel id={contextId} anchor={row} open={contextOpen} onOpenChange={setContextOpen} label="Context usage" className="context-panel" trigger={[
        <button key="usage" type="button" className="composer-metrics composer-metrics--usage" aria-label={usageLabel} aria-haspopup="dialog">
          <span className="composer-metrics-usage">
            {usage?.costUsd != null && <span className="composer-cost" title={usage.price ? `≈ по API-прайсу: $${usage.price.input}/M in, $${usage.price.output}/M out` : undefined}><RollingNumber value={formatUsd(usage.costUsd)} /></span>}
            <span className="composer-token-count" data-usage="input"><span className="composer-token-arrow" aria-hidden="true">↑</span><RollingNumber value={formatCompactTokens(usage?.inputTokens)} /></span>
            <span className="composer-token-count" data-usage="output"><span className="composer-token-arrow" aria-hidden="true">↓</span><RollingNumber value={formatCompactTokens(usage?.outputTokens)} /></span>
            <span className="composer-cache-hit" title={cache == null ? 'Попадание в кэш: нет замера' : `Попадание в кэш ${cache}%`}><RollingNumber value={cache == null ? '—' : `${cache}%`} /></span>
          </span>
        </button>,
        <button key="context" type="button" className="composer-metrics composer-metrics--context" aria-label={contextLabel} aria-haspopup="dialog">
          <span className="composer-metrics-context" data-level={level}><ContextPie percent={percent} /><RollingNumber value={percent == null ? '—' : `${percent}%`} />{budget && windowSize && <span className="composer-metrics-window">· {exact ? '' : '~'}{formatCompactTokens(used)} / {formatCompactTokens(windowSize)}</span>}</span>
        </button>,
      ]}>
        <ContextDetailsPanel budget={budget} details={details} />
      </HoverPanel>
    </div>
  </div>;
}
