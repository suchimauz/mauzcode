## 1. Header draft mode

- [x] 1.1 Add optional `draftTitle`, `onDraftTitle`, `draftLocked` props to `ChatHeader`; enable the title button without `agentId` in draft mode, reuse the rename input (120 chars, Enter/blur commit, Escape revert) and skip `getChatHeader`/`renameChat`
- [x] 1.2 Give the draft title button an accessible name ("Переименовать новую сессию") and keyboard support

## 2. Wiring and reset

- [x] 2.1 In `LiveApp`, pass the draft title, setter (via `updateDraft`) and lock state to `ChatHeader`; show `title.trim() || "New Session"`
- [x] 2.2 In `startNewSession`, clear the title when the draft was not the current view; keep it when already on the draft
- [x] 2.3 Pass the draft title to `WorkspaceSidebar` and use it in both draft rows (tree and flat)

## 3. Composer cleanup

- [x] 3.1 Remove the "Параметры" chip, popover, related state, refs and imports from `NewSessionComposer`
- [x] 3.2 Show the draft (or pending) title in the footer label, falling back to "New Session"
- [x] 3.3 Remove unused `.new-session-options*` styles

## 4. Tests

- [x] 4.1 New-session tests: no "Параметры" chip; header edit sets the title without a request; Escape reverts; clearing shows "New Session"; title sent with the first message; editing locked while pending
- [x] 4.2 Reset tests: leave to a chat then New Session clears the title; New Session on the draft keeps it; reload keeps it; `?newSession=1&title=` pre-fills it
- [x] 4.3 Footer label and sidebar draft row show the title; existing rename tests stay green
- [x] 4.4 Run frontend tests and typecheck
