# Tasks

## 1. Status row and add button

- [x] 1.1 Add a status row above the input in the live composer: planning badge slot left, `CrabMascot` right; remove the badge from the footer. Verify with updated `plan-mode-badge` and `mascot` tests (badge renders above the input; mascot inside the row).
- [x] 1.2 Keep per-pet mascot sizing working in the new anchor; verify every pet in the `ComposerFooter`/`ChatViewport` stories at 720, 375 and 320 px.
- [x] 1.3 Add a `leading` slot to `MessageInput` and pass `ComposerAddButton` into it (live and new-session composers); keep the 44 px touch target on coarse pointers. Verify with updated `attachments` and `new-session` tests (menu opens, draft and caret unchanged).

## 2. Controls and metrics rows

- [x] 2.1 Replace the footer grid with a controls row: model picker left, voice group right; model label truncates first. Verify with `composer-footer` tests and a 320 px story without overlap.
- [x] 2.2 Add `formatCompactTokens` with unit tests (`999`, `9412 → 9.4k`, `184220 → 184k`, millions).
- [x] 2.3 Build the metrics row from the existing usage button: context percent and used/total on the left, cost, tokens and cache on the right; anchor the context details panel to it and drop the separate context meter. Verify with updated `composer-usage` tests (opens the panel, `aria-expanded`, exact numbers in the accessible name).
- [x] 2.4 Add container-query hide order (cache, then used/total) and remove sideways scrolling. Verify in stories at 460, 375 and 320 px.

## 3. Voice capsule

- [x] 3.1 Reorder `VoiceEntryControls` to settings, voice mode, inline input; switch the route picker icon to `Settings`; wrap in the capsule with the accent inline-input button. Verify with updated `voice-entry-controls` tests (tab order, names, only inline input marked primary, disabled states).

## 4. Integration check

- [x] 4.1 Run the frontend test suite and typecheck; compare the running app at 720 px desktop and 375/320 px phone against the agreed D2 + V3 mockup.
