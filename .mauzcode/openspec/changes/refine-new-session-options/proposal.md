## Why

The new-session screen hides its extra settings in a native `<details>` block labelled "Advanced options". It looks foreign next to the rest of the composer: English labels on a Russian screen, raw form controls, and no shared design tokens. Most of its fields are no longer useful. The read-only project workspace field repeats the Workspace chip. The custom-directory controls and the additional system instructions are rarely used from this screen. The built-in prompt presets are going to be replaced by a different mechanism later, so we should not keep polishing them.

## What Changes

- Replace the "Advanced options" `<details>` block with a "Параметры" chip in the composer chip row, next to the Workspace chip. The chip opens a popover styled with MauzCode design tokens and following the Apple Design reference.
- The popover contains a single "Название" (session title) field, limited to 120 characters, with the placeholder "Без названия". When a title is set, the chip shows it, truncated.
- Remove from the new-session UI: the read-only project workspace field, the custom local directory picker with its "create directory" checkbox and help text, prompt presets, and additional system instructions.
- **BREAKING** Remove prompt presets from the whole system. The defaults endpoint stops returning `promptPresets`, the new-session POST rejects `promptPreset` as an unknown field, and agent creation no longer accepts or applies preset identifiers. The preset catalogue procedure is deleted.
- Saved drafts that still contain `promptPreset` load without errors, and the field is ignored.
- All labels in the new options surface are in Russian.

## Out of Scope

- A replacement mechanism for prompt presets. It will come in a separate change.
- Removing `workspaceDir`, `createWorkspaceDir` or `systemPrompt` from the backend creation APIs (`/v1/agents` POST and agent creation). They stay available to other callers. Only the new-session UI stops sending them.
- Any other change to the composer, the model picker or the workspace chip.

## Capabilities

### New Capabilities
- `new-session-options`: the options surface of the new-session composer (title popover, removed fields) and removal of prompt presets from session creation.

### Modified Capabilities
_None._

## Impact

- Frontend: `frontend/src/components/mauzcode/NewSessionComposer.tsx`, `frontend/src/components/mauzcode/new-session.css`, `frontend/src/lib/newSession.ts`.
- Backend: `src/agent/listPromptPresets.ts` (deleted), `src/agent/createFromValues.ts`, `src/agent/createFromPopup.ts`, `src/frontendBridge/newSession.ts`, regenerated `ctx_ns.d.ts`.
- Tests: `frontend/src/test/new-session.test.tsx`, `frontend/src/test/new-session-preferences.test.ts`, `src/frontendBridge/new-session.test.ts`, `src/agent/projectCreation.test.ts`.
- API: clients that send `promptPreset` to the new-session bridge get HTTP 400.
