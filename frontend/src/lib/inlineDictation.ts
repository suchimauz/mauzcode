import type { VoicePhraseEvent } from '../hooks/useVoiceCapture';

/**
 * Inline dictation into the ordinary draft (task 3.4). Pure text bookkeeping shared by `CommandEditor` and the plain
 * `textarea`: the composer keeps its single `text` state and only asks this object how a phrase event or a manual
 * edit changes it. There is no second buffer and nothing here sends.
 *
 * - The session is anchored at the caret captured on the explicit start. A non-empty selection is never replaced:
 *   dictation starts after it, so activating the microphone cannot destroy text by itself.
 * - Each phrase owns one span `[start, end)` of the draft, keyed by phrase `id` and placed by core `order`, never by
 *   arrival time. A revision replaces only its own span; stale revisions and anything after the final are ignored,
 *   so partial → final never duplicates.
 * - A manual edit touching a span detaches it: later revisions of that phrase are dropped and the user's text wins.
 *   Text typed outside spans only shifts them. Surrounding text is never rewritten.
 * - Words are separated by one space; separators belong to the span and are recomputed on each revision.
 * - Events of an earlier or later generation, or after `close`, are dropped.
 */
export type DictationSelection = { start: number; end: number };
type Span = { id: string; order: number; start: number; end: number; revision: number; done: boolean; detached: boolean };
export type DictationResult = { text: string; selection: DictationSelection | null };
/** One exact change of the draft: `[at, oldEnd)` of the old text was replaced by `insert`. */
export type DraftEdit = { at: number; oldEnd: number; insert: string };

const space = (char: string | undefined) => char === undefined || /\s/.test(char);

