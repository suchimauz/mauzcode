# Design

## Context

Today: frontend `toolKind.ts` (lucide icon + label for 9 names) and `toolSummary.ts`; a copy of `toolSummary` in `src/api/$route_v1_agents_$id_events_GET.ts`; backend `agent.toolMeta` (Phosphor ids, lowercase labels, own `subject` with read ranges, edit counts, `/pattern/ in path`, cut to 90 chars) used by `tools.beginRun` (cut again to 300). `ActiveToolRow` shows `run.subject` and the output tail only; full arguments of a running call are not kept. Declarations are `$tool_<name>.md` YAML frontmatter typed by `types.tools.Tool`; native name `tools_eval` maps to `$tool_eval.md`.

## Goals / Non-Goals

Goals: one source of truth per tool next to its declaration; identical collapsed row for running and finished state; no truncation of content in expanded view; full current command visible while running; consistent, more legible styling.
Non-goals: specialised result bodies (rendering a todo list, goal card or HTML preview inside the panel); localisation of labels; marker-protocol rendering changes.

## Decisions

1. **Declaration shape** in `types.tools.Tool`:
   `presentation?: { label: string; icon: ToolIcon; summary?: string; category?: "files" | "search" | "commands" | "agent" | "git" | "tools" }`.
   `summary` is either a template or `@formatter`. Template grammar: a placeholder is `{key}` or `{key|filter}` with exactly one filter from `first-line`, `count`, `basename` (a single `|` inside braces is always a filter). An optional segment `[...]` renders only when every placeholder inside is non-empty; segments do not nest. Alternatives are top-level ` || ` between whole templates (outside braces and brackets): the first alternative whose required (non-optional) placeholders are all non-empty wins, else the summary is empty. Examples: `{path}[ · {status}]`, `{note|first-line} || {id}`. A summary starting with `@` names a formatter naming a built-in formatter for cases templates cannot express. Templates over free-form code were rejected for formatters as unreadable.
2. **Built-in formatters**: `@read` (`path :start-end`/`+max`, `#` for hashline), `@edit` (`path · N edits`), `@search` (joined `queries[]`, else `pattern`/`query`, `in path`, `(glob)`), `@command` (`description` else first line of `command`), `@code` (`description` else first line of `code`), `@todos` (`title`, else `N tasks`).
3. **Icon allow-list** (semantic ids mapped to lucide in one frontend module): `file`, `file-plus`, `file-edit`, `search`, `terminal`, `code`, `answer`, `checklist`, `check`, `delegate`, `flag`, `form`, `canvas`, `archive`, `compass`, `book`, `target`, `comment`, `comment-check`, `plug`, `unplug`, `stop`, `info`, `ticket`, `clock`, `user`, `list`, `status`, `wrench`. Unknown id → `wrench` + loader warning.
4. **Name resolution**: the call name is normalised (last dotted segment; `tools_eval` → `eval` — the mapping is defined once in the resolver, since today it exists only as an ad-hoc list in the events route) and looked up among all loaded declarations, including tools of plugins that are mounted but not granted to the agent. Not found → `{ label: name, icon: "wrench", category: "tools", summary: fallback }`.
5. **Single resolver** `tools.presentation({ name, args })` → `{ label, icon, category, summary }`. Fallback summary: first non-empty string argument excluding `html`, `secrets`, `env` and any key whose schema property has `x-secret: true`; first line only; never `JSON.stringify` of an object. No length cap anywhere on the server: the 1000-char cap in the events route, the 90/300 cuts in `toolMeta`/`beginRun` and the `subject.slice(0, 500)` in `activeTools` are removed. Summaries are first lines, so their size is bounded by the argument itself; large arguments are handled by reference (see 7).
6. **Surfaces**: events GET routes add `toolLabel`, `toolIcon`, `toolCategory` beside `toolSummary`; `beginRun` stores the same fields plus `args` (sanitised, see 7) and broadcasts them. `agent.toolMeta` has a single caller (`beginRun`), so it is deleted in the same change rather than kept as a delegating shim. The separate `toolPreview` helper in the events route is replaced by the resolver too. Frontend `toolKind`/`toolSummary` are deleted; the client keeps only the icon map and a minimal fallback (wrench + name) for missing fields.
7. **Expanded view** (`ToolCallPanel`, shared by `ToolRow`, `ActiveToolRow`, `ToolModal`):
   - "Call" section first: `command`/`code` as a full monospace block with wrapping and a copy button; `path` with "Open in Canvas"; other arguments as key/value rows, nested objects folded behind a toggle but fully expandable; nothing truncated.
   - "Output" section: finished — existing result body; running — live tail as now.
   - Sanitisation: values of `secrets`, `env` and keys marked `x-secret: true` in the tool's parameter schema are replaced by `••• (N keys)` (objects) or `•••` (strings); applied on the server before broadcast and in the events detail route. `bash` `secrets` holds references (`op://`, `secret://`), not values; they are hidden as well, because a reference reveals vault structure and is not needed to understand the call.
   - Running args are kept in the in-memory run registry only; large args (> 64 KiB) are sent as a reference fetched on expand.
