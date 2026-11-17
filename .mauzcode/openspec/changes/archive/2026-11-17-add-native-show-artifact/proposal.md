## Why

Showing a file or report to the person beside the chat currently requires the agent to know the canvas API and call `canvas.show({ kind: "file", args: { path } })` through `tools_eval`. That costs an eval round trip, exposes typecheck failures, and depends on the agent reading the Canvas prompt section. The native tools roadmap (`add-p0-native-agent-tools/research/README.md`) lists `show_artifact` as a small P1 tool; the P0 and P1 bundles are shipped, so this is the next small, well-bounded item.

## What Changes

- Add native tool `show_artifact`: open a workspace file or directory on the invoking agent's canvas as the active tab, with optional `title`, `host` and display `mode`; return the tab id, title and resolved path.
- Bind the canvas owner to the trusted invocation; arguments cannot select another agent's canvas.
- Restrict the tool to the built-in `file` canvas kind; arbitrary kinds, HTML and URLs stay on `canvas.show` through evaluation.
- When the agent can call the tool, the Canvas prompt section names it instead of the eval call for files.
- Grant the adapter in the built-in Standard preset through a conservative migration, as for P0 and P1; customized presets are not changed.
- Add an `artifact` scenario to `bench.routes` and measure it, including the per-request cost of one more schema in the other scenarios.

## Capabilities

### New Capabilities

- `native-artifact-display`: a typed native tool that shows a workspace file to the person on the invoking agent's canvas.

### Modified Capabilities

None.

## Impact

One `$tool_show_artifact.md` declaration and `tools.showArtifact` adapter in `src/tools/`, delegating to `canvas.show` with kind `file`; a small branch in `canvas.promptSection`; a Standard preset migration and catalogue entry; tests next to the existing native tool tests; one benchmark scenario. No change to canvas storage, kinds, routes or UI.
