import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AlarmClock, Eye, Play, Repeat, Search, X } from 'lucide-react';
import { getArmedTriggers, kindLabel, outcomeMessage, postTriggerAction, type ArmedTrigger, type ArmedTriggerSnapshot, type TriggerKind } from '../../lib/triggers';
import { subscribeLive } from '../../sdk/live';
import { IconButton } from '../ui/IconButton';
import { Dock, DockBadge, DockHeader, DockNotice } from './ComposerDock';
import './trigger-dock.css';

const order: TriggerKind[] = ['at', 'cron', 'watch'];
const KindIcon = { at: AlarmClock, cron: Repeat, watch: Eye } as const;
const when = (value: number | null | undefined) => {
  if (value == null) return 'время не задано';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : 'время не задано';
};
function timeLabel(trigger: ArmedTrigger) {
  if (trigger.status === 'checking') return 'проверяется сейчас';
  return trigger.kind === 'watch' ? `следующая проверка ${when(trigger.nextAt)}` : `запуск ${when(trigger.nextAt)}`;
}

/** Composer disclosure with the open agent's armed triggers; refreshed by live `automation`/`wake`/`all` hints and resync. */
export function TriggerDock({ agentId }: { agentId: string }) {
  const [snapshot, setSnapshot] = useState<ArmedTriggerSnapshot | null>(null);
  const [stale, setStale] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState<Record<string, 'run' | 'cancel'>>({});
  const [notice, setNotice] = useState('');
  const listId = useId();
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A lost response is retried with the same key so the server never applies it twice.
  const keys = useRef(new Map<string, string>());
  const read = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    try {
      const value = await getArmedTriggers(agentId, current.signal);
      if (!current.signal.aborted && value.agentId === agentId) { setSnapshot(value); setStale(false); }
    } catch {
      // Keep the last known rows, marked as possibly outdated; never fake an empty list.
      if (!current.signal.aborted) setStale(true);
    }
  }, [agentId]);
  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; void read(); }, 120);
  }, [read]);
  useEffect(() => {
    void read();
    const stop = subscribeLive({
      name: `trigger-dock:${agentId}`, types: ['ui.metaSection'],
      onEvent: event => {
        const data = event as { agentId?: string; section?: string };
        if (data.agentId === agentId && (data.section === 'automation' || data.section === 'wake' || data.section === 'all')) schedule();
      },
      resync: () => { void read(); },
      onError: () => { /* Live updates are optional; the next resync reconciles. */ },
    });
    return () => { stop(); controller.current?.abort(); if (timer.current) clearTimeout(timer.current); };
  }, [agentId, read, schedule]);

  async function act(trigger: ArmedTrigger, action: 'run' | 'cancel') {
    if (pending[trigger.id]) return;
    const slot = `${trigger.id}:${action}`;
    const requestId = keys.current.get(slot) ?? crypto.randomUUID();
    keys.current.set(slot, requestId);
    setPending(value => ({ ...value, [trigger.id]: action })); setNotice('');
    try {
      const result = await postTriggerAction(agentId, trigger.id, action, requestId);
      keys.current.delete(slot);
      setNotice(outcomeMessage({ outcome: result.outcome, kind: result.kind ?? trigger.kind }));
    } catch (error) {
      setNotice(`${error instanceof Error ? error.message : 'Действие не выполнено'} Повтор не выполнит его дважды.`);
    } finally {
      setPending(value => { const next = { ...value }; delete next[trigger.id]; return next; });
      void read();
    }
  }

  const triggers = snapshot?.agentId === agentId ? snapshot.triggers : [];
  if (!triggers.length && !notice) return null;
  const counts = order.map(kind => ({ kind, count: triggers.filter(trigger => trigger.kind === kind).length })).filter(group => group.count > 0);
  const summary = counts.map(group => `${kindLabel[group.kind]}: ${group.count}`).join(', ');
  return <Dock className="trigger-dock" label="Триггеры агента" expanded={expanded && triggers.length > 0}>
    {triggers.length > 0 && <DockHeader icon={<AlarmClock size={16} />} expanded={expanded} controls={listId} onToggle={() => setExpanded(value => !value)}
      label={`Триггеры — ${summary}${stale ? ', данные могут быть устаревшими' : ''}`}
      meta={<>
        <span className="trigger-counts" aria-hidden="true">{counts.map(group => { const Icon = KindIcon[group.kind]; return <DockBadge key={group.kind} className="trigger-count" data-kind={group.kind}><Icon size={13} />{kindLabel[group.kind]}<b>{group.count}</b></DockBadge>; })}</span>
        {stale && <span aria-hidden="true">устарело?</span>}
      </>}>
      Триггеры
    </DockHeader>}
    {expanded && triggers.length > 0 && <ol id={listId} className="dock-body dock-list">{triggers.map(trigger => {
      const Icon = KindIcon[trigger.kind];
      const busy = pending[trigger.id];
      const runLabel = trigger.kind === 'watch' ? 'Проверить сейчас' : 'Запустить сейчас';
      return <li key={trigger.id} className="dock-row trigger-row" data-kind={trigger.kind} data-status={trigger.status}>
        <Icon size={14} className="dock-row-marker trigger-kind-icon" aria-hidden="true" />
        <div className="dock-row-text trigger-text">
          <span title={trigger.purpose}><span className="sr-only">{kindLabel[trigger.kind]}: </span>{trigger.purpose || 'Без описания'}</span>
          <span className="dock-row-secondary">{[kindLabel[trigger.kind], timeLabel(trigger), trigger.kind === 'cron' && trigger.cronExpression ? `${trigger.cronExpression}${trigger.timezone ? ` · ${trigger.timezone}` : ''}` : '', trigger.kind === 'watch' && trigger.mode === 'edge' ? 'при каждом переходе' : ''].filter(Boolean).join(' · ')}</span>
        </div>
        <div className="dock-row-actions">
          <IconButton size="compact" label={`${runLabel}: ${trigger.purpose}`} tooltip={runLabel} disabled={!!busy || trigger.status === 'checking'} onClick={() => void act(trigger, 'run')}>{trigger.kind === 'watch' ? <Search size={15} /> : <Play size={15} />}</IconButton>
          <IconButton size="compact" label={`Отменить триггер: ${trigger.purpose}`} tooltip="Отменить" disabled={!!busy} onClick={() => void act(trigger, 'cancel')}><X size={15} /></IconButton>
        </div>
      </li>;
    })}</ol>}
    {notice && <DockNotice tone="info" action={!triggers.length ? { label: 'Скрыть', onClick: () => setNotice('') } : undefined}>{notice}</DockNotice>}
  </Dock>;
}
