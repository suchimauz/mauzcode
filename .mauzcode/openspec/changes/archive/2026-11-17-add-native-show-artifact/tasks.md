## 1. Tool

- [x] 1.1 Add `$tool_show_artifact.md` (`requires: [canvas.show, files.embedUrl]`) and `tools.showArtifact` over `canvas.show` with kind `file` and the invoking agent's id; verify show, repeat (same tab id), missing file (no tab) and relative path against the workspace in tests
- [x] 1.2 Reject unknown arguments (`agentId`, `kind`, `html`, `url`) and calls without a trusted invocation; verify no canvas change in tests

## 2. Gating and guidance

- [x] 2.1 Verify preset gating: denying the adapter, `canvas.show` or `files.embedUrl` removes the tool; with the adapter denied `canvas.show` still works through evaluation
- [x] 2.2 Name `show_artifact` in `canvas.promptSection` when the agent can call it, keeping `canvas.show` guidance for other kinds; verify both prompts and the preset prompt budgets

## 3. Presets and measurement

- [x] 3.1 Add the conservative Standard migration and catalogue entry for `tools.showArtifact`; verify factory Standard is upgraded and a customized Standard is untouched
- [x] 3.2 Add the `artifact` scenario to `bench.routes` and `tools.showArtifact` to its native adapters; run `artifact` and `question` (2 arms × 3) and record the result, including the per-request schema cost, in this change's `research/`
- [x] 3.3 Run `code.quality`, one project typecheck and the fast test suite; record results, separating pre-existing failures

## Verification (task 3.3)

- `code.quality({})`: ok, 0 errors; 569 warnings — identical counts on the base checkout (main), none in the new or changed functions (`tools.showArtifact`, `canvas.promptSection`, `agent.fullSystemPrompt`, `agentPreset.coreCatalogue`, the Standard migration).
- `procs.dev.typecheck({})` (whole project, after the settled batch): ok, 0 errors. The fresh worktree first needed `procs.dev.genTypes` (generated `src/ctx_ns.d.ts` is gitignored) and the machine-local `workspace.json` for the optional opencode-go mount; with those in place the check is clean.
- Fast suite `bun run test`: 3776 pass, 12 skip, 0 fail (627 files). The first run had 4 failures: two expected tool lists updated for `show_artifact` (`tools.test.ts`, `run.test.ts`); two openspec plugin tests failed only because the fresh worktree lacked `plugins/openspec/node_modules` (environment setup, linked from the checkout — not a code failure). No pre-existing failures.
- Measurement: `research/ab-artifact.md` — artifact 6/6 vs 6/6 success, −56% tokens/run, p50 turns 6/4 → 2; `show_artifact` schema costs +386 prompt tokens per request (isolated three-arm probe); question +21% from the cumulative P0–P2 schemas.

## Workflow follow-up

- Archive this change after 3.3.
- If 3.2 shows a notable per-request schema cost, propose deferred exposure of native schemas before the web tools.
