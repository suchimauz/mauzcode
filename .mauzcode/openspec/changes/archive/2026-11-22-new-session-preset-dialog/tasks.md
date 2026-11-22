# Tasks

Visual reference: `references/preset-dialog-real-styles.html` (chosen design) — match it for desktop and the 390px phone frame in both themes.

## 1. Draft state

- [x] 1.1 Add optional `presetConfirmed` to `NewSessionDraft` in `frontend/src/lib/newSession.ts`, keep it through draft persist/restore, and never send it in the submit payload; verify with a unit test in `frontend/src/test/` (round-trip and payload omit).

## 2. Preset dialog component

- [x] 2.1 Build the preset dialog (Base UI `Dialog`, title "Режим агента", search field, listbox rows with name, description, "по умолчанию" badge and check mark, footer with key hints and "Продолжить") styled per the reference with existing tokens; verify with a component test that rows render in sort order with the default badge.
- [x] 2.2 Implement the controls: ↑/↓ within the filtered list, Enter/"Продолжить" confirm, row click selects, Esc/outside click restores the selection that was active when the dialog opened, search filters by name+description and shows "Ничего не найдено"; verify with keyboard and search tests.
- [x] 2.3 Add the ≤560px bottom-sheet layout (full width, max 85dvh, safe-area inset, 44px targets, hints hidden) and reduced-motion handling; verify visually against the phone frame in the reference in light and dark themes.

## 3. Composer integration

- [x] 3.1 Make the preset chip in `NewSessionComposer` open the dialog instead of the `Menu`, keep it disabled while sending or pending, and return focus to the chip on close; update the existing preset chip tests (pick a preset, keyboard flow, locked while sending).
- [x] 3.2 Auto-open the dialog once per fresh draft (not when the draft has `presetConfirmed`, is pending, the catalogue failed to load, or there are fewer than two presets), set `presetConfirmed` on confirm, and focus the message input after an auto-open closes; verify with tests for each of these cases.
- [x] 3.3 Run `bun run frontend:test` and `bun run frontend:build` (typecheck + build), and check the flow manually in the browser on desktop and in a narrow viewport.
