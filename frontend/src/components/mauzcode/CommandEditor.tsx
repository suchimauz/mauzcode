import { EditorCaret } from './EditorCaret';
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type AriaAttributes, type FocusEventHandler, type KeyboardEventHandler } from 'react';
import './command-editor.css';

/** `selection` is the plain-text selection inside the editor, else null; `select` moves it only while focused. */
export type CommandEditorHandle = { focus(): void; selectionStart(): number; selection(): { start: number; end: number } | null; select(start: number, end: number): void };
export type CommandEditorProps = Pick<AriaAttributes, 'aria-label' | 'aria-controls' | 'aria-expanded' | 'aria-activedescendant' | 'aria-autocomplete' | 'aria-haspopup'> & {
  value: string;
  onChange(value: string): void;
  claimedCommand: { name: string } | null;
  onRelease(): void;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  onBlur?: FocusEventHandler<HTMLDivElement>;
  onFiles?: (files: File[]) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

// Browsers add placeholder breaks so an empty block has a line box: the last child of a block
// (`<div><br></div>` from a native paragraph) or the lone break left by select-all + delete. They are not text.
const placeholderBreak = (node: Node) => !node.nextSibling && node.parentNode instanceof Element && /^(DIV|P)$/.test(node.parentNode.nodeName) && node.parentNode.getAttribute('role') !== 'textbox';
function walk(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node instanceof Element && node.hasAttribute('data-editor-tail')) return '';
  if (node.nodeName === 'BR') return placeholderBreak(node) ? '' : '\n';
  let text = '';
  node.childNodes.forEach((child, index) => {
    if (index && /^(DIV|P)$/.test(child.nodeName) && !text.endsWith('\n')) text += '\n';
    text += walk(child);
  });
  return text;
}
// Only text and explicit line breaks cross the editor boundary, never clipboard HTML.
// An editor or fragment without any text content is always the empty draft.
function plain(node: Node): string {
  if (node.nodeType !== Node.TEXT_NODE && !node.textContent) return '';
  return walk(node);
}
function offsets(root: HTMLElement): [number, number] {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return [plain(root).length, plain(root).length];
  const range = selection.getRangeAt(0);
  const before = range.cloneRange();
  before.selectNodeContents(root); before.setEnd(range.startContainer, range.startOffset);
  const start = plain(before.cloneContents()).length;
  return [start, start + plain(range.cloneContents()).length];
}
/** Place the range boundary at a plain-text offset; returns false past the end. */
function boundary(root: HTMLElement, range: Range, offset: number, edge: 'start' | 'end') {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (offset <= length) {
      const chip = node.parentElement?.closest('[data-composer-command]');
      // At the very end after a final newline, sit before the tail break: that position is on the new line.
      const next = node.nextSibling;
      const tail = offset === length && node.textContent?.endsWith('\n') && next instanceof Element && next.hasAttribute('data-editor-tail') ? next : null;
      if (edge === 'start') { if (chip) range.setStartAfter(chip); else if (tail) range.setStartBefore(tail); else range.setStart(node, offset); }
      else if (chip) range.setEndAfter(chip); else range.setEnd(node, offset);
      return true;
    }
    offset -= length; node = walker.nextNode();
  }
  return false;
}
function caret(root: HTMLElement, offset: number, end = offset) {
  const range = document.createRange();
  if (boundary(root, range, offset, 'start')) {
    if (end <= offset || !boundary(root, range, end, 'end')) range.collapse(true);
    window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range); return;
  }
  range.selectNodeContents(root); range.collapse(false);
  window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range);
}

