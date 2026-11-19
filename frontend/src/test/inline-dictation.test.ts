import { describe, expect, it } from 'vitest';
import { DraftDictation, InlineDictation, textChange } from '../lib/inlineDictation';
import type { VoicePhraseEvent } from '../hooks/useVoiceCapture';

// Task 3.4: pure span bookkeeping behind inline dictation in both editors.
const phrase = (id: string, order: number, revision: number, text: string, final = false, generation = 1): VoicePhraseEvent =>
  ({ type: 'phrase', generation, id, order, revision, text, final });

/** Feed events in sequence, carrying the draft like the composer does. */
function run(session: InlineDictation, draft: string, events: VoicePhraseEvent[]) {
  for (const event of events) draft = session.apply(event, draft, null)?.text ?? draft;
  return draft;
}

describe('textChange', () => {
  it('finds the single changed region', () => {
    expect(textChange('abc', 'abXc')).toEqual({ at: 2, oldEnd: 2, newEnd: 3 });
    expect(textChange('abcd', 'ad')).toEqual({ at: 1, oldEnd: 3, newEnd: 1 });
  });
});

describe('InlineDictation', () => {
  it('inserts at the caret between existing words, replacing partials, with single spaces', () => {
    const s = new InlineDictation('Hello world', { start: 5, end: 5 }, 0);
    let draft = run(s, 'Hello world', [phrase('a', 0, 0, 'big')]);
    expect(draft).toBe('Hello big world');
    draft = run(s, draft, [phrase('a', 0, 1, 'big blue'), phrase('a', 0, 2, 'big blue', true)]);
    expect(draft).toBe('Hello big blue world');
  });

  it('places phrases by order, not arrival, and finals do not duplicate', () => {
    const s = new InlineDictation('A  B', { start: 2, end: 2 }, 0);
    const draft = run(s, 'A  B', [
      phrase('p2', 1, 0, 'two'), phrase('p1', 0, 0, 'one'), phrase('p3', 2, 0, 'three'),
      phrase('p2', 1, 1, 'two!', true), phrase('p1', 0, 1, 'one.', true), phrase('p1', 0, 2, 'late dup', true),
      phrase('p3', 2, 1, 'three?', true),
    ]);
    expect(draft).toBe('A one. two! three? B');
  });

  it('ignores stale revisions', () => {
    const s = new InlineDictation('', null, 0);
    const draft = run(s, '', [phrase('a', 0, 3, 'newest'), phrase('a', 0, 1, 'older'), phrase('a', 0, 3, 'repeat')]);
    expect(draft).toBe('newest');
  });

  it('a manual edit inside a phrase wins over a late correction', () => {
    const s = new InlineDictation('x', { start: 1, end: 1 }, 0);
    let draft = run(s, 'x', [phrase('a', 0, 0, 'helo wrld')]);
    expect(draft).toBe('x helo wrld');
    draft = draft.replace('helo', 'hello'); s.observe(draft);
    expect(s.apply(phrase('a', 0, 1, 'hello world', true), draft, null)).toBeNull();
    // The next phrase still lands after the edited one.
    draft = run(s, draft, [phrase('b', 1, 0, 'again')]);
    expect(draft).toBe('x hello wrld again');
  });

  it('typing outside dictated spans only shifts them', () => {
    const s = new InlineDictation('start end', { start: 5, end: 5 }, 0);
    let draft = run(s, 'start end', [phrase('a', 0, 0, 'mid')]);
    expect(draft).toBe('start mid end');
    draft = 'NEW ' + draft; s.observe(draft);
    draft = draft + '!'; s.observe(draft);
    draft = run(s, draft, [phrase('a', 0, 1, 'middle', true)]);
    expect(draft).toBe('NEW start middle end!');
  });

  it('a selection is never replaced: dictation starts after it', () => {
    const s = new InlineDictation('keep this text', { start: 5, end: 9 }, 0);
    expect(run(s, 'keep this text', [phrase('a', 0, 0, 'safe', true)])).toBe('keep this safe text');
  });

  it('drops events of earlier sessions, other generations and after close', () => {
    const s = new InlineDictation('t', null, 2);
    expect(s.apply(phrase('old', 0, 0, 'old', true, 2), 't', null)).toBeNull();
    expect(s.apply(phrase('a', 0, 0, 'new', false, 3), 't', null)?.text).toBe('t new');
    expect(s.apply(phrase('b', 1, 0, 'other', false, 4), 't new', null)).toBeNull();
    s.close();
    expect(s.apply(phrase('a', 0, 1, 'late', true, 3), 't new', null)).toBeNull();
  });

  it('a failed phrase removes only its own unedited partial', () => {
    const s = new InlineDictation('a b', { start: 1, end: 1 }, 0);
    let draft = run(s, 'a b', [phrase('p', 0, 0, 'oops')]);
    expect(draft).toBe('a oops b');
    draft = s.apply({ type: 'phraseFailed', generation: 1, id: 'p', order: 0, reason: 'x' }, draft, null)?.text ?? draft;
    expect(draft).toBe('a b');
  });

  it('maps the caret: before stays, after moves with inserted text', () => {
    const s = new InlineDictation('ab cd', { start: 2, end: 2 }, 0);
    const result = s.apply(phrase('a', 0, 0, 'X'), 'ab cd', { start: 4, end: 4 });
    expect(result).toEqual({ text: 'ab X cd', selection: { start: 6, end: 6 } });
    const back = s.apply(phrase('a', 0, 1, 'XYZ'), result!.text, { start: 1, end: 1 });
    expect(back).toEqual({ text: 'ab XYZ cd', selection: { start: 1, end: 1 } });
  });
});

