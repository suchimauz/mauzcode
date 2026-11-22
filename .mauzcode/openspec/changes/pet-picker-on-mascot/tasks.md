# Tasks

## 1. Picker on the mascot

- [x] 1.1 Add a non-interactive mode to `CrabMascot`, `TokibeanMascot` and `ImageMascot` (no poke button) and verify existing mascot tests still pass (`bunx vitest run src/test/mascot.test.tsx src/test/new-mascots.test.tsx`)
- [x] 1.2 Rework `MascotPicker` so its menu trigger wraps the mascot preview, with accessible name including the current choice, a shuffle badge for "Random" and disabled state; update `mascot-picker.test.tsx` for the new trigger and verify it passes
- [x] 1.3 In `NewSessionComposer` remove the pet chip from the chip row and render the mascot through `MascotPicker`; update `new-session.test.tsx` to assert no pet chip, choosing a pet from the mascot and locking while sending, and verify it passes

## 2. Integration

- [x] 2.1 Run the frontend typecheck and the full frontend test suite, and check the new-session screen in the browser in light and dark themes (click, keyboard, reduced motion; browser check skipped: the automation Chrome is not signed in, keyboard flow covered by tests)

## Workflow follow-up

- Archive the change after review and verify the merged `chat-mascots` spec.
