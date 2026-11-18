# Tasks

## 1. Declaration contract and resolver

- [x] 1.1 Add `presentation` to `types.tools.Tool` (label, icon allow-list, category, summary). Validate in the tool loader with per-field fallback and warning. Unit-test valid, unknown icon/formatter and malformed cases.
- [x] 1.2 Implement the summary template engine per design §1 grammar (`{key|filter}`, non-nested `[...]`, top-level ` || ` alternatives; malformed template → fallback + warning) and formatters `@read`, `@edit`, `@search`, `@command`, `@code`, `@todos`. Unit-test each.
- [x] 1.3 Implement `tools.presentation({ name, args })` with name normalisation (`tools_eval`, dotted names), lookup across mounted declarations, safe fallback summary, no length cap. Implement shared argument redaction (`secrets` incl. references, `env`, `x-secret: true` schema properties). Unit-test fallbacks, aliases and redaction.

## 2. Declarations

- [x] 2.1 Add presentation to read/write/edit/grep/find/bash/eval using the unified formatters.
- [x] 2.2 Add presentation to respondHtml, todo_update, todo_done, delegate_task, finish_task, request_input, show_artifact, read_result, tool_search, tool_describe, create_goal, get_goal, update_goal.
- [x] 2.3 Add presentation to Git `gitReviewComments` and `gitResolveComment`. Test that every core/official native tool declares a non-default presentation.

## 3. Server surfaces

- [x] 3.1 `tools.beginRun`: store and broadcast `label`, `icon`, `category`, full `summary` and redacted `args`; remove the 300-char cut and delete `agent.toolMeta` (its only caller); reference large args (> 64 KiB) and serve them on demand. Test redaction and size threshold.
- [x] 3.2 Events GET routes: replace the local `toolSummary` and `toolPreview` with the resolver; remove `subject.slice(0, 500)` in `activeTools`; add `toolLabel`, `toolIcon`, `toolCategory`; redact args in tool details. Test known, plugin, ungranted, alias, undeclared and historical names.
- [x] 3.3 Test that running and finished presentation of the same call are equal (`bash`, `tools_eval`, plugin tool).

- [x] 3.4 Full running output: remove `MAX_TAIL` trimming in `appendRunOutput`; keep output in memory with a 16 MiB per-run cap and drop marker; add `outputStart`/`outputEnd` and a ~4 KiB `tail` in `activeTools` (replacing `tail.slice(-12000)`); release in `endRun`. Add `GET /v1/agents/:id/runs/:runId/output?from=` with the events-route access check. Test offsets, cap/marker, release, 404 for finished runs and access control.

## 4. Chat UI

- [x] 4.1 Single icon-map module (allow-list → lucide); delete `toolKind`/`toolSummary`; `ToolRow`, `ActiveToolRow`, `ToolModal`, `WorkGroups` use server fields with minimal fallback.
- [x] 4.2 Shared `ToolCallPanel`: Call section (full command/code with copy, path with open, key/value args, expandable nested values) above Output; used for finished, running and mobile views; fetch referenced large args on expand. Running output: fetch from 0 on expand, then from last `end` on each refresh; show drop marker; sticky-bottom scroll; render last ~5000 lines with "show earlier".
- [x] 4.3 Restyle `tool-row.css`: category tints, label weight, muted monospace summary, error icon/accent, single-line ellipsis with tooltip, identical layout for running/finished.
- [x] 4.4 Update tool-row, tool-summary, current-action, tool-timing and work-groups tests and ToolRow/Execution/WorkGroups stories with the new tools and a long multi-line running command.
- [x] 4.5 Visual check in the running app: light/dark, desktop/mobile, running and finished rows, failed call, long command expanded.
