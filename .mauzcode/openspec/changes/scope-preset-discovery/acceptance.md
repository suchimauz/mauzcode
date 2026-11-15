# Acceptance evidence

## Isolated execution boundary

Validation ran only in `/home/suchimauz/wt/scope-preset-discovery` on `feat/scope-preset-discovery`. No main-runtime reload, restart, plugin installation change, preset update or transcript rewrite was performed. `testCtx` booted a separate process with the worktree as project root, external plugin roots disabled and a dedicated test Postgres database (never port 54393). A read-only SELECT copied one existing Standard and Creator snapshot each; only these policy objects, not transcripts, were supplied to the isolated eval smoke.

Preset filtering is a discovery guardrail, not a sandbox: raw state, files, arbitrary JS and shell remain outside this boundary. Historical messages can still mention denied capabilities. Existing snapshots are not migrated. Creator intentionally omits unannotated external kinds; valid live required-function metadata restores discovery without changing action authorization. See `docs/architecture.md` and `AGENTS.md` for the dependency contract.

## Regression and checks

- Actual `tools.eval → repl.eval → procs.repl.eval` regression added to `src/agentPreset/discovery.test.ts`: Standard-shaped, Creator, inherited and partial snapshots; root reflection, canvas/input catalogues, forged prompt predicates, repeated evaluation and byte-for-byte unchanged policy objects/transcript arrays. It executes the production evaluator, not an eval mock.
- Focused command: `bun test src/agentPreset src/prompts/sections.test.ts src/agent/systemPromptAuthoring.test.ts`: **69 pass, 0 fail, 776 assertions**.
- Isolated `genTypes` and namespace reloads: agentPreset, canvas, input, plugins, runtime, tools, prompts, agent. This reloads relevant loaders and prompt entries too. Nested `runtime.docs` cannot be reloaded as a module; `runtime` is the correct namespace.
- All 12 changed ordinary runtime functions passed `runtime.docs.validate({strict:true,typecheck:false})`.
- Full-project typecheck: initial check found five new test typing errors (13 diagnostic lines); corrected fixture assertions/accesses. That initial result is explicitly obsolete. One settled repeat reports **475 diagnostic lines**, identical to isolated baseline `main` at `a2c8d18740885d9a81a621b2dd45fe1b49400b01` after normalizing source line positions and baseline root paths. No new diagnostics. Baseline was exported under scratch, with its own generated types and the same dependency symlink; main source/runtime was not changed.
- Relevant quality (`boundary`, `unresolved`, `rules`, `floating-promise`): baseline and worktree findings exactly equal. Existing failures: 18 unresolved, 55 formdata-to-string, 82 empty-catch, 5 lost-cause, 9 floating-promise. No claim of a clean full project.
- Read-only smoke after isolated reload used copied **existing** Standard and Creator snapshots unchanged. Standard: file/html/url canvas kinds; Creator additionally code.tests. Creator includes secret input; Standard does not. No external plugins were mounted for this smoke (external-plugin behavior is exercised by deterministic fixtures). Output was saved successfully; the smoke process subsequently lingered and was killed at 120 seconds, so its successful assertions/output do not imply clean process shutdown.
- `openspec.run({args:['validate','scope-preset-discovery','--strict']})`: valid.

## Durable diagnostics

All paths below are relative to `/home/suchimauz/wt/scope-preset-discovery/.mauzcode/tmp/nz/`:

- `focused.log`, `integration.log`
- `validate.ts`, `validation.log`, `docs.json`
- `typecheck-before-fixes.json` (obsolete), `typecheck.json` (settled, complete)
- `baseline-check.ts`, `baseline.log`, `baseline-typecheck.json` (complete)
- `quality.json`, `baseline-quality.json`, `comparison.json`
- `smoke.ts`, `smoke.log`, `smoke.json`, `existing-snapshots.json`

## Rollout / approval still pending

The isolated reload and read-only smoke complete this change's pre-merge validation. Actual rollout into the main runtime is deliberately **not performed**: it requires the owner's merge/deployment decision. After approval, reload the same namespaces in main and repeat read-only discovery for an existing Standard and Creator session. Do not recreate snapshots, rewrite historical transcripts or mount/unmount live plugins to manufacture lifecycle tests. Archive and merge require explicit owner approval; no archive, commit, push or merge was performed by this integration worker.