8. **Full running output**: `appendRunOutput` stops trimming to `MAX_TAIL` and keeps the output of a run in memory with a per-run cap of 16 MiB; beyond it the oldest output is dropped, `start` advances so offsets stay valid, and the panel shows `[earlier output dropped: N bytes]`. No temp-file spill: the complete output is stored as the tool result when the call ends, so retained running output only serves the live view. Today only `bash` (`executeBash`) streams output; other tools show the panel without live output.
   Transport stays as today: the chat is notified by the throttled `events.refresh` signal and re-reads state; no chunk push channel is added. The events GET route keeps a short `tail` (last ~4 KiB, replacing `tail.slice(-12000)`) in `activeTools` for the collapsed row and adds `outputStart`/`outputEnd` byte offsets. A new route `GET /v1/agents/:id/runs/:runId/output?from=` returns `{ start, end, text }` from `max(from, start)`; it uses the same agent access check as the events route and returns 404 for an unknown or finished run. An expanded running row fetches from 0 once, then from its last `end` on each refresh. The panel sticks to the bottom unless the user scrolled up and renders the last ~5000 lines with a "show earlier" control; no virtualisation library is added. Retained output is released in `endRun`; the registry is in memory, so no startup cleanup is needed.
9. **Styling** (`tool-row.css`): label `font-weight: 500`, summary muted and monospace for `files`/`search`/`commands`; icon tint by category using existing theme tokens (light/dark); error state uses a red icon and border accent, not just text colour; collapsed row single line with `text-overflow: ellipsis` and full summary in `title`; consistent 14px icon, gap and row height for running/finished rows.
10. **Work groups** derive their category from `toolCategory` instead of hard-coded names.

## Proposed presentation

| tool | label | icon | category | summary |
|---|---|---|---|---|
| read | Read | file | files | @read |
| write | Write | file-plus | files | `{path}` |
| edit | Edit | file-edit | files | @edit |
| grep | Grep | search | search | @search |
| find | Find | search | search | @search |
| bash | Bash | terminal | commands | @command |
| eval | Eval | code | commands | @code |
| respondHtml | Answer | answer | agent | `{text\|first-line}` |
| todo_update | Todos | checklist | agent | @todos |
| todo_done | Todo done | check | agent | `{id}` |
| delegate_task | Delegate | delegate | agent | `{title}[ · {tasks\|count} tasks]` |
| finish_task | Finish task | flag | agent | `{summary\|first-line}` |
| request_input | Ask user | form | agent | `{title}[ · {kind}]` |
| show_artifact | Show | canvas | agent | `{title}` else `{path}` |
| read_result | Read result | archive | tools | `{id}[ @{offset}]` |
| tool_search | Find tools | compass | tools | `{query}` |
| tool_describe | Describe tool | book | tools | `{name}` |
| create_goal | Create goal | target | agent | `{objective\|first-line}` |
| get_goal | Goal status | target | agent | — |
| update_goal | Update goal | target | agent | `{status}` |
| gitReviewComments | Review comments | comment | git | `{path}[ · {status}]` |
| gitResolveComment | Resolve comment | comment-check | git | `{note\|first-line}` else `{id}` |

"else" is written as template alternatives `a || b`.

## Risks / Trade-offs

- [Secrets in expanded args] → server-side redaction before broadcast and in details; tests with `bash` `secrets`/`env`.
- [Running output memory] → 16 MiB per-run cap with a drop marker; released in `endRun`.
- [Refresh volume] → refresh stays throttled; `activeTools` carries only a short tail and offsets; full text is fetched by expanded rows only.
- [Large running args in broadcast] → size threshold with fetch-on-expand.
- [Template mini-language grows] → fixed filter set; anything else becomes a named formatter reviewed in core.
- [Old client / new server] → fields are additive; old client keeps its tables until updated.

## Migration Plan

Additive server fields and declarations first, then frontend switch, then removal of `toolKind`/`toolSummary`, the events-route copy and `agent.toolMeta`. Rollback: revert the frontend; server fields are ignored by old clients.
