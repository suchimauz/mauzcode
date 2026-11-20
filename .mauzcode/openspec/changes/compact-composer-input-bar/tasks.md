# Tasks

## 1. Message editor fixes

- [ ] 1.1 Route Enter with `keyCode 229` and `beforeinput` `insertParagraph`/`insertLineBreak` (outside IME composition) through `CommandEditor`'s `insert('\n')`; verify with a jsdom test in `frontend/src/test/command-editor.test.tsx` that one newline is added and the DOM ends with the tail break.
- [ ] 1.2 Ignore browser placeholder `<br>` in `plain()` and repaint an empty editor when the value becomes empty; verify with jsdom tests that select-all + delete on `hello\nworld` and on `abc\n` yields value `''` and `data-empty="true"`.
- [ ] 1.3 Make `EditorCaret` place the caret at the line start after a line break anywhere in the text (tail/next-line fallback for any collapsed range without a client rect, measured after layout); verify with `frontend/src/test/input-caret.test.tsx`.
- [ ] 1.4 Add a headless-Chrome test (harness in `test/chrome/`) that types `hello`, presses Shift+Enter and checks the visible caret is on line 2; runs native `insertParagraph` and checks one newline and a visible caret; selects all and deletes and checks the placeholder is shown and the input is one line high. Verify the test passes.

## 2. Input frame and bar

- [ ] 2.1 Keep the add button on the first line only (block row, absolute leading slot, `text-indent` on the editor and placeholder for fine and coarse pointers); verify in Storybook at 680 and 375 px that a three-line draft wraps under the button.
- [ ] 2.2 Add a `bar` slot to `MessageInput` and move send into it; verify existing `message-queue`, `attachments` and `command-menu` tests still pass.
- [ ] 2.3 Add a flat variant to `VoiceEntryControls` (no capsule background, same order and accent mic); update `voice-entry-controls.test.tsx` for order and accessible names.
- [ ] 2.4 In `LiveComposer`, pass model picker + flat voice controls into the bar and remove the controls row from `ComposerFooter`; verify `composer-footer.test.tsx` and `plan-mode-badge.test.tsx` (badge still above the input).

## 3. Metrics row

- [ ] 3.1 Split `ComposerFooter` metrics into a usage button (left) and a context button (right) that share one `HoverPanel` state and open the same `ContextDetailsPanel`; verify with `composer-usage.test.tsx` that each part opens the panel, highlights only itself and exposes `aria-expanded`.
- [ ] 3.2 Show the cache hit always, as a bare percentage, with "cache hit" kept in the accessible name; remove the container query that hides it and keep hiding only used/total tokens; verify with a test and Storybook at 320 px that the row does not wrap or scroll.

## 4. New session

- [ ] 4.1 Use the same input bar in `NewSessionComposer` (model picker left, send right), keep the chip row above, and move the draft title and empty context meter into a metrics-style row below; verify `new-session.test.tsx` and `new-session-files.test.tsx` pass and the model picker is inside the input.

## 5. Voice mode

- [ ] 5.1 Render `VoicePanel` inside the `MessageInput` frame: transcript in the text area, waveform + time, clear, pause/resume, exit and send in the bar, error line inside the frame, disabled add button, accent outline while listening; drop the hint line and put shortcuts into tooltips; update `voice-panel.test.tsx`.
- [ ] 5.2 Keep the status row and metrics row mounted in voice mode while still hiding notices, the inline voice error and the stop button; on a coarse pointer show only the model icon in the voice bar; verify with `voice-submission.test.tsx`, `inline-dictation-composer.test.tsx` and Storybook at 375 px.

## 6. Integration

- [ ] 6.1 Run the frontend typecheck and the full frontend test suite, and check live chat, new session and voice mode in Storybook at 680, 375 and 320 px in light and dark themes against the approved variant-2 mockup (no overlap, no horizontal scroll).
