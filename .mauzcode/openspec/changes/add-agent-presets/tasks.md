# Tasks

## 1. Storage, types and built-in defaults

- [x] 1.1 Add `src/agentPreset/Preset.ts`, `Snapshot.ts` and `Layer.ts` types (D1) and run `procs.dev.genTypes`; verify `types.agentPreset.*` resolve in `procs.dev.typecheck`.
- [x] 1.2 Add migration `$migration_<ts>_agent_presets.ts`: create `agent_presets`, add `agents.preset_id` / `agents.preset_snapshot`, seed the three built-ins (`ON CONFLICT DO NOTHING`), back-fill every existing agent with `preset_id='creator'` and a Creator snapshot; `down` drops them. Verify with an integration test that runs up and down on a database with existing agents.
- [x] 1.3 Classify every core namespace in `src/agentPreset/coreCatalogue.ts` as `standard` (with function patterns), `creator` or `internal`, and derive the Standard `allow` list from it (D3). Agree the catalogue with the person before continuing. Implementation and coverage test are complete; parent/person catalogue approval remains pending. Verify with a test that fails when any loaded core namespace is missing from the catalogue.
- [x] 1.4 Add `src/agentPreset/defaults.ts` with Standard, Creator and Minimal (D3), and `$setting_default.ts` (`standard`). Verify with a unit test that each default validates and that Minimal allows exactly `tools.bash/read/write/edit`.

## 2. Access resolution

- [x] 2.1 Implement `agentPreset.origin({ name })` → `plugin` (with plugin name) | `project` | `core`, using `plugins.list` namespaces and loader origin; a project file overriding a core function stays `core`. Verify with unit tests for each origin and the override case.
- [x] 2.2 Implement pattern validation and compilation (`*` → any characters including dots; allowed characters `[A-Za-z0-9_.*$-]`). Verify with unit tests for nested names, escaping and rejected characters.
- [x] 2.3 Implement `agentPreset.allows({ snapshot, name })` with per-layer AND, deny precedence, plugin-only grants, project-local allowance and per-snapshot/name/registry-generation memoisation (D2). Advance the generation on load, unload, override and namespace-origin changes; invalidate derived discovery/prompt caches as needed. Verify with unit tests for every "Function access resolution", "Manual plugin grants" and built-in-defaults scenario in `specs/agent-presets/spec.md`, including warmed-cache origin changes and wildcard grants for existing agents after registration. Assert snapshots remain unchanged.

## 3. Preset management API

- [ ] 3.1 Implement `agentPreset.list`, `get`, `create`, `update` with strict field validation (unknown fields, kebab id, patterns, string arrays) through `procs.dev.createFunction`. Verify with tests: duplicate id fails, invalid pattern fails, update persists.
- [ ] 3.2 Implement `agentPreset.remove` (refuses built-ins and the configured default) and `agentPreset.reset` (built-ins only, restores constants). Verify with tests for the "Reset after edit" and "Delete a built-in" scenarios.
- [ ] 3.3 Implement `agentPreset.ensureBuiltins` as a boot lifecycle step that inserts missing built-ins without overwriting edits. Verify with a test that edits Standard, reruns it and sees the edit kept, and that a deleted-row Minimal is restored.
- [ ] 3.4 Implement `agentPreset.resolve({ id?, parent? })`: default from the setting, unknown id throws with its name, `parent` prepends parent layers. Verify with tests for "Create without a preset", a missing default and narrowing by a child.
- [ ] 3.5 Validate each new function with `runtime.docs.validate({ strict: true, typecheck: false })` and write `docs/agent-presets.md` (concepts, patterns, origins, built-ins, how to grant a plugin, explicit "guardrail, not a sandbox" section). Verify that the doc exists and covers the "Presets are a guardrail, not a sandbox" requirement. Document that snapshots freeze rules rather than installed functions, including future matches of core wildcards and `plugins: ["*"]`. Add an `AGENTS.md` review checklist for new functions under Standard's existing wildcard grants.

## 4. Agent snapshot lifecycle

- [ ] 4.1 Add `preset?: types.agentPreset.Snapshot` to `types.agent.Agent`; persist `preset_id`/`preset_snapshot` on insert only in `session.save`, read them in `session.load`/`loadAll` (missing snapshot → Creator plus `procs.log.warn`). Verify with a test that a later save does not change the stored snapshot.
- [ ] 4.2 `ui.createAgent({ presetId? })` resolves and stores the snapshot. Verify with a test: Standard by default; an unknown id throws and creates nothing.
- [ ] 4.3 `session.fork({ presetId? })` copies the parent snapshot or narrows it through `resolve({ parent })`; pass `presetId` through `agent.delegate`, `agent.delegateTask`, `agent.publishGoalDelegation` and `sharedAgent.delegate`. Verify with tests for "Standard parent asks for Creator" and "Default inheritance", and a goal sidecar inheriting its parent.
- [ ] 4.4 Verify the "Preset edited after creation" and "Preset deleted after creation" scenarios with an integration test across `agentPreset.update/remove` and two agents.

## 5. Native tools and tool calls

- [ ] 5.1 `agent.wireTools` keeps a tool only when `allows(snapshot, implementingFn)` and, if set, `agent.tools` contains it. Verify with tests for "Plugin tool hidden", "Tool selection narrows" and "Minimal tool set".
- [ ] 5.2 `tools.call` with an agent rejects a denied tool before validation, using the error `"<fn> is not available in preset <name>"`, `handlerExecuted: false`. Verify with a test that calls a hidden Redmine tool from a Standard agent.

## 6. Eval guard

