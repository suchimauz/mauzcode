# Design

## Context

- The layout reference is "variant 2" of the approved mockup, built from the project's real CSS (`tokens.css`, `message-input.css`, `composer-footer.css`, `model-picker.css`, `voice-route-picker.css`, `voice-panel.css`, `new-session.css`). The proposed CSS from that mockup is the starting point for the implementation.
- `MessageInput` renders `.message-input-row` as a flex row: `leading` (the add button) and `.message-input-field`. Every wrapped line therefore starts to the right of the button. Send is absolutely positioned in the bottom-right corner.
- `ComposerFooter` renders `.composer-controls` (model + voice capsule) and one `.composer-metrics` button inside a `HoverPanel` trigger. `NewSessionComposer` has its own `.new-session-footer` with the model picker.
- `VoicePanel` replaces the editor with its own bordered `section`; `LiveComposer` hides the footer and the status row while it is open.
- `CommandEditor` is a controlled `contenteditable`. It handles Enter itself (`insert('\n')`) and repaints the DOM with a single text node and, when the text ends with `\n`, a `<br data-editor-tail>` so the last line has a box. `EditorCaret` paints a custom caret and hides the native one with `caret-color: transparent` (`data-visual-caret`).

### Editor defects found (reproduced in Chromium against `CommandEditor` + `MessageInput`)

1. **Select-all + delete leaves a line.** With `hello\nworld`, Ctrl+A then Backspace leaves the DOM `<br>` (browser-generated) and the value `\n`, because `plain()` maps any `BR` to a newline and only the tail break carries `data-editor-tail`. `data-empty` is `false`, so the placeholder is hidden and the draft is not empty until the user deletes again.
2. **Touch keyboards: new line not visible.** Mobile keyboards send `keyCode 229`, so the keydown handler returns early and the browser runs its native `insertParagraph`. The DOM becomes `hi<div><br></div>`; `plain()` reads it as `hi\n\n` (two newlines) and the painted value does not match the DOM, and the custom caret is hidden (`visibility: hidden`) because the selection sits on the `DIV` with no client rect. The line and caret appear only after the next character repaints the editor.
3. **Shift+Enter caret lags on desktop.** After `insert('\n')` the repaint places the selection in the text node after the newline (`#text:6`), whose collapsed range has no client rect; `EditorCaret` falls back to the tail `<br>` only when the caret is at the end, and its measurement runs before layout settles in some browsers. The same offset in the middle of the text measures correctly. The user sees the caret stay on the old line until typing.

## Goals / Non-Goals

**Goals:**
- One input frame with an inner bar for live chat, new session and voice mode, on desktop and touch.
- Metrics row split into two hover targets sharing one panel.
- Deterministic line-break and clear behaviour in `CommandEditor`, covered by tests that run in a real browser engine.

**Non-Goals:**
- Changing the status row, planning badge, mascot placement or the context details panel content.
- Changing model-picker menus, voice routing, capture or send semantics.
- Changing the plain `textarea` path of `MessageInput` beyond the leading-slot layout.

## Decisions

1. **First-line-only add button.** `.message-input-row` becomes a block; the leading slot is absolutely positioned at the start of the first line, and the editor reserves room with `text-indent` (26 px fine pointer, 34 px coarse). The placeholder pseudo-element gets the same offset. Alternative considered: CSS `float` on the button — rejected because `contenteditable` caret placement around floats is inconsistent in Safari.
2. **Input bar as a `MessageInput` slot.** Add a `bar` prop to `MessageInput`, rendered after the text inside the form; send moves from absolute positioning into the bar's right end. `LiveComposer` and `NewSessionComposer` pass the model picker and voice controls into it. `ComposerFooter` keeps only the metrics row. Keeping the bar inside the form preserves the current drag-and-drop and focus-within border.
3. **Flat voice group.** `VoiceEntryControls` gets a `variant="flat"` (no `.voice-capsule` background); order and the accent-filled inline button are unchanged.
4. **Split metrics with one panel.** The metrics row renders two buttons (`usage`, `context`). One controlled `HoverPanel` state is shared; each button is a trigger anchored to the row's right edge, so the panel opens in the same place from either part. Only the hovered/focused part gets the hover background. The cache hit is never hidden by container queries; its text is the bare percentage and the accessible name keeps "cache hit".
5. **Voice mode inside the frame.** `VoicePanel` stops drawing its own border and renders into the `MessageInput` frame: transcript in the text area, controls in the bar, error line above the bar. `LiveComposer` keeps the status row and metrics row mounted in voice mode; it still hides notices, the inline voice error and the stop button. On a coarse pointer the model picker in the voice bar hides its label (icon + chevron only).
6. **Editor fixes.**
   - Treat Enter with `keyCode 229` and `beforeinput` events of type `insertParagraph` / `insertLineBreak` the same way: `preventDefault()` and call `insert('\n')`, so the DOM is always repainted from the canonical value (one newline, tail `<br>`).
   - In `plain()`, ignore a `BR` that is the only child of the editor or the last child of a block (browser placeholder breaks), and normalise the result so that an editor whose text content is empty yields `''`. After `input`, if the value is empty, repaint to an empty editor (no nodes) so `data-empty` is `true` and the placeholder shows.
   - After a repaint that ends at a line start, place the selection before the tail `<br>` (or at the start of the next text node) and schedule the caret measurement after layout (`requestAnimationFrame` after the commit) with the tail/line-start fallback used for every collapsed range without a client rect, not only at the end of the text.
7. **Tests in a real engine.** The jsdom tests cannot reproduce layout or native editing. Add a Chromium-backed browser test (the project's existing headless Chrome harness in `test/chrome/`) for Shift+Enter caret position, select-all delete and native `insertParagraph`, plus jsdom unit tests for `plain()` normalisation and the `beforeinput` path.

## Risks / Trade-offs

- `text-indent` only offsets the first line of the first block; a draft that starts with a newline gets an indented empty first line — acceptable, and it matches where the button is.
- Intercepting `insertParagraph` on mobile may interfere with IME composition; the handler must skip while `isComposing` is true and only act on the final event.
- Keeping the rows visible in voice mode changes an existing requirement; the composer height no longer jumps, but the voice frame is slightly shorter on phones than the old panel.
- Moving send into the bar changes its position for users used to the bottom-right corner on one-line drafts; it stays in the bottom-right corner of the frame.
