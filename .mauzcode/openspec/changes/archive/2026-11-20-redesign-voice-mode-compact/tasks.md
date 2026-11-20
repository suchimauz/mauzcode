# Tasks

## 1. Composer: nothing below the panel

- [x] 1.1 In `LiveComposer.tsx`, when the voice panel is open, do not render `ComposerFooter`, the inline voice error line, `notice` or the stop-execution button; pass the composer send `error` to `VoicePanel` as `sendError`. Verify with a new test in `frontend/src/test/voice-panel.test.tsx`: with a notice and a running agent, opening voice mode leaves only the panel; exiting restores the footer.

## 2. Panel markup

- [x] 2.1 Rework `VoicePanel.tsx`: transcript wrapper with the clear button inside, control row (exit, waveform, time, pause/resume, send), hint line; `sr-only` state label; icon buttons with `aria-label`, `title`, `aria-keyshortcuts`; one error line combining capture error and `sendError`. Keep shortcut, focus and announcement logic unchanged. Verify that all existing tests in `voice-panel.test.tsx` pass after updating only role/name queries that changed.
- [x] 2.2 Clear button: hidden on the mobile layout when `canClear` is false, `aria-disabled` with a title on desktop. Add a test for both cases.

## 3. Styles

- [x] 3.1 Rewrite `voice-panel.css`: mobile layout by default (full-width transcript, clear in the top-right corner, one row of 44 px round buttons, accent pause while listening, dark send, no hints), desktop single-row layout under `@media (pointer: fine)` plus `@container (min-width: 520px)`, waveform animation only while listening, danger border on error, `prefers-reduced-motion` support. Verify visually against `mockups/desktop.html` and `mockups/mobile.html` (variant E1) in light and dark themes at 375 px and 1280 px widths, in listening, paused and error states.

## 4. Checks

- [x] 4.1 Run the frontend voice tests (`voice-panel`, `voice-entry-controls`, `inline-dictation-composer`) and the frontend typecheck; all pass.
- [ ] 4.2 Manual check on a phone: dictate, pause, clear, send and exit; nothing appears under the panel; buttons are reachable with one thumb.
- [x] 4.3 Run `openspec validate redesign-voice-mode-compact --strict`.