// Task 3.5: the voice panel's selective clear and its multi-session bookkeeping.
describe('InlineDictation.clear', () => {
  it('removes only phrases it still owns, keeps typed and corrected text, and works after close', () => {
    const s = new InlineDictation('Keep end', { start: 4, end: 4 }, 0);
    let draft = run(s, 'Keep end', [phrase('a', 0, 0, 'one', true), phrase('b', 1, 0, 'two', true)]);
    expect(draft).toBe('Keep one two end');
    draft = draft.replace('two', 'TWO'); // manual correction detaches phrase b
    s.close();
    expect(s.owned).toBe(true);
    expect(s.clear(draft)).toBe('Keep TWO end');
    expect(s.owned).toBe(false);
    expect(s.lastEdits).toEqual([{ at: 4, oldEnd: 8, insert: '' }]);
  });

  it('ignores later revisions of cleared phrases but places new ones', () => {
    const s = new InlineDictation('', null, 0);
    let draft = run(s, '', [phrase('a', 0, 0, 'gone')]);
    draft = s.clear(draft);
    expect(draft).toBe('');
    expect(run(s, draft, [phrase('a', 0, 1, 'gone again', true), phrase('b', 1, 0, 'next', true)])).toBe('next');
  });

  it('end is after the last phrase in core order, else the start point', () => {
    const s = new InlineDictation('x y', { start: 1, end: 1 }, 0);
    expect(s.end).toBe(1);
    run(s, 'x y', [phrase('b', 1, 0, 'B', true), phrase('a', 0, 0, 'A', true)]);
    expect(s.end).toBe('x A B'.length);
  });

  it('edit replays an exact change from another session even with repeated words', () => {
    const first = new InlineDictation('go', null, 0);
    const draft = run(first, 'go', [phrase('a', 0, 0, 'go', true)]); // "go go": a diff could not tell which one changed
    const second = new InlineDictation(draft, null, 1);
    const next = run(second, draft, [phrase('b', 0, 0, 'go', true, 2)]);
    for (const change of second.lastEdits) first.edit(change);
    expect(next).toBe('go go go');
    expect(first.clear(next)).toBe('go go');
    for (const change of first.lastEdits) second.edit(change);
    expect(second.clear('go go')).toBe('go');
  });
});

describe('DraftDictation', () => {
  it('owns phrases of stopped sessions until clear; manual edits detach only the touched phrase; closed sessions stay closed', () => {
    const draft = new DraftDictation();
    const first = draft.begin('Typed', null, 0);
    let text = 'Typed';
    for (const e of [phrase('a', 0, 0, 'one', true), phrase('b', 1, 0, 'two', true)]) text = draft.apply(first, e, text, null)?.text ?? text;
    first.close();
    expect(text).toBe('Typed one two');
    text = 'Typed one TWO'; draft.observe(text);
    expect(draft.apply(first, phrase('c', 2, 0, 'late', true), text, null)).toBeNull();
    const second = draft.begin(text, { start: 5, end: 5 }, 1);
    text = draft.apply(second, phrase('x', 0, 0, 'mid', true, 2), text, null)!.text;
    expect(text).toBe('Typed mid one TWO');
    expect(draft.owned).toBe(true);
    text = draft.clear(text);
    expect(text).toBe('Typed TWO');
    expect(draft.owned).toBe(false);
  });

  it('reset forgets every phrase and closes the running session', () => {
    const draft = new DraftDictation();
    const s = draft.begin('', null, 0);
    const text = draft.apply(s, phrase('a', 0, 0, 'sent'), '', null)!.text;
    draft.reset();
    expect(s.isClosed).toBe(true);
    expect(draft.owned).toBe(false);
    expect(draft.clear(text)).toBe(text);
  });
});
