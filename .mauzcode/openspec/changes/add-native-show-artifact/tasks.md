## 1. Tool

- [ ] 1.1 Add `$tool_show_artifact.md` (`requires: [canvas.show, files.embedUrl]`) and `tools.showArtifact` over `canvas.show` with kind `file` and the invoking agent's id; verify show, repeat (same tab id), missing file (no tab) and relative path against the workspace in tests
- [ ] 1.2 Reject unknown arguments (`agentId`, `kind`, `html`, `url`) and calls without a trusted invocation; verify no canvas change in tests

## 2. Gating and guidance

- [ ] 2.1 Verify preset gating: denying the adapter, `canvas.show` or `files.embedUrl` removes the tool; with the adapter denied `canvas.show` still works through evaluation
- [ ] 2.2 Name `show_artifact` in `canvas.promptSection` when the agent can call it, keeping `canvas.show` guidance for other kinds; verify both prompts and the preset prompt budgets

## 3. Presets and measurement

- [ ] 3.1 Add the conservative Standard migration and catalogue entry for `tools.showArtifact`; verify factory Standard is upgraded and a customized Standard is untouched
- [ ] 3.2 Add the `artifact` scenario to `bench.routes` and `tools.showArtifact` to its native adapters; run `artifact` and `question` (2 arms × 3) and record the result, including the per-request schema cost, in this change's `research/`
- [ ] 3.3 Run `code.quality`, one project typecheck and the fast test suite; record results, separating pre-existing failures

## Workflow follow-up

- Archive this change after 3.3.
- If 3.2 shows a notable per-request schema cost, propose deferred exposure of native schemas before the web tools.
