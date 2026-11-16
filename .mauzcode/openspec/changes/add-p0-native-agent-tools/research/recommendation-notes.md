# Рабочие критерии сравнения (не итоговый отчёт)

## Что считаем инструментом

Model-visible tool = реально включённая в запрос к модели declaration/schema/hosted tool. Не смешивать: executable handler, CLI slash-command, внутренний API, prompt instruction, MCP extension, опциональный экспериментальный инструмент. Указывать default/model/config gating.

## Оси сравнения

1. Чтение/поиск/правки: ranges, output limits, stale-read guards, multi-file/rename, multimodal.
2. Выполнение: cwd/host, stdin/PTY, background handle, output paging, cancel, restart semantics, timeout/process group.
3. Работа с интернетом: search vs raw evidence read vs LLM summary, citations, SSRF/auth, external prerequisites.
4. Оркестрация: delegation vs messaging vs waiting vs durable plan; нельзя смешивать plan tracking и permission mode.
5. Расширение: registry, plugin/skill discovery, MCP, lazy loading и фильтрация permissions.
6. Анализ кода: regex vs syntax/symbol/LSP; local runtime index != target workspace index.
7. Безопасность: native surface != sandbox; permission request != permission enforcement; allowlist != user authorization.
8. Наблюдаемость: executed/accepted/completed, typed failures, immutable outputs, retry/idempotency.

## MauzCode: подтверждённые опорные факты

- HEAD 4d3d618a21fc3404970c72a928d60afffb6f584e, исходно чистый checkout, snapshot 2026-11-16 UTC.
- `src/tools/$loader_tool.ts`: declarations `$tool_*.md/json`, `fn` maps ordinary procs implementation.
- `src/tools/list.ts`: stable key ordering, short wire names with module prefix on collisions, visibility by function.
- `src/tools/schemas.ts`: OpenAI Chat/Responses/Anthropic adapter; only strictable schema gets strict=true.
- `src/tools/call.ts`: schema/validator, preset check, derived agent session/workspace, tool run/cancellation, executed vs error.
- `src/agentPreset/guardFns.ts`: guarded eval discovery but allowed procedures receive unguarded caller context; not OS sandbox.
- `src/agent/readResult.ts`: UUID ownership/history authorization per read, bounded UTF-16 ranges, structured failure, eval-only declaration missing.
- `src/input/request.ts`: durable explicit wait, return immediately, user result later; UI dispatch is not user confirmation.
- `src/agent/delegate.ts`: returns child id; async worker, bounded task packet, structured completion requirement. Native adapter must inject current agent; no Agent object in model schema.
- `src/planning/enter.ts`: explicitly requested advisory mode transition, distinct from session.plan task tracking.
- `src/agent/executeBash.ts`: await process completion/deadline/abort; no agent resumable PTY/job handle in signature. Timeout kills process, comment acknowledges stray grandchild risk. UI live tail not background process API.
- `plugins/terminal/SKILL.md`: explicitly no agent-facing functions; local Canvas terminal only.
- `plugins/websearch/SKILL.md`: search/read/fetch/answer are existing plugin capabilities, read preserves Markdown, answer citation verification. Availability depends on actual plugin mounting/config/browser, not shipped docs.
- Current plugin search exposed only nrepl, so never claim browser/websearch/terminal are available here merely because source exists.
- `src/goal/toolCreate.ts`: existing precedent for narrow native adapter backed by trusted invocation context, not mutable model-supplied authority.

## Предварительные рекомендации, требуют внешнего сравнения

P0: native capability discovery/schema retrieval, read_result, input_request; then native plan/delegation adapters. Reuse registry, permission checks and handlers, no second business logic.
P1: optional plugin web_search/web_read; actual resumable exec lifecycle if missing; target-project semantic tools (LSP) distinct from host code graph. Optional native show_artifact for user-visible report/file.
P2: safe multi-file patch transaction only if measured advantage over current edit/write; MCP as interoperability project, not generic security-free invoke.
Keep eval for bounded data composition/batching; avoid exporting all runtime APIs, admin/secret/storage operations, arbitrary lower-level call bypasses. Model-specific native tool set rather than huge one-size-fits-all.

## Verification strategy for eventual implementation (not executed)

A/B same model/tasks/grants for eval baseline vs selected native tools: completed outcomes, discovery round trips, schema rejection/parameter typos, p50/p95 latency, input/output tokens, lost evidence, interrupted jobs, approvals, stale-edit conflicts. No made-up performance estimates. Test preset-filtered schemas/docs, no denied leaks, session/host binding, ownership, invalid-input zero effects, wait ordering, user approval authority, cancellation and stream failures, retry after commit failure, bounded output, provider schema compatibility.
