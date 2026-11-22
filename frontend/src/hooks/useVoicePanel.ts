import { useEffect, useRef, useState, type RefObject } from 'react';
import type { DraftCaretHandle } from '../components/mauzcode/MessageInput';
import type { VoiceEntryHandler } from '../components/mauzcode/VoiceEntryControls';
import type { DraftDictation, InlineDictation } from '../lib/inlineDictation';
import type { VoiceCapture } from './useVoiceCapture';

export type UseVoicePanelOptions = {
  /** The composer's single draft; the panel never keeps a second buffer. */
  text: string;
  /** The composer's ordinary draft update (same path as typing). Never sends. */
  onText: (value: string) => void;
  /** Caret of the hidden editor: entering voice mode starts dictation where the user left the caret. */
  caret: RefObject<DraftCaretHandle | null>;
  /** The composer's single capture controller (the same one inline dictation uses). */
  capture: VoiceCapture;
  /** Phrase ownership of this draft, shared with inline dictation; clear removes every unedited phrase in it. */
  dictation: DraftDictation;
  /** Synchronous ordinary send lock. Recognition may still finish, but controls must not edit the draft. */
  sendLock: RefObject<boolean>;
  /** Losing edit access closes the panel and stops capture; inserted text stays. */
  readOnly?: boolean;
};

export type VoicePanelController = {
  open: boolean;
  /** Consumer of the panel entry point for `VoiceEntryControls`; activation while open leaves the panel. */
  handler: VoiceEntryHandler;
  /** Mute/unmute a connected run, cancel setup, or explicitly start a new run when disconnected. */
  toggle: () => void;
  /** Remove the rightmost unedited dictated word in this draft. */
  deleteWord: () => void;
  /** Remove every unedited dictated phrase of this draft (panel and inline, any visit); typed text, corrections and attachments stay. */
  clear: () => void;
  /** True when `clear` would change the draft. */
  canClear: boolean;
  /** Stop capture and return to the ordinary editor with the visible text; never sends. */
  exit: () => void;
  /** Grows on every return to the editor; add to the editor's focus request so focus goes back to it. */
  returns: number;
};

/**
 * Dedicated voice mode (task 3.5): replaces the editor while open but edits the same draft through the composer's
 * ordinary update. Each capture generation has one session in the shared `DraftDictation` ledger, including while
 * muted: a late final still revises its original phrase. Leaving closes the session, so late events change nothing,
 * but its unedited phrases stay owned by the draft and a later clear (after Escape → editing → re-entry) removes them.
 * Explicit send and its finalization lock belong to the composer, not the panel.
 */
export function useVoicePanel({ text, onText, caret, capture, dictation, sendLock, readOnly = false }: UseVoicePanelOptions): VoicePanelController {
  const [open, setOpen] = useState(false);
  const [returns, setReturns] = useState(0);
  const isOpen = useRef(false);
  const latestText = useRef(text); latestText.current = text;
  const update = useRef(onText); update.current = onText;
  const cap = useRef(capture); cap.current = capture;
  const session = useRef<InlineDictation | null>(null);

  const startSession = () => {
    const c = cap.current; const previous = session.current;
    let selection = caret.current?.selection() ?? null;
    if (previous) {
      // An explicit new start (not unmute) continues after the previous run's last phrase.
      dictation.observe(latestText.current); previous.close();
      selection = { start: previous.end, end: previous.end };
    }
    session.current = dictation.begin(latestText.current, selection, c.generation);
    void c.start();
  };
  const close = (focusEditor: boolean) => {
    if (!isOpen.current) return;
    isOpen.current = false;
    // Stopped sessions stay in the draft's ledger (so clear still finds their phrases) but take no more events.
    session.current?.close(); session.current = null;
    cap.current.cancel();
    setOpen(false);
    if (focusEditor) setReturns(n => n + 1);
  };
  const toggle = () => {
    if (!isOpen.current || readOnly || sendLock.current) return;
    const c = cap.current;
    if (c.state === 'listening' || c.state === 'muted') c.setMuted(c.state === 'listening');
    else if (c.state === 'connecting') { session.current?.close(); c.cancel(); }
    else if (c.state === 'idle' || c.state === 'error') startSession();
  };
  const removeDictation = (amount: 'word' | 'all') => {
    if (!isOpen.current || readOnly || sendLock.current) return;
    const value = amount === 'word' ? dictation.deleteLastWord(latestText.current) : dictation.clear(latestText.current);
    if (value === latestText.current) return;
    latestText.current = value; update.current(value);
  };

  // Losing edit access closes the panel (capture is cancelled too); the inserted text stays.
  useEffect(() => { if (readOnly) close(false); }, [readOnly]);
  useEffect(() => {
    if (capture.state === 'idle' || capture.state === 'error') session.current?.close();
  }, [capture.state]);
  useEffect(() => () => { isOpen.current = false; session.current?.close(); session.current = null; }, []);

  const handler: VoiceEntryHandler = {
    active: open,
    onActivate: () => {
      if (isOpen.current) { close(true); return; }
      if (readOnly) return;
      isOpen.current = true; setOpen(true);
      startSession();
    },
    onPhrase: event => {
      const current = session.current; if (!current || !isOpen.current || readOnly) return;
      const result = dictation.apply(current, event, latestText.current, null);
      if (!result || result.text === latestText.current) return;
      latestText.current = result.text; update.current(result.text);
    },
  };
  return { open, handler, toggle, deleteWord: () => removeDictation('word'), clear: () => removeDictation('all'), canClear: open && dictation.owned, exit: () => close(true), returns };
}
