import type { ChatEvent } from '../../lib/mauzcode';

const types = new Set(['parked', 'unparked', 'model_changed', 'team_update', 'wake_up', 'canvas_ping', 'plan_activation', 'goal_activation', 'goal_check', 'attempt', 'attachment_event', 'trigger_lifecycle']);
export function isLifecycleEvent(event: ChatEvent) {
  return types.has(event.type) || (['user', 'user_message'].includes(event.type) && event.lifecycle?.automationKind === 'scheduled');
}

/** Inert, keyboard-expandable lifecycle history. Values are React text, never event HTML. */
export function LifecycleRow({ event }: { event: ChatEvent }) {
  const data = event.lifecycle ?? {};
  const text = (key: string, fallback = '') => data[key] == null ? fallback : String(data[key]);
  let title = 'Событие';
  let subtitle = '';
  let body = event.text ?? '';
  let detail = '';
  switch (event.type) {
    case 'parked': {
      title = 'Пауза: лимит подписки';
      subtitle = [text('provider'), text('account') === 'default' ? '' : text('account')].filter(Boolean).join('/');
      const date = new Date(Number(data.resetsAt ?? data.wakeAt ?? 0));
      const when = date.getTime() > 0 && Number.isFinite(date.getTime()) ? date.toLocaleString() : null;
      body = `${text('message', 'Квота исчерпана.')}\n${when ? `Автоматическое возобновление: ${when}.` : 'Время возобновления пока неизвестно.'} Чтобы продолжить раньше, смените модель или учётную запись.`;
      break;
    }
    case 'unparked':
      title = data.resumed ? 'Работа возобновлена' : 'Пауза снята';
      body = text('reason') === 'wake' ? 'Квота восстановлена' : text('reason') === 'model-switch' ? 'Модель изменена' : 'Пауза снята вручную';
      if (data.resumed) body += ' — продолжается незавершённая работа';
      break;
    case 'model_changed': title = 'Модель изменена'; body = `${text('fromLabel') || text('from', '?')} → ${text('toLabel') || text('to', '?')}`; break;
    case 'team_update':
      title = ({ 'task.completed': 'Шаг выполнен', 'todos.completed': 'Задачи завершены', 'plan.completed': 'Задачи завершены', answer: 'Ответ агента', blocked: 'Нужна помощь', failed: 'Ошибка выполнения' } as Record<string, string>)[text('event')] ?? 'Событие команды';
      subtitle = [text('memberId'), text('taskTitle')].filter(Boolean).join(' · ');
      body = text('summary'); detail = text('taskId'); break;
    case 'canvas_ping': title = 'Сигнал с canvas'; subtitle = text('title', 'Вкладка'); detail = text('dataPreview'); break;
    case 'plan_activation': title = 'Начат шаг'; subtitle = text('title', text('taskId', 'Задача')); body = text('instructions'); break;
    case 'goal_activation': title = 'Цель включена'; subtitle = `До ${text('iterations', '3')} итераций`; break;
    case 'goal_check':
      title = ({ achieved: 'Цель достигнута', limit_reached: 'Лимит итераций достигнут', continue: 'Цель ещё не достигнута' } as Record<string, string>)[text('status')] ?? 'Результат требует проверки';
      subtitle = data.maxIterations ? `Итерация ${text('iteration', '0')} из ${text('maxIterations')}` : '';
      body = [text('reason'), data.nextStep ? `Следующий шаг: ${text('nextStep')}` : ''].filter(Boolean).join('\n'); break;
    case 'attempt': title = 'Попытка исправлена · Только аудит'; subtitle = text('error'); break;
    case 'trigger_lifecycle': {
      const kind = ({ at: 'Разовый запуск', cron: 'Расписание', watch: 'Условие' } as Record<string, string>)[text('triggerKind')] ?? 'Триггер';
      const transition = text('transition');
      const cause = text('cause');
      const neuter = kind !== 'Разовый запуск' && kind !== 'Триггер';
      title = transition === 'created' ? `${kind} ${neuter ? 'добавлено' : 'добавлен'}` : transition === 'expired' ? `${kind}: срок истёк` : `${kind} ${neuter ? 'отменено' : 'отменён'}`;
      if (transition === 'cancelled') title += cause === 'task' ? ' вместе с задачей' : cause === 'bulk' ? ' (все триггеры)' : '';
      subtitle = [text('triggerId'), text('cronExpression'), text('timezone')].filter(Boolean).join(' · ');
      body = [text('purpose'), transition === 'expired' ? 'Условие так и не выполнилось; агент не запускался.' : '', data.creatorAgentId ? `Создал агент ${text('creatorTitle', text('creatorAgentId'))}` : ''].filter(Boolean).join('\n');
      break;
    }
    case 'attachment_event':
      title = 'Внешнее сообщение'; subtitle = [text('source'), text('chatTitle', text('chatId', text('eventType')))].filter(Boolean).join(' · ');
      body = [text('senderName', text('senderId')), text('text', text('summary'))].filter(Boolean).join('\n'); break;
    default: {
      const watch = !!data.watchId || data.triggerKind === 'watch';
      title = watch ? (data.watchStatus === 'ready' ? 'Условие выполнено' : data.watchStatus === 'timeout' ? 'Условие не выполнено в срок' : 'Сработало условие') : data.triggerKind === 'at' ? 'Разовый запуск' : data.triggerKind === 'cron' || data.automationKind === 'scheduled' || data.cronExpression ? 'Запуск по расписанию' : 'Автоматический запуск';
      subtitle = [text('watchId', text('scheduleId', text('triggerId'))), text('cronExpression'), text('timezone')].filter(Boolean).join(' · ');
      body = text('prompt', text('reason', event.text ?? text('content', text('summary'))));
      detail = [text('summary'), data.resultId ? `Сохранённый результат: ${text('resultId')}` : '', text('resultPreview'), text('dataPreview')].filter(Boolean).join('\n');
    }
  }
  return <details className="lifecycle-event" data-event-idx={event.idx} data-system-event={event.type === 'trigger_lifecycle' ? 'trigger' : undefined}>
    <summary><strong>{title}</strong>{subtitle && <span> · {subtitle}</span>}{event.excludedFromLlm && <span> · вне контекста</span>}</summary>
    {body && <p className="lifecycle-event-text">{body}</p>}
    {detail && <pre className="lifecycle-event-text">{detail}</pre>}
    {event.type === 'team_update' && data.memberId && <a href={`/agent/${encodeURIComponent(text('memberId'))}`}>Открыть чат агента</a>}
    {event.type === 'trigger_lifecycle' && data.creatorAgentId && <a href={`/agent/${encodeURIComponent(text('creatorAgentId'))}`}>Открыть чат создателя</a>}
    <small>{event.type}{data.event ? ` · ${text('event')}` : ''}</small>
  </details>;
}
