import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import type { DraftCaretHandle } from '../components/mauzcode/MessageInput';
import type { VoiceEntryHandler } from '../components/mauzcode/VoiceEntryControls';
import { DraftDictation, type DictationSelection, type InlineDictation } from '../lib/inlineDictation';
import type { VoiceCapture } from './useVoiceCapture';

export type UseInlineDictationOptions = {
  /** The composer's single draft; dictation never keeps a second buffer. */
  text: string;
  /** The composer's ordinary draft update (same path as typing). Never sends. */
  onText: (value: string) => void;
  /** Caret of the mounted editor, `CommandEditor` or `textarea`. */
  caret: RefObject<DraftCaretHandle | null>;
  /**
   * Phrase ownership of this draft, shared with the voice panel so its clear also removes unedited inline phrases.
   * Omitted: a ledger private to this hook (standalone editors).
   */
  dictation?: DraftDictation;
  /** Losing edit access stops applying phrases; already inserted text stays. */
  readOnly?: boolean;
};

export type InlineDictationController = {
  /** Consumer of the inline entry point for `VoiceEntryControls`. */
  handler: VoiceEntryHandler;
  /** Call from the editor's `onChange` before updating the draft so manual edits detach touched phrases. */
  observe: (value: string) => void;
};

/**
 * Inline dictation at the caret (task 3.4). The first explicit activation remembers the editor selection and starts
 * capture; the next one finishes, so the last phrase is finalized, and leaves the draft editable. Nothing here sends.
 */
export function useInlineDictation({ text, onText, caret, dictation, readOnly = false }: UseInlineDictationOptions): InlineDictationController {
  const latestText = useRef(text); latestText.current = text;
  const update = useRef(onText); update.current = onText;
  const locked = useRef(readOnly); locked.current = readOnly;
  const own = useRef<DraftDictation | null>(null);
  const ledger = dictation ?? (own.current ??= new DraftDictation());
  const session = useRef<InlineDictation | null>(null);
  const placeCaret = useRef<DictationSelection | null>(null);
  // Runs after the editors' own layout effects repaint the new value, so the mapped caret is the one that sticks.
  useLayoutEffect(() => {
    const selection = placeCaret.current; placeCaret.current = null;
    if (selection) caret.current?.select(selection.start, selection.end);
  });
  useEffect(() => { if (readOnly) { session.current?.close(); session.current = null; } }, [readOnly]);
  useEffect(() => () => { session.current?.close(); session.current = null; }, []);

  const activate = (capture: VoiceCapture) => {
    if (locked.current) return;
    const current = session.current;
    if (current && !current.isClosed && capture.state !== 'idle' && capture.state !== 'error') {
      // Stop: finalize the last phrase, keep the text, never send. Phrases keep applying until finish settles.
      void capture.finish().finally(() => { current.close(); if (session.current === current) session.current = null; });
      return;
    }
    current?.close();
    session.current = ledger.begin(latestText.current, caret.current?.selection() ?? null, capture.generation);
    void capture.start();
  };
  const handler: VoiceEntryHandler = {
    onActivate: capture => activate(capture),
    onPhrase: event => {
      const current = session.current; if (!current || locked.current) return;
      const result = ledger.apply(current, event, latestText.current, caret.current?.selection() ?? null);
      if (!result) return;
      placeCaret.current = result.selection;
      latestText.current = result.text;
      update.current(result.text);
    },
  };
  return { handler, observe: value => { ledger.observe(value); latestText.current = value; } };
}