/** Controlled canonical plain text with an explicitly claimed, indivisible leading command. */
export const CommandEditor = forwardRef<CommandEditorHandle, CommandEditorProps>(function CommandEditor({ value, onChange, claimedCommand, onRelease, onKeyDown, onBlur, onFiles, disabled, placeholder, className = '', ...aria }, ref) {
  const root = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const selected = useRef(false);
  const released = useRef(false);
  const previousClaim = useRef(claimedCommand);
  const pendingCaret = useRef<number | null>(null);
  const token = claimedCommand ? `/${claimedCommand.name}` : '';
  if (previousClaim.current !== claimedCommand) { previousClaim.current = claimedCommand; released.current = false; }
  const validClaim = !!token && (value === token || value.startsWith(`${token} `) || value.startsWith(`${token}\n`));
  const release = () => { if (!released.current && claimedCommand) { released.current = true; onRelease(); } };
  const selectChip = (active: boolean) => {
    selected.current = active;
    const chip = root.current?.querySelector('[data-composer-command]');
    if (active) chip?.setAttribute('data-selected', 'true'); else chip?.removeAttribute('data-selected');
  };
  const paint = (text: string, claim: boolean, position?: number) => {
    const el = root.current; if (!el) return;
    el.replaceChildren();
    if (claim) {
      const chip = document.createElement('span');
      chip.className = 'command-chip'; chip.contentEditable = 'false';
      chip.setAttribute('data-composer-command', claimedCommand!.name); chip.textContent = token;
      el.append(chip, document.createTextNode(text.slice(token.length)));
    } else el.append(document.createTextNode(text));
    // A final newline alone has no line box in contenteditable. This non-value
    // break makes the next line (and its caret) visible on the first Enter.
    if (text.endsWith('\n')) {
      const tail = document.createElement('br'); tail.setAttribute('data-editor-tail', ''); el.append(tail);
    }
    el.dataset.empty = String(!text);
    selectChip(false);
    if (position !== undefined) caret(el, position);
  };
  const commit = (text: string, position: number, claim = validClaim && !released.current) => {
    pendingCaret.current = position;
    paint(text, claim, position);
    onChange(text);
  };
  useImperativeHandle(ref, () => ({
    focus: () => root.current?.focus({ preventScroll: true }),
    selectionStart: () => root.current ? offsets(root.current)[0] : 0,
    selection: () => {
      const el = root.current; const selection = window.getSelection();
      if (!el || !selection?.rangeCount || !el.contains(selection.anchorNode) || !el.contains(selection.focusNode)) return null;
      const [start, end] = offsets(el); return { start, end };
    },
    select: (start, end) => { if (root.current && document.activeElement === root.current) caret(root.current, start, end); },
  }));
  useLayoutEffect(() => {
    if (composing.current || !root.current) return;
    const el = root.current;
    const hasChip = !!el.querySelector('[data-composer-command]');
    const claim = validClaim && !released.current;
    const currentPosition = document.activeElement === el ? offsets(el)[0] : undefined;
    if (plain(el) !== value || hasChip !== claim || (claim && el.querySelector('[data-composer-command]')?.textContent !== token)) {
      paint(value, claim, pendingCaret.current ?? (claim && !hasChip ? value.length : currentPosition));
    }
    pendingCaret.current = null;
    if (claimedCommand && !validClaim) release();
  });
  const insert = (text: string) => {
    const el = root.current!;
    let [start, end] = offsets(el);
    const current = plain(el);
    if (selected.current) { start = 0; end = token.length; }
    if (validClaim && (start < token.length || end < token.length)) release();
    selectChip(false);
    commit(current.slice(0, start) + text + current.slice(end), start + text.length);
  };
  // React's onBeforeInput is synthetic and has no inputType. Touch keyboards send Enter as keyCode 229, so the
  // keydown path skips it and the browser would insert a native paragraph (`<div><br></div>`) instead.
  const lineBreak = useRef<(event: InputEvent) => void>(() => {});
  lineBreak.current = event => {
    if (disabled || composing.current || event.isComposing) return;
    if (event.inputType !== 'insertParagraph' && event.inputType !== 'insertLineBreak') return;
    event.preventDefault(); insert('\n');
  };
  useLayoutEffect(() => {
    const el = root.current; if (!el) return;
    const listener = (event: Event) => lineBreak.current(event as InputEvent);
    el.addEventListener('beforeinput', listener);
    return () => el.removeEventListener('beforeinput', listener);
  }, []);
  const removeChip = () => {
    const current = plain(root.current!);
    release(); selectChip(false);
    const rest = current.slice(token.length).replace(/^ /, '');
    commit(rest, 0, false);
  };
  return <><div {...aria} ref={root} className={`command-editor ${className}`} role="textbox" aria-multiline="true" aria-disabled={disabled || undefined}
    contentEditable={!disabled} suppressContentEditableWarning tabIndex={disabled ? -1 : 0} data-placeholder={placeholder} data-empty={!value}
    onBlur={onBlur}
    onCompositionStart={() => { composing.current = true; selectChip(false); }}
    onCompositionEnd={() => { composing.current = false; const el = root.current!; const text = plain(el); if (validClaim && (!text.startsWith(token) || el.firstChild !== el.querySelector('[data-composer-command]'))) release(); el.dataset.empty = String(!text); onChange(text); }}
    onInput={() => {
      if (disabled || composing.current) return;
      const el = root.current!; const text = plain(el);
      if (validClaim && (!text.startsWith(token) || el.firstChild !== el.querySelector('[data-composer-command]'))) release();
      selectChip(false);
      // Clearing everything leaves browser placeholder nodes (a lone `<br>`); drop them so the draft is truly empty.
      if (!text && el.childNodes.length) el.replaceChildren();
      // A native paragraph that slipped through (`hi<div><br></div>`) is repainted from the canonical text at once,
      // so the new line and its caret are visible before any further typing.
      else if (el.querySelector('div, p')) {
        const [position] = offsets(el); const claim = validClaim && !released.current && text.startsWith(token) && el.firstChild === el.querySelector('[data-composer-command]');
        commit(text, position, claim); return;
      }
      el.dataset.empty = String(!text); onChange(text);
    }}
    onBeforeInput={event => {
      if (disabled || composing.current || (event.nativeEvent as InputEvent).isComposing) return;
      if (selected.current) { event.preventDefault(); insert((event.nativeEvent as InputEvent).data ?? event.data ?? ''); }
      else if (validClaim && offsets(root.current!)[0] < token.length) { const position = offsets(root.current!)[0]; release(); paint(plain(root.current!), false, position); }
    }}
    onKeyDown={event => {
      if (disabled) { event.preventDefault(); return; }
      if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
      const el = root.current!; const [start, end] = offsets(el);
      if (validClaim && !released.current && event.key === 'Backspace' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        if (selected.current) { event.preventDefault(); removeChip(); }
        else if (start === end && (start === token.length || (start === token.length + 1 && plain(el)[token.length] === ' '))) {
          event.preventDefault();
          if (start > token.length) commit(plain(el).slice(0, token.length) + plain(el).slice(start), token.length);
          else selectChip(true);
        }
      } else if (selected.current && event.key === 'Delete') { event.preventDefault(); removeChip(); }
      else if (selected.current && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); insert(event.key); }
      else if (!event.metaKey && !event.ctrlKey && !['Shift', 'Alt', 'Control', 'Meta'].includes(event.key)) selectChip(false);
      onKeyDown?.(event);
      if (!event.defaultPrevented && event.key === 'Enter') { event.preventDefault(); insert('\n'); }
    }}
    onKeyUp={event => {
      if (['ArrowLeft', 'Home'].includes(event.key) && validClaim && !selected.current && offsets(root.current!)[0] === 0) { release(); paint(plain(root.current!), false, 0); }
    }}
    onPointerDown={() => selectChip(false)}
    onCopy={event => {
      const [start, end] = offsets(root.current!);
      event.preventDefault(); event.clipboardData.setData('text/plain', selected.current ? token : plain(root.current!).slice(start, end));
    }}
    onCut={event => {
      if (disabled) return;
      const [start, end] = offsets(root.current!);
      event.preventDefault(); event.clipboardData.setData('text/plain', selected.current ? token : plain(root.current!).slice(start, end));
      if (selected.current) removeChip(); else insert('');
    }}
    onPaste={event => {
      event.preventDefault(); if (disabled) return;
      const files = Array.from(event.clipboardData.files ?? []);
      if (files.length && onFiles) { onFiles(files); return; }
      insert(event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n'));
    }}
    onDragStart={event => event.preventDefault()}
    onDrop={event => {
      if (event.dataTransfer.files.length) return; // The owning form handles file drops.
      event.preventDefault(); if (!disabled) insert(event.dataTransfer.getData('text/plain'));
    }}
  /><EditorCaret input={root} value={value} /></>;
});
