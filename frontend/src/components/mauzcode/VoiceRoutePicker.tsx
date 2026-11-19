import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Popover } from '@base-ui/react/popover';
import { AudioLines, Check, Settings } from 'lucide-react';
import { ApiError } from '../../lib/mauzcode';
import { clearVoiceChatRoute, destinationText, getVoiceState, setVoiceChatRoute, type VoiceChatRoute, type VoiceState } from '../../lib/voice';
import './voice-route-picker.css';

/** Window event asking the shell to open Settings on a tab; `detail.tab` is the settings tab id. */
export const OPEN_SETTINGS_EVENT = 'mauzcode:open-settings';
export const openVoiceSettings = () => window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { tab: 'voice' } }));

const REASON: Record<string, string> = {
  'unknown-provider': 'провайдер не загружен', 'unknown-connection': 'подключение удалено', 'unknown-model': 'модель недоступна',
  'catalogue-failed': 'список моделей недоступен', 'invalid-route': 'маршрут повреждён',
};

/** What the route selector loaded for its chat, shared with sibling entry points instead of a second request. */
export type VoiceRouteView = { state: VoiceState | null; hidden: boolean; error: string };

/** One-line state of the chat's effective voice route; it names the audio destination before any capture. */
export function voiceRouteSummary(chat: VoiceChatRoute | undefined, state?: VoiceState | null): string {
  if (!chat || chat.status === 'unconfigured') return 'Голосовой ввод не настроен. Настройте голосовое подключение в настройках.';
  const origin = chat.source === 'override' ? 'выбран для этого чата' : 'по умолчанию';
  if (chat.status === 'unavailable') return `Голосовой маршрут ${origin} недоступен (${REASON[chat.reason] ?? 'ошибка маршрута'}). Выберите другой.`;
  const account = state?.routes.find(r => r.route === chat.route)?.accountName;
  return `${chat.model.label || chat.model.id}${account ? ` · ${account}` : ''}, ${origin}. ${destinationText(chat.destination)}`;
}

/**
 * Per-chat voice route selector: shows where dictated audio would be processed, lets the owner pick a route for
 * this chat or return to the default, and links to Voice settings. It only reads settings; it never touches the
 * microphone or opens a voice session. Hidden for callers who may not manage voice (non-owners). `onState` shares
 * the one loaded state with sibling voice controls so they never issue a second request.
 */
export function VoiceRoutePicker({ agentId, disabled = false, onState }: { agentId: string; disabled?: boolean; onState?: (view: VoiceRouteView) => void }) {
  const [state, setState] = useState<VoiceState | null>(null);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const popup = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  useEffect(() => {
    const controller = new AbortController(); const current = ++generation.current;
    void getVoiceState(agentId, controller.signal).then(value => {
      if (!controller.signal.aborted && generation.current === current) { setState(value); setError(''); }
    }).catch(err => {
      if (controller.signal.aborted || generation.current !== current) return;
      if (err instanceof ApiError && (err.status === 401 || err.status === 403 || err.status === 404)) setHidden(true);
      else setError(err instanceof Error ? err.message : String(err));
    });
    return () => { controller.abort(); generation.current++; };
  }, [agentId, reload]);
  const report = useRef(onState); report.current = onState;
  useEffect(() => { report.current?.({ state, hidden, error }); }, [state, hidden, error]);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => popup.current?.querySelector<HTMLElement>('[role^="menuitem"]:not(:disabled)')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, state]);
  if (hidden) return null;
  const chat = state?.chat;
  const summary = state ? voiceRouteSummary(chat, state) : error ? `Настройки голоса недоступны: ${error}` : 'Загрузка настроек голоса…';
  const unconfigured = !chat || chat.status === 'unconfigured';
  const choose = async (route: string | null) => {
    if (!state || saving || disabled) return;
    if (route === null ? chat?.source !== 'override' : chat?.source === 'override' && chat.route === route) { setOpen(false); return; }
    setSaving(true); setError(''); const current = ++generation.current;
    try {
      const next = route === null ? await clearVoiceChatRoute(state.csrfToken, agentId) : await setVoiceChatRoute(state.csrfToken, agentId, route);
      if (generation.current === current) { setState(s => s && { ...s, chat: next }); setOpen(false); }
    } catch (err) { if (generation.current === current) setError(err instanceof Error ? err.message : String(err)); }
    finally { setSaving(false); }
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = [...(popup.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? [])];
    if (!items.length) return;
    event.preventDefault(); const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
    items[next].focus();
  };
  const fallback = state?.routes.find(r => r.route === state.defaultRoute.route);
  return <Popover.Root open={open} onOpenChange={value => { setOpen(value); if (value) setReload(n => n + 1); }}>
    <Popover.Trigger render={<button type="button" className="voice-route-trigger" data-state={unconfigured ? 'unconfigured' : chat?.status} aria-label={`Маршрут голосового ввода. ${summary}`} title={summary} disabled={disabled} />}>
      <AudioLines size={14} strokeWidth={1.25} aria-hidden="true" />
      {chat?.source === 'override' && <span className="voice-route-dot" aria-hidden="true" />}
    </Popover.Trigger>
    <Popover.Portal><Popover.Positioner side="top" align="end" sideOffset={8} collisionPadding={12} className="floating-positioner">
      <Popover.Popup ref={popup} className="model-picker-menu voice-route-menu" aria-label="Голосовой ввод" aria-busy={saving || !state} onKeyDown={keyboard}>
        <p className="voice-route-summary" role="status">{summary}</p>
        {state && state.routes.length > 0 && <div role="menu" aria-label="Голосовой маршрут чата" className="model-picker-scroll">
          <button type="button" role="menuitemradio" aria-checked={chat?.source !== 'override'} className="model-picker-option" disabled={saving || disabled} onClick={() => void choose(null)}>
            <span className="model-picker-option-text"><span>По умолчанию</span><span className="model-picker-option-source">{fallback ? `${fallback.label} · ${fallback.accountName}` : state.defaultRoute.route ? 'недоступен' : 'не выбран'}</span></span>
            <span className="model-picker-check">{chat?.source !== 'override' && <Check size={16} strokeWidth={1} />}</span>
          </button>
          {state.routes.map(option => { const checked = chat?.source === 'override' && chat.route === option.route; return <button type="button" role="menuitemradio" key={option.route} aria-checked={checked} className="model-picker-option" aria-description={destinationText(option.destination)} title={option.route} disabled={saving || disabled} onClick={() => void choose(option.route)}>
            <span className="model-picker-option-text"><span>{option.label}</span><span className="model-picker-option-source">{option.accountName} · {option.destination.label}</span></span>
            <span className="model-picker-check">{checked && <Check size={16} strokeWidth={1} />}</span>
          </button>; })}
        </div>}
        <div role="menu" aria-label="Настройки голоса"><button type="button" role="menuitem" className="model-picker-cell" onClick={() => { setOpen(false); openVoiceSettings(); }}><Settings size={14} strokeWidth={1} aria-hidden="true" /><span>{unconfigured && !state?.routes.length ? 'Настроить голосовой ввод' : 'Настройки голоса'}</span></button></div>
        {error && <p className="model-picker-error" role="alert">{error}</p>}
      </Popover.Popup>
    </Popover.Positioner></Popover.Portal>
  </Popover.Root>;
}
