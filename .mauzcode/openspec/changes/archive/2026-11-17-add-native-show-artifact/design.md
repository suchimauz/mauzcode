## Context

See proposal.md. Native tools are `$tool_*.md` declarations with adapters in `src/tools/`, dispatched by `tools.call`; `requires:` names the wrapped runtime functions and `tools.permitted` checks both against the frozen preset snapshot. `canvas.show({ kind, args, title?, agentId? })` opens or re-activates a tab; the `file` kind's `prepare` resolves a relative path against the target agent's workspace (local or SSH), checks existence through `files.embedUrl`, pins an absolute path and host, and suggests a title. Showing the same args again switches to the existing tab or reopens a closed one with its state.

## Goals / Non-Goals

**Goals:** one small typed schema for the common case "show this file"; behaviour identical to `canvas.show` with kind `file`; owner bound from the trusted invocation; Standard grant for untouched factory rows.

**Non-Goals:** other canvas kinds (`html`, `url`, plugin kinds); closing, listing or updating tabs; publishing or sending anything outside the chat; changes to canvas storage, routes or the React surface.

## Decisions

1. **Thin adapter over `canvas.show` with kind `file`.** The adapter passes `{ path, host?, mode? }` as args and `agentId` from the trusted session. Path resolution, existence checks, deduplication and reopen semantics stay in the `file` kind. Reimplementing them was rejected: two resolvers would drift on SSH and relative paths.
2. **File kind only.** The roadmap names `canvas.show(kind:file)`; a generic `kind`/`args` schema would add an untyped `args` object the model has to fill from prose, which is exactly what the eval route already offers. `html` needs a sandbox-aware body and is a separate decision.
3. **Owner from the invocation only.** `canvas.show` accepts `agentId`; the adapter never exposes it and always passes the invoking agent's id. Without a trusted invocation it fails instead of falling back to `agent.current`.
4. **`requires: [canvas.show, files.embedUrl]`.** Both are what the `file` kind actually uses; denying either hides the tool. The file kind must also be registered; otherwise the call fails with the same error as an unknown tool kind.
5. **Compact return.** `{ itemId, title, path, host }`, not the full canvas item, so the model can refer to the tab without a large result.
6. **Prompt guidance.** When the agent can call `show_artifact`, `canvas.promptSection` says "To show a file beside the chat, call the show_artifact tool" instead of the `canvas.show` sentence for files; the rest of the Canvas section is unchanged. The decision uses the same native-function check as `read_result`/`request_input` in `agent.fullSystemPrompt`.
7. **Conservative Standard migration.** Same pattern as `20380104120000_native_plan_delegation_tools`: one conditional UPDATE that matches only the exact previous factory definition and appends `tools.showArtifact`.
8. **Measurement.** Add an `artifact` scenario to `bench.routes` (ask to show a generated report file; the check reads `canvas_items` for an active `file` tab with that absolute path). The eval arm denies `tools.showArtifact` with the other adapters. Compare tokens with the eval route and record the per-request cost of the extra schema in the `question` scenario.

## Risks / Trade-offs

- [Each schema raises the cost of every request; P1 measured ≈+22% tokens] → keep the schema to four optional-light fields and short descriptions; measure the `question` scenario; if the overhead is notable, deferred exposure becomes the next change instead of web tools.
- [The model may show files the person did not ask for] → the description says to show a file when the person asks to see it or when a produced report is the answer; the tool never sends anything outside the chat.
- [A customized Standard does not receive the grant] → documented; operators add `tools.showArtifact` in the preset editor.
