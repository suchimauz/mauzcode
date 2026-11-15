## 1. Options popover UI

- [x] 1.1 Replace the `<details className="new-session-advanced">` block in `NewSessionComposer.tsx` with a Base UI Popover chip "Параметры" (SlidersHorizontal icon) in `.new-session-chips`, next to the Workspace chip
- [x] 1.2 Popup with one "Название" input (maxLength 120, placeholder "Без названия", initial focus); the chip shows the truncated title when one is set; `aria-label` "Параметры сессии"
- [x] 1.3 Disable the chip while busy or pending and close the popover when the lock starts
- [x] 1.3a Enter in the "Название" input closes the popover and returns focus to the chip; call `preventDefault`/`stopPropagation` so the composer does not send the first message
- [x] 1.4 Remove `advancedOpen`, the presets fetch, `presets`/`presetsError` state and the `WorkspaceSuggestions` usage from the composer
- [x] 1.5 Replace the `.new-session-advanced*` rules in `new-session.css` with popover styles on design tokens; check light and dark themes, keyboard focus and reduced motion against docs/skills/apple-design

## 2. Frontend draft and submit

- [x] 2.1 Remove `workspaceDir`, `createWorkspaceDir`, `promptPreset` and `systemPrompt` from `NewSessionDraft`, query restore and `submitNewSession` in `frontend/src/lib/newSession.ts`; always send `projectId` (drop the `draft.workspaceDir ? '' : …` branch) and trim the title
- [x] 2.2 Read stored drafts through an explicit allow-list (`title`, `mascot`, `projectId`, `model`, `effort`, `text`, `requestKey`) instead of `{ ...d }`
- [x] 2.3 In `NewSessionComposer.tsx`, when the pending record has a non-empty removed field, do not replay it: move `text` and `title` into the draft with a new `requestKey` and clear the pending record; drop the `!draft.workspaceDir` send guard

## 3. Backend

- [x] 3.1 Delete `src/agent/listPromptPresets.ts`
- [x] 3.2 In `src/frontendBridge/newSession.ts`: remove `promptPresets` from GET; remove `promptPreset`, `workspaceDir`, `createWorkspaceDir` and `systemPrompt` from both allowed-field lists, the `data` type, parsing, the `advanced` object and the JSDoc
- [x] 3.3 Remove the `promptPreset` option, its JSDoc and the preset concatenation from `src/agent/createFromValues.ts`
- [x] 3.4 Delete `src/agent/$route_new_POST.ts`, `src/agent/createFromPopup.ts` and `src/ui/newAgentPopup.ts`; keep `src/agent/$route_new_GET.ts`
- [x] 3.5 Point `src/agent/$app_new-agent.json` `href` to `/?newSession=1`
- [x] 3.6 Run `procs.dev.genTypes`, `procs.http.loadRoutes`, reload the `agent`, `ui` and `frontendBridge` namespaces; confirm no callers remain with `code.callers` for `agent.listPromptPresets`, `agent.createFromPopup`, `ui.newAgentPopup` and `rg "promptPreset|createFromPopup|newAgentPopup"`

## 4. Tests

- [x] 4.1 Update `frontend/src/test/new-session.test.tsx`: popover opens, title sets the chip label, locked state, keyboard open and Escape return focus, Enter in the title closes the popover without sending, removed fields are absent
- [x] 4.2 Update `frontend/src/test/new-session-preferences.test.ts`: a legacy draft with `promptPreset` loads, the submit body omits removed fields, a legacy pending record with `workspaceDir` is not replayed and its text returns to the draft
- [x] 4.3 Update `src/frontendBridge/new-session.test.ts`: GET has no `promptPresets`; POST with `promptPreset`, `workspaceDir`, `createWorkspaceDir` or `systemPrompt` returns 400 and creates nothing
- [x] 4.4 Update `src/agent/projectCreation.test.ts`: drop the `newAgentPopup` and preset cases
- [x] 4.5 Update `src/agent/$route_new.test.ts`: keep the GET redirect case, drop the `createFromPopup` and POST cases

## 5. Verification

- [x] 5.1 `runtime.docs.validate({ strict: true, typecheck: false })` for `agent.createFromValues` and `frontendBridge.newSession`
- [x] 5.2 One `procs.dev.typecheck({})` run for the whole batch, plus `code.quality({})`
- [x] 5.3 Frontend vitest and backend tests for the touched suites pass
