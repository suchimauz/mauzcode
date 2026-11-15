## Context

`NewSessionComposer.tsx` renders a native `<details className="new-session-advanced">` above the chip row. Its fields are: Title, a read-only project workspace input, `WorkspaceSuggestions` for a custom directory, help text, a "create directory" checkbox, prompt presets (each in a nested `<details>` with its full text), and an "Additional system instructions" textarea. The presets come from `agent.listPromptPresets`, which `frontendBridge.newSession` returns in GET defaults. `agent.createFromValues` concatenates their text into the system prompt. The rest of the screen uses Russian labels, chip styling (`.new-session-chip`) and Base UI floating surfaces (`Menu`, `Popover` in `ModelPicker`).

## Goals / Non-Goals

**Goals:** a compact options surface that matches the composer chips; only the title remains; prompt presets are gone from every layer; old drafts keep working.

**Non-Goals:** a new preset system; removing `workspaceDir`, `createWorkspaceDir` or `systemPrompt` from backend creation APIs; restyling other composer parts.

## Decisions

1. **Chip + Base UI Popover.** Add a `Popover.Root` with a trigger that uses the `.new-session-chip` class and a lucide `SlidersHorizontal` icon (16px, stroke 1, the same as the Workspace chip). Use `Popover.Portal` → `Popover.Positioner side="top" align="start" sideOffset={8} collisionPadding={12} className="floating-positioner"` → `Popover.Popup`. This matches the Workspace menu, so the two surfaces look and behave the same. A `<details>` was rejected because it pushes the composer down and cannot be themed consistently.
2. **Popup content.** One labelled input ("Название", `maxLength=120`, placeholder "Без названия") with `initialFocus` on the input. Styling: `--surface` background, `--line-strong` border, 8px radius, 13px text, about 280px wide. Follow docs/skills/apple-design for spacing and focus rings. The chip label is `shown.title` (CSS ellipsis inside the existing `max-width: 50%`) or "Параметры". `aria-label` is "Параметры сессии".
3. **Locking.** The trigger is `disabled={locked}` (`busy || pending`). If the popover is open when the lock starts, it closes.
4. **Remove the `advancedOpen` state and `.new-session-advanced*` CSS.** Also remove the presets fetch effect, the `presets` and `presetsError` state, and the `WorkspaceSuggestions` usage in this component. The component file stays, because other screens may still use it.
5. **Frontend draft type.** Remove `workspaceDir`, `createWorkspaceDir`, `promptPreset` and `systemPrompt` from `NewSessionDraft` and from query-string restore. `submitNewSession` sends only `title` among the old advanced fields. The stored draft is JSON. Unknown keys are dropped when the draft is read, so legacy values are never sent back. `projectId` is always sent.
6. **Backend preset removal.** Delete `src/agent/listPromptPresets.ts` and its `PromptPresetId` type. In `frontendBridge.newSession`: drop `promptPresets` from GET, and drop `promptPreset` from the allowed-field lists and parsing, so the existing unknown-field check returns 400. In `agent.createFromValues` and `agent.createFromPopup`: remove the `promptPreset` option, its JSDoc and the preset-text concatenation. `systemPrompt` is passed through unchanged. Then run `procs.dev.genTypes` and reload the `agent` and `frontendBridge` namespaces.
7. **Backend fields kept.** The bridge still accepts `workspaceDir`, `createWorkspaceDir` and `systemPrompt`, because `/v1/agents` POST and other callers share the creation path. The UI simply stops sending them.

## Risks / Trade-offs

- External scripts that post `promptPreset` now fail with 400. This is intended and documented as BREAKING. No in-repo callers remain after this change (verify with `code.callers` and `rg promptPreset`).
- Hiding the custom directory from the UI removes the only UI path for an ad-hoc local workspace. Users add a Workspace in navigation instead. The API path stays available.

## Migration

No data migration. Stored drafts with removed keys are ignored when they are read. Hot reload is enough. No restart is required.
