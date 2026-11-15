## 1. Options popover UI

- [ ] 1.1 Replace the `<details className="new-session-advanced">` block in `NewSessionComposer.tsx` with a Base UI Popover chip "Параметры" (SlidersHorizontal icon) in `.new-session-chips`, next to the Workspace chip
- [ ] 1.2 Popup with one "Название" input (maxLength 120, placeholder "Без названия", initial focus); the chip shows the truncated title when one is set; `aria-label` "Параметры сессии"
- [ ] 1.3 Disable the chip while busy or pending and close the popover when the lock starts
- [ ] 1.4 Remove `advancedOpen`, the presets fetch, `presets`/`presetsError` state and the `WorkspaceSuggestions` usage from the composer
- [ ] 1.5 Replace the `.new-session-advanced*` rules in `new-session.css` with popover styles on design tokens; check light and dark themes, keyboard focus and reduced motion against docs/skills/apple-design

## 2. Frontend draft and submit

- [ ] 2.1 Remove `workspaceDir`, `createWorkspaceDir`, `promptPreset` and `systemPrompt` from `NewSessionDraft`, query restore and `submitNewSession` in `frontend/src/lib/newSession.ts`
- [ ] 2.2 Drop unknown or legacy keys when a stored draft or pending submit is read

## 3. Backend prompt preset removal

- [ ] 3.1 Delete `src/agent/listPromptPresets.ts`
- [ ] 3.2 Remove `promptPresets` from the GET defaults and `promptPreset` from the POST allowed fields and parsing in `src/frontendBridge/newSession.ts`
- [ ] 3.3 Remove the `promptPreset` option, its JSDoc and the preset concatenation from `src/agent/createFromValues.ts` and `src/agent/createFromPopup.ts`
- [ ] 3.4 Run `procs.dev.genTypes`, reload the `agent` and `frontendBridge` namespaces, and confirm no callers remain with `code.callers({ name: "agent.listPromptPresets" })` and `rg promptPreset`

## 4. Tests

- [ ] 4.1 Update `frontend/src/test/new-session.test.tsx`: popover opens, title sets the chip label, locked state, keyboard open and Escape return focus, removed fields are absent
- [ ] 4.2 Update `frontend/src/test/new-session-preferences.test.ts`: a legacy draft with `promptPreset` loads, and the submit body omits removed fields
- [ ] 4.3 Update `src/frontendBridge/new-session.test.ts`: GET has no `promptPresets`, POST with `promptPreset` returns 400
- [ ] 4.4 Update `src/agent/projectCreation.test.ts` to remove preset expectations

## 5. Verification

- [ ] 5.1 `runtime.docs.validate({ strict: true, typecheck: false })` for `agent.createFromValues`, `agent.createFromPopup` and `frontendBridge.newSession`
- [ ] 5.2 One `procs.dev.typecheck({})` run for the whole batch, plus `code.quality({})`
- [ ] 5.3 Frontend vitest and backend tests for the touched suites pass
