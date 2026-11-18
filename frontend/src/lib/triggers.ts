import { requestJson } from './mauzcode';
import { getCommands } from './commands';

export type TriggerKind = 'at' | 'cron' | 'watch';
export type ArmedTrigger = { id: string; kind: TriggerKind; status: 'active' | 'checking'; purpose: string; nextAt: number | null; cronExpression?: string | null; timezone?: string | null; mode?: 'once' | 'edge'; timeoutAt?: number | null };
export type ArmedTriggerSnapshot = { agentId: string; counts: Record<TriggerKind, number>; triggers: ArmedTrigger[] };
export type TriggerActionOutcome = 'scheduled' | 'deferred_paused' | 'already_checking' | 'not_active' | 'cancelled' | 'planning';
export type TriggerActionResult = { ok: boolean; action: 'run' | 'cancel'; triggerId: string; requestId: string; outcome: TriggerActionOutcome; kind?: string; purpose?: string; duplicate?: boolean };

/** Authorized armed-trigger projection; never contains predicate configuration or results. */
export const getArmedTriggers = (agentId: string, signal?: AbortSignal) =>
  requestJson<ArmedTriggerSnapshot>(`/agent/${encodeURIComponent(agentId)}/triggers`, { signal });

/** One replay-safe row action; retries must reuse the same requestId. */
export async function postTriggerAction(agentId: string, triggerId: string, action: 'run' | 'cancel', requestId: string): Promise<TriggerActionResult> {
  const { csrfToken } = await getCommands();
  if (!csrfToken) throw new Error('Сервер не выдал токен. Обновите страницу.');
  return requestJson<TriggerActionResult>(`/agent/${encodeURIComponent(agentId)}/triggers/${encodeURIComponent(triggerId)}/actions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ requestId, action }),
  });
}

export const kindLabel: Record<TriggerKind, string> = { at: 'Разовый', cron: 'Расписание', watch: 'Условие' };

/** Plain-language outcome: scheduling acceptance is never presented as a firing. */
export function outcomeMessage(result: Pick<TriggerActionResult, 'outcome' | 'kind'>): string {
  const watch = result.kind === 'watch';
  switch (result.outcome) {
    case 'scheduled': return watch ? 'Проверка запланирована — результат появится после проверки.' : 'Запуск запланирован — срабатывание появится в чате после доставки.';
    case 'deferred_paused': return watch ? 'Проверка запланирована и пройдёт после возобновления агента.' : 'Запланировано, выполнится после возобновления агента.';
    case 'already_checking': return 'Уже проверяется — повторный запуск не нужен.';
    case 'not_active': return 'Триггер уже не активен — ничего не изменено.';
    case 'cancelled': return 'Триггер отменён.';
    case 'planning': return 'В режиме планирования триггеры не меняются.';
  }
}
