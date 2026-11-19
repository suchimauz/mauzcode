import { useCallback, useId, useRef, useState, type MutableRefObject } from 'react';
import { AudioWaveform, Mic } from 'lucide-react';
import { useVoiceCapture, type VoiceCapture, type VoicePhraseEvent } from '../../hooks/useVoiceCapture';
import type { VoiceChatRoute } from '../../lib/voice';
import type { VoiceSupport } from '../../lib/voiceCapture';
import { VoiceRoutePicker, voiceRouteSummary, type VoiceRouteView } from './VoiceRoutePicker';
import './voice-route-picker.css';

/** The two independent voice entry points of an editable chat composer. */
export type VoiceEntryMode = 'inline' | 'panel';
export type ReadyVoiceRoute = Extract<VoiceChatRoute, { status: 'ready' }>;
/**
 * Consumer of one entry point. Activation hands it the composer's single capture controller; the consumer decides
 * when to `start`/`finish`/`cancel`. Phrase events of a session started through this entry point go only to its
 * `onPhrase`, so speech is never captured without a consumer and never delivered to the other mode.
 */
export type VoiceEntryHandler = {
  onActivate: (capture: VoiceCapture, route: ReadyVoiceRoute) => void;
  onPhrase: (event: VoicePhraseEvent) => void;
  /**
   * The mode is engaged even while capture is paused, idle or failed (the voice panel stays open). Its own control
   * then stays pressed and operable (activation means leave), and the other entry point stays blocked.
   */
  active?: boolean;
};
export type VoiceEntryHandlers = Partial<Record<VoiceEntryMode, VoiceEntryHandler>>;

/**
 * The composer's single capture controller plus phrase routing to the entry point that started it. A composer that
 * renders its own view of capture state (the voice panel) owns the hub and passes it to `VoiceEntryControls`;
 * otherwise the controls create one. There is never a second controller or socket per chat composer.
 */
export type VoiceEntryHub = {
  capture: VoiceCapture;
  owner: VoiceEntryMode | null;
  claim: (mode: VoiceEntryMode) => void;
  /** Latest consumers; phrase events of a session go only to the claiming mode's `onPhrase`. */
  handlers: MutableRefObject<VoiceEntryHandlers>;
};

export function useVoiceEntryHub({ agentId, readOnly = false }: { agentId: string; readOnly?: boolean }): VoiceEntryHub {
  const [owner, setOwner] = useState<VoiceEntryMode | null>(null);
  const ownerRef = useRef<VoiceEntryMode | null>(null);
  const handlers = useRef<VoiceEntryHandlers>({});
  const onPhrase = useCallback((event: VoicePhraseEvent) => {
    const mode = ownerRef.current; if (mode) handlers.current[mode]?.onPhrase(event);
  }, []);
  const capture = useVoiceCapture({ agentId, readOnly, onPhrase });
  const claim = useCallback((mode: VoiceEntryMode) => { ownerRef.current = mode; setOwner(mode); }, []);
  return { capture, owner, claim, handlers };
}

const NAMES: Record<VoiceEntryMode, string> = { inline: 'Голосовой ввод в поле сообщения', panel: 'Голосовой режим' };
const SUPPORT: Record<Exclude<VoiceSupport, { ok: true }>['reason'], string> = {
  insecure: 'Микрофон доступен только по HTTPS или на localhost.',
  unsupported: 'Браузер не поддерживает захват звука: нужны доступ к микрофону и AudioWorklet.',
};

/** Why an entry point cannot be activated now, or null when it can. Never touches the microphone. */
export function voiceEntryBlock({ support, view, handler, busy, otherActive }: {
  support: VoiceSupport; view: VoiceRouteView | null; handler?: VoiceEntryHandler; busy: boolean; otherActive: boolean;
}): string | null {
  if (!support.ok) return SUPPORT[support.reason];
  const chat = view?.state?.chat;
  if (!view?.state) return view?.error ? `Настройки голоса недоступны: ${view.error}` : 'Загрузка настроек голоса…';
  if (!chat || chat.status !== 'ready') return voiceRouteSummary(chat, view.state);
  if (!handler) return 'Этот режим голосового ввода пока недоступен.';
  if (otherActive) return 'Сначала завершите текущий голосовой ввод.';
  if (busy) return 'Подождите завершения текущего действия.';
  return null;
}

/**
 * Footer voice group placed right after the context meter: inline voice input, voice mode, then the route selector.
 * One `useVoiceCapture` and the selector's single settings request serve all three; nothing on render, focus or a
 * blocked activation requests the microphone or opens a socket. Disabled entry points stay focusable
 * (`aria-disabled`) so keyboard and screen-reader users hear the reason and the audio destination before activating.
 */
type VoiceEntryControlsProps = { agentId: string; busy?: boolean; handlers?: VoiceEntryHandlers; hub?: VoiceEntryHub };
export function VoiceEntryControls(props: VoiceEntryControlsProps) {
  return props.hub ? <EntryControls {...props} hub={props.hub} /> : <OwnHubControls {...props} />;
}
function OwnHubControls(props: VoiceEntryControlsProps) {
  const hub = useVoiceEntryHub({ agentId: props.agentId });
  return <EntryControls {...props} hub={hub} />;
}
function EntryControls({ agentId, busy = false, handlers = {}, hub }: VoiceEntryControlsProps & { hub: VoiceEntryHub }) {
  const [view, setView] = useState<VoiceRouteView | null>(null);
  /** Route of the session started through an entry point; a stop must not depend on the selector's later state. */
  const lastReady = useRef<ReadyVoiceRoute | null>(null);
  hub.handlers.current = handlers;
  const { capture, owner } = hub;
  const id = useId();
  if (view?.hidden) return null;
  const engaged = (Object.keys(handlers) as VoiceEntryMode[]).find(mode => handlers[mode]?.active) ?? null;
  const active = engaged ?? (capture.state !== 'idle' && capture.state !== 'error' ? owner : null);
  const chat = view?.state?.chat;
  const destination = view?.state ? voiceRouteSummary(chat, view.state) : '';
  const button = (mode: VoiceEntryMode, Icon: typeof Mic) => {
    const handler = handlers[mode];
    // The running mode's own control stays operable so the user can always stop it, even while the composer is busy.
    const stopping = active === mode && !!handler && !!lastReady.current;
    const block = stopping ? null : voiceEntryBlock({ support: capture.support, view, handler, busy, otherActive: active !== null && active !== mode });
    const description = [block, block === destination ? '' : destination].filter(Boolean).join(' ');
    const activate = () => {
      if (stopping) { handler!.onActivate(capture, lastReady.current!); return; }
      if (block || !handler || chat?.status !== 'ready') return;
      hub.claim(mode); lastReady.current = chat;
      handler.onActivate(capture, chat);
    };
    return <button type="button" className="voice-route-trigger voice-entry" data-mode={mode} aria-label={NAMES[mode]} aria-describedby={`${id}-${mode}`}
      aria-disabled={block ? true : undefined} aria-pressed={active === mode} title={description ? `${NAMES[mode]}. ${description}` : NAMES[mode]} onClick={activate}>
      <Icon size={14} strokeWidth={1.25} aria-hidden="true" />
      <span id={`${id}-${mode}`} className="sr-only">{description}</span>
    </button>;
  };
  return <div className="voice-entry-group" role="group" aria-label="Голос">
    {button('inline', Mic)}
    {button('panel', AudioWaveform)}
    <VoiceRoutePicker key={agentId} agentId={agentId} disabled={busy || active !== null} onState={setView} />
  </div>;
}