/** Changed region between two texts: `[at, oldEnd)` in `before` became `[at, newEnd)` in `after`. */
export function textChange(before: string, after: string) {
  let at = 0;
  const limit = Math.min(before.length, after.length);
  while (at < limit && before[at] === after[at]) at++;
  let tail = 0;
  while (tail < limit - at && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  return { at, oldEnd: before.length - tail, newEnd: after.length - tail };
}

export class InlineDictation {
  private spans: Span[] = [];
  private anchor: number;
  private text: string;
  private generation: number | null = null;
  private closed = false;
  /** Exact regions changed by the last `apply`/`clear`, in order, so other sessions of the same draft stay in sync. */
  lastEdits: DraftEdit[] = [];

  /**
   * @param text the draft at the explicit start
   * @param selection the editor selection remembered at the explicit start; null means the end of the draft
   * @param minGeneration events of this generation or older belong to an earlier session and are dropped
   */
  constructor(text: string, selection: DictationSelection | null, private readonly minGeneration: number) {
    this.text = text;
    const end = selection ? Math.max(selection.start, selection.end) : text.length;
    this.anchor = Math.max(0, Math.min(text.length, end));
  }

  get isClosed() { return this.closed; }
  /** Drop every later event; applied text stays as ordinary editable draft text. */
  close() { this.closed = true; }

  /** Record a change of the draft not made by `apply` (typing, paste, command menu); touched spans detach. */
  observe(next: string) {
    if (next === this.text) return;
    const { at, oldEnd, newEnd } = textChange(this.text, next);
    this.edit({ at, oldEnd, insert: next.slice(at, newEnd) }, next);
  }

  /**
   * Record a change whose exact region is known (another dictation session's edit of the same draft), avoiding the
   * ambiguity of diffing repeated characters. Spans it touches detach, like any edit made outside this session.
   */
  edit({ at, oldEnd, insert }: DraftEdit, next = this.text.slice(0, at) + insert + this.text.slice(oldEnd)) {
    if (next === this.text) return;
    const newEnd = at + insert.length;
    const delta = newEnd - oldEnd;
    const insertion = at === oldEnd;
    const mapStart = (x: number) => x < at ? x : x >= oldEnd ? x + delta : newEnd;
    const mapEnd = (x: number) => x <= at ? x : x >= oldEnd ? x + delta : newEnd;
    for (const span of this.spans) {
      const touched = insertion ? span.start < at && at < span.end : Math.max(at, span.start) < Math.min(oldEnd, span.end);
      if (touched) span.detached = true;
      span.start = mapStart(span.start);
      span.end = Math.max(span.start, mapEnd(span.end));
    }
    // Text typed at the start point before speech arrives stays before the dictation.
    this.anchor = mapStart(this.anchor);
    this.text = next;
  }

  /** Apply one phrase event to `current`, the composer's latest draft; null when nothing changes. */
  apply(event: VoicePhraseEvent, current: string, caret: DictationSelection | null): DictationResult | null {
    if (this.closed || event.generation <= this.minGeneration) return null;
    if (this.generation === null) this.generation = event.generation;
    if (event.generation !== this.generation) return null;
    this.observe(current);
    let span = this.spans.find(s => s.id === event.id);
    if (span && (span.detached || span.done)) return null;
    if (event.type === 'phraseFailed') {
      if (!span) return null;
      span.done = true;
      return this.replace(span, '', caret);
    }
    if (span && event.revision <= span.revision) return null;
    if (!span) {
      const at = this.position(event.order);
      span = { id: event.id, order: event.order, start: at, end: at, revision: -1, done: false, detached: false };
      this.spans.push(span);
    }
    span.revision = event.revision;
    if (event.final) span.done = true;
    return this.replace(span, event.text.trim().replace(/\s+/g, ' '), caret);
  }

  /** True while some phrase still owns non-empty text, i.e. `clear` would change the draft. */
  get owned() { return this.spans.some(s => !s.detached && s.end > s.start); }

  /** Where a continuation would go: after the last phrase in core order, else the start point. */
  get end() { return this.position(Number.MAX_SAFE_INTEGER); }

  /**
   * Remove every phrase this session still owns from `current` (the composer's latest draft) and return the new
   * draft. Phrases detached by a manual edit and all other text stay; cleared phrases ignore later revisions while
   * new phrases of a still-running session are inserted as usual. Works after `close`.
   */
  clear(current: string): string {
    this.observe(current);
    const edits: DraftEdit[] = [];
    for (const span of [...this.spans].sort((a, b) => b.start - a.start)) {
      if (span.detached) continue;
      span.done = true; span.detached = true;
      const { start, end } = span;
      if (this.replace(span, '', null)) edits.push({ at: start, oldEnd: end, insert: '' });
    }
    this.lastEdits = edits;
    return this.text;
  }

  /** A new phrase goes after the nearest earlier phrase, else before the nearest later one, else at the anchor. */
  private position(order: number) {
    let before: Span | undefined; let after: Span | undefined;
    for (const s of this.spans) {
      if (s.order < order && (!before || s.order > before.order)) before = s;
      if (s.order > order && (!after || s.order < after.order)) after = s;
    }
    return before ? before.end : after ? after.start : this.anchor;
  }

  private replace(span: Span, words: string, caret: DictationSelection | null): DictationResult | null {
    const { start, end } = span;
    const body = words ? `${space(this.text[start - 1]) ? '' : ' '}${words}${space(this.text[end]) ? '' : ' '}` : '';
    const old = this.text.slice(start, end);
    if (body === old) return null;
    const delta = body.length - old.length;
    for (const s of this.spans) {
      if (s !== span && s.start >= end && (s.start > start || s.order > span.order)) { s.start += delta; s.end += delta; }
    }
    if (this.anchor > start || (this.anchor === start && end > start)) this.anchor = this.anchor >= end ? this.anchor + delta : start + body.length;
    span.end = start + body.length;
    this.text = this.text.slice(0, start) + body + this.text.slice(end);
    this.lastEdits = [{ at: start, oldEnd: end, insert: body }];
    // A caret before or at the start of a replaced phrase stays put; one at or after its end moves with the text.
    const map = (x: number) => x < start || (x === start && end > start) ? x : x >= end ? x + delta : start + body.length;
    return { text: this.text, selection: caret ? { start: map(caret.start), end: map(caret.end) } : null };
  }
}

/**
 * Ownership of dictated phrases for one composer draft, shared by inline dictation and the voice panel. Every capture
 * session of the draft (inline or panel, any visit) stays registered after it stops, so "Clear dictation" removes all
 * phrases of this draft that the user has not edited — also after Escape → editing → re-entering. Stopped sessions take
 * no more events (`close`); they only keep tracking where their phrases are. The exact region one session changes is
 * replayed into the others, so repeated words never confuse their mapping. `reset` forgets everything when the draft
 * is submitted; another chat has its own composer and therefore its own ledger.
 */
export class DraftDictation {
  private sessions: InlineDictation[] = [];

  /** Register a new session of this draft, anchored at `selection` of `text`. */
  begin(text: string, selection: DictationSelection | null, minGeneration: number): InlineDictation {
    this.observe(text);
    this.sessions = this.sessions.filter(session => !session.isClosed || session.owned);
    const session = new InlineDictation(text, selection, minGeneration);
    this.sessions.push(session);
    return session;
  }

  /** Record a change of the draft not made by dictation (typing, paste, command menu); touched phrases detach. */
  observe(text: string) { this.sessions.forEach(session => session.observe(text)); }

  /** Apply a phrase event through `session`; its exact change is replayed into the other sessions. */
  apply(session: InlineDictation, event: VoicePhraseEvent, current: string, caret: DictationSelection | null): DictationResult | null {
    this.observe(current);
    const result = session.apply(event, current, caret);
    if (result) this.replay(session);
    return result;
  }

  /** True while some phrase of this draft still owns unedited text, i.e. `clear` would change the draft. */
  get owned() { return this.sessions.some(session => session.owned); }

  /** Remove every unedited phrase of this draft from `current`; typed text and corrected phrases stay. */
  clear(current: string): string {
    this.observe(current);
    let text = current;
    for (const session of this.sessions) { text = session.clear(text); this.replay(session); }
    // Stopped sessions that own nothing any more can never change the draft again.
    this.sessions = this.sessions.filter(session => !session.isClosed || session.owned);
    return text;
  }

  /** Forget all phrases (the draft was submitted or the composer goes away); late events change nothing. */
  reset() { this.sessions.forEach(session => session.close()); this.sessions = []; }

  private replay(from: InlineDictation) {
    for (const change of from.lastEdits) this.sessions.forEach(session => { if (session !== from) session.edit(change); });
  }
}
