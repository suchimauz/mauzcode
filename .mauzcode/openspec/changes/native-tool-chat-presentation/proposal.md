# Proposal

## Why

Native tools (`respondHtml`, `todo_update`, `todo_done`, `delegate_task`, `finish_task`, `request_input`, `show_artifact`, `read_result`, `tool_search`, `tool_describe`, goal and Git review tools) render in chat with a generic wrench, their raw identifier and an arbitrary first string argument or a raw JSON blob as summary. Presentation lives in four diverging places — frontend `toolKind`/`toolSummary`, a copy of `toolSummary` in the events GET route, and backend `agent.toolMeta` used for running tools — so a running row and the finished row of the same call show different labels, icons and summaries. Text is also cut on the server (90 chars in `toolMeta`, 300 in `beginRun`), and an expanded running tool shows only its output tail: the full command being executed is not visible anywhere.

## What Changes

- Each native tool declaration carries one `presentation` block: label, icon id from a fixed allow-list, and a summary given as a template over arguments or a named built-in formatter. Core and plugin tools are declared the same way.
- A single server function resolves `{ label, icon, summary }` for a call; it replaces `agent.toolMeta`, frontend `toolKind`/`toolSummary` and the events-route copy. Running and finished rows of a call are identical in the collapsed state.
- No server-side truncation of summaries. The collapsed row is one line clipped only visually (CSS ellipsis) with the full text in a tooltip.
- An expanded row — finished or running, desktop or mobile modal — shows a "Call" section with the complete arguments (full command/code with copy, path with open, other arguments as key/value) and an "Output" section. The live tool registry carries the full sanitized arguments so the currently running command is visible in full.
- Running output is no longer kept as a 4000-char tail: a streaming call keeps its output in memory (per-run cap with a drop marker), the chat keeps the existing refresh signal, and an expanded running row loads output by offset from a new access-checked route.
- Restyled rows: per-category icon tint, weighted label, muted monospace summary for paths/commands, explicit error icon.
- Presentation for all current native tools; read/write/edit/grep/find/bash/eval get one unified summary each.

## Capabilities

### New Capabilities

- `native-tool-chat-presentation`: How native tool calls are named, iconified, summarized and expanded in chat rows, running rows, mobile modals and work-group headers, including declaration rules, fallbacks and secret redaction.

### Modified Capabilities

None. Tool schemas, execution and presets are unchanged.

## Impact

`types.tools.Tool` and the tool loader; `$tool_*.md` in `src/tools`, `src/goal`, `src/agent`, `plugins/git`; `agent.toolMeta` (removed); `tools.beginRun`, `tools.appendRunOutput`, `tools.endRun` and the active-tool broadcast; a new route for running-call output; events GET routes; frontend `ToolRow`, `ActiveToolRow`, `ToolModal`, `WorkGroups`, `toolKind`, `toolSummary`, `tool-row.css` and their tests/stories. No migration, no new dependency (lucide icons already bundled). This document defines future work; it does not implement it.