- [ ] 6.1 Add optional `evalCtx` to `procs.repl.eval` and build a guarded ctx in `repl.eval` when the agent has a snapshot (D6): the path-by-path proxy checks `allows`, throws before the call, and invokes the raw function with the unguarded ctx. Verify with tests for "Denied call in evaluation" (nothing reloaded), "Allowed function with internal calls", and namespace probes (`if (ctx.fns.x)`) still working.
- [ ] 6.2 Pass the `allows` predicate into `plugins.search/read/functions` and `runtime.docs.search/get` when called through a guarded eval. Verify that Standard allows all three plugin discovery functions, while its `runtime.docs.search` returns no `procs.dev.*` or ungranted plugin function. Test search/read/functions against an ungranted plugin and a granted plugin with denied functions; no denied function documentation is returned. Verify plugin workflow/index omission with zero reachable granted plugins and inclusion after creating a Standard agent granted `openspec`.
- [ ] 6.3 Verify the end-to-end scenario: a Creator agent runs `agentPreset.update({ id: "standard", patch: { plugins: ["openspec"] } })` without a confirmation prompt, and a new Standard agent can then call `openspec.run` in eval while an older Standard agent cannot.

## 7. Modular system prompt

- [ ] 7.1 Capture the current assembled Creator-equivalent prompt (today's `fullSystemPrompt` for a fixed fixture agent) as a reviewed snapshot under `src/agent/__fixtures__/`. Verify that the snapshot is committed before any prompt text moves.
- [ ] 7.2 Add `$loader_prompt` for `src/<mod>/$prompt_<id>.md` (frontmatter `id`, `title`, `requires`, `order`, optional `generator`), registry in `ctx.state.prompts`, hot reload like `$loader_tool`; plugins load theirs the same way. Verify with a unit test that loads, reloads and rejects a section without `id` or with a duplicate `id`.
- [ ] 7.3 Split `SYSTEM_PROMPT_CORE.txt` into `SYSTEM_PROMPT_BASE.md` and the sections listed in D8 (`eval`, `storage`, `codeGraph`, `authoring`, `plans`, `delegation`, `agentMessaging`, `sharedAgents`, `triggers`, `secrets`), and turn `tools`, `plugins`, `input`, `canvas` and `fences` into generator sections that receive `allows`. Move MauzCode UI design and implementation policies into the project's `AGENTS.md`, preserving reading links and project scope; retain only the generic instruction to follow workspace `AGENTS.md` in the base prompt. Record exact relocated paragraphs in a reviewed relocation manifest beside the snapshot. Verify that `code.quality` reports no dead prompt helpers.
- [ ] 7.4 Rewrite `agent.fullSystemPrompt` to assemble base, then allowed sections not in any layer's `excludeSections`, then `## Preset instructions`, `## Per-agent instructions` and the runtime context. Verify with tests for "Section included by access", "Section excluded by preset", "Plugin section", "Standard prompt" and "Prompt addition".
- [ ] 7.5 Verify Creator equivalence: the assembled Creator prompt contains every paragraph of the 7.1 snapshot except the exact project-policy paragraphs in the reviewed relocation manifest (order-insensitive comparison). Verify the relocated guidance is covered in `AGENTS.md`. Minimal's prompt contains only base, `tools`, `fences` and runtime context. Test that all built-in presets retain the generic workspace-instructions rule without embedding MauzCode UI policies or requiring `ui.eval` to read project instructions.
- [ ] 7.6 Update `AGENTS.md`/`CLAUDE.md` and `docs/architecture.md`: how to add a `$prompt_` section, the `requires` rule, and the requirement to classify new core namespaces in `coreCatalogue.ts`. Verify by review that the docs name both files.

## 8. New-session API and UI

- [ ] 8.1 `GET /ui-lab-api/new-session` returns `presets [{ id, name, description, sortOrder }]` and `defaultPresetId`, without patterns, plugins or prompt; `POST` accepts optional `presetId`, returns 400 for an unknown id before creating anything, and passes it to `ui.createAgent`. Verify with route tests for the "Defaults response", "Submit with an unknown preset" and "Submit without a preset" scenarios, and that `promptPreset` is still rejected.
- [ ] 8.2 `frontend/src/lib/newSession.ts`: `presetId` in the draft and request; a restored draft with an unknown preset falls back to the default. Verify with a frontend unit test for "Draft with a deleted preset".
- [ ] 8.3 `NewSessionComposer.tsx`: replace the static "Standard mode" span with a preset `Menu` modelled on the Workspace chip (radio items with descriptions, accessible name, disabled while busy or pending, theme tokens, reduced motion). Verify with frontend tests for "Default selection", "Pick a preset", "Busy composer" and "Keyboard flow".
- [ ] 8.4 Show the agent's preset name read-only in the chat header via the agent meta payload. Verify with a frontend test that a Standard agent shows "Standard".

## 9. Integration checks

- [ ] 9.1 Run `procs.dev.typecheck` once for the settled batch and `code.quality` with `ok: true`; record pre-existing diagnostics separately.
- [ ] 9.2 Run the agent, tools, session, repl, agentPreset and frontend test suites; verify they all pass.
- [ ] 9.3 Smoke test on the live server: create Standard, Creator and Minimal sessions from the composer; check each one's declared tools and prompt sections through `agent.buildLlmRequest`, and confirm that an existing pre-migration agent behaves as before.
- [ ] 9.4 Run `openspec validate add-agent-presets --strict` and fix every warning.

## Workflow follow-up

- Archive the change with `openspec archive add-agent-presets --yes` after the person accepts the implementation.
- Later changes (out of scope): preset editor UI, plugin toggle on the Plugins page, Code-first (PTC) preset, real isolation.
