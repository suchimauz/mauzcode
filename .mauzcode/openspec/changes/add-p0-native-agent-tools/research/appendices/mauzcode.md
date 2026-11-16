# MauzCode: native tools и eval-only capabilities

## Срез и метод

Проверено чтением исходников, деклараций и доступной runtime documentation. HEAD `4d3d618a21fc3404970c72a928d60afffb6f584e`; начальный `git status --short` пуст. Прочитаны AGENTS.md, релевантные разделы docs/architecture.md, docs/runtime-authoring.md, docs/agent-presets.md. Тесты/typecheck CLI не запускались, проект не менялся; единственная запись — этот отчёт в workspace.tmp. Не следует путать поставляемые файлы, смонтированные плагины и доступность конкретному preset/session.

## 1. Точный native inventory

Native означает model-facing function declaration, а не любую функцию `ctx.fns`.

**Core: 11 деклараций**:

| Wire/short name | Реализация / декларация |
|---|---|
| bash | tools.bash; src/tools/$tool_bash.md:1 |
| read | tools.read; src/tools/$tool_read.md:1 |
| write | tools.write; src/tools/$tool_write.md:1 |
| edit | tools.edit; src/tools/$tool_edit.md:1; дополнительный validator tools.editValidate |
| find | tools.find; src/tools/$tool_find.md:1 |
| grep | tools.grep; src/tools/$tool_grep.md:1 |
| eval (в текущем tool interface: tools_eval) | tools.eval → repl.eval; src/tools/$tool_eval.md:1; src/tools/eval.ts:1 |
| respondHtml | agent.respondHtml; src/agent/$tool_respondHtml.md:1 |
| create_goal | goal.toolCreate; src/goal/$tool_create_goal.md:1 |
| get_goal | goal.toolGet; src/goal/$tool_get_goal.md:1 |
| update_goal | goal.toolUpdate; src/goal/$tool_update_goal.md:1 |

**Shipped optional plugin declarations: ещё 2**: `gitReviewComments`, `gitResolveComment`, соответственно plugins/git/src/gitUi/$tool_gitReviewComments.md:1 и $tool_gitResolveComment.md:1. Это не core git.run/commit/push. Наличие в checkout не доказывает mount или grant.

**Текущий native interface этой child session** дополнительно объявляет nrepl `connect`, `describe`, `nrepl_eval`, `interrupt`, `close`. Итого 16 доступных функций namespace functions: 11 core + 5 nrepl. `multi_tool_use.parallel` — wrapper предоставленного интерфейса, не найденная core `$tool` декларация. В нынешнем интерфейсе gitUi tools не объявлены. Исходники внешнего nrepl-плагина в рамках исследования не читались; его имена/схемы подтверждены предоставленным tool interface, не checkout.

`runtime.docs.*`, `code.*`, `agent.readResult`, delegation/plans, input/canvas, browser/websearch, обычные git helpers не имеют native `$tool_*.md` деклараций в исследованных src/plugins/.mauzcode. Это eval-only API, даже если prompt подробно объясняет вызовы.

## 2. Как инструменты реально регистрируются и проходят guard

- `src/tools/$loader_tool.ts:1`: `$tool_*.md` → registry; декларация содержит JSON Schema, optional `fn` mapping и validator. Сами runtime функции не автоматически tools.
- `src/tools/list.ts:18-30`: stable sort по key; уникальный short name остаётся коротким, коллизии получают `<module>_<name>` (точки namespace заменяются `_`). Predicate фильтрует по implementing fn.
- `src/agent/wireTools.ts:12-22`: model-neutral ToolSpec; фильтры agent.tools и frozen preset. Goal completion receipt специально возвращает пустой tools array.
- Текущий provider path использует нейтральные ToolSpec и адаптеры: `src/models/protocol/openaiChat/toTools.ts:1`, `openaiResponses/toTools.ts:1`, `anthropic/toTools.ts:1`. Chat Completions — nested function; Responses — flat function; Anthropic — input_schema. OpenAI strict включается только для рекурсивно strict-compatible schema, иначе false. `src/tools/schemas.ts:22-36` также умеет три формы, но это не основание считать его текущим agent dispatch path.
- `src/tools/call.ts:33-59`: lookup → preset check implementing fn → schema validation → optional bespoke validator. Отказ до выполнения: handlerExecuted:false; schema и инфраструктурные ошибки не надо путать с handler errors.
- `src/tools/call.ts:63-75`: caller agent задаёт session/workspace через session.forAgent, запуск регистрируется в tool lifecycle. Это существующий общий dispatcher, не отдельная система для каждого provider.
- `src/repl/eval.ts:20-29`: eval получает guardFns facade и trusted agent binding. `src/agentPreset/guardFns.ts:36-42`: прямые ctx.fns calls проверяются, callable заново разрешается при invocation; discovery predicate внедряется самим facade.

## 3. Presets: правила != доступная установка

Источники: docs/agent-presets.md:5-30, 62-68; src/agentPreset/coreCatalogue.ts:1.

- Standard: reviewed explicit core patterns; семь plugin grants openspec/git/websearch/browser/gh/terminal/glab; projects только list/get.
- Creator: allow:["*"], plugins:["*"]. Minimal: tools.bash/read/write/edit, без plugins.
- Snapshot фиксирует правила, не каталог функций. Новая функция под уже разрешённым wildcard может стать доступной; новый namespace Standard требует классификации.
- Deny сильнее allow; core allow не выдаёт plugin grant. Project-local namespace без core origin обычно разрешён, если не denied.
- Child наследует independent copy; выбор child preset добавляет слой пересечения, а не расширяет parent.
- Capability-filtered prompt/docs/catalogue требуют live+allowed dependencies; metadata для input/canvas влияет на discovery, а не заменяет action authorization (docs/architecture.md:14-18).
- В этой session `runtime.docs.get({name:'tools.list'})` отказал `no such available function`. Это не отсутствие source/API вообще и не повод обходить guard. Не вызывался denied tools.list через другие пути. По сообщению parent его plugin search видит mounted nrepl, а не весь shipped набор; данный факт не перепроверялся обходом.

## 4. Карта eval-only API

| Категория | Реальные функции / источники | Ограничение |
|---|---|---|
| Runtime discovery | runtime.docs.search/get/list; src/runtime/docs/search.ts:1, get.ts:1, list.ts:1 | Доступный каталог, не список всех файлов |
| Code graph | code.slice/callers/quality/coverage/dead; src/code/slice.ts:6-18, callers.ts:1, quality.ts:1, coverage.ts:1 | Индекс registered runtime; не универсальный LSP для любого target repo |
| Plugins | plugins.search/read/functions/list; src/plugins/search.ts:1, read.ts:1, functions.ts:1 | search объединяет plugin workflow index и functions index; mount/grant обязательны |
| Agents/team | agent.delegate/team/ask/message/search/steer/finishTask/archiveMember; src/agent/delegate.ts:1, finishTask.ts:1; allow entries src/agentPreset/coreCatalogue.ts:16-39 | Trusted agent/session, ownership; завершённый child обязан вернуть JSON result |
| Shared contexts | sharedAgent.list/delegate/result; src/sharedAgent/list.ts:1, delegate.ts:1, result.ts:1 | Это опубликованные context agents, не доступ к произвольному transcript |
| Plans | session.plan/done/updatePlan/removePlan; src/session/plan.ts:1, done.ts:1 | План задач не равен planning mode |
| Planning mode | planning.enter/propose; src/planning/enter.ts:1, propose.ts:1 | Отдельный durable workflow, не скрытый переход от session.plan |
| Durable triggers | agent.wake/cron/watch/triggers/cancelTrigger/cancelAllTriggers; src/agent/wake.ts:1, cron.ts:1, watch.ts:1 | Scheduled agent wake, не shell process handle |
| Input | input.request/kinds; src/input/request.ts:1 | waitForAnswer:true — durable gate, request немедленно возвращает id; ответ приходит новым turn |
| Canvas | canvas.show/list/close/reopen/setState/search; src/canvas/show.ts:1 | UI surface; file/url/html имеют разные security модели |
| Browser (shipped plugin) | browser.tabs/navigate/snapshot/screenshot/click/fill/press/evaluate/research/googleSearch; plugins/browser/src/browser/*:1 | Не native declarations; требует доступного browser plugin и подключённого browser |
| Web (shipped plugin) | websearch.search/read/fetch/answer; plugins/websearch/src/websearch/{search,read,fetch,answer}.ts:1 | Не подтверждено live в этой session |
| Remote shell | remote.servers/exec; src/remote/exec.ts:1 | SSH transport, не general resumable background API |
| Shell/tool lifecycle | tools.runs/abortRun, beginRun/endRun/appendRunOutput; src/tools/runs.ts:1, abortRun.ts:1 | Внутренняя memory registry running calls; не обещание доступности агенту через preset |
| Tests | code.tests/testFiles/runTests/testRunStatus; src/code/runTests.ts:1, testRunStatus.ts:1 | Runtime project test tooling; в исследовании не запускалось |
| Git | git.run/status/stage/commit/push/stageCommitPush; src/git/run.ts:1, commit.ts:1, push.ts:1 | Core helpers отдельно от optional git UI plugin |
| Secrets | secrets.list, tool secrets maps; src/secrets/list.ts:1 | Возвращать references/metadata, не значения |

## 5. Background execution: что есть и чего не доказано

`src/agent/executeBash.ts:1-16,45` использует async Bun.spawn: не блокирует event loop, но вызывающий tool ждёт окончания либо timeout. Timeout возвращает накопленный output. Комментарий явно предупреждает: stray grandchild может остаться ОС. Это не start→handle→poll→resume API.

`src/remote/exec.ts:4,39-42,81-109`: persistent SSH ControlMaster; timeout пытается завершить remote process group/tree. Persistent connection не означает persisted shell job.

`src/tools/runs.ts:1-10,20-28`: executing tool calls в памяти, переживания server restart нет. `tools.abortRun` — отмена текущего зарегистрированного вызова, не attach к произвольному PID.

`plugins/terminal/SKILL.md` описывает UI terminal без agent-facing functions; src/terminal здесь не источник resumable exec.

В src/plugins/overlay при scoped discovery не найден отдельный module exec/background/process manager с жизненным циклом start/read/wait/kill. В live docs поиск background execution process start poll kill MCP LSP также не дал такого API. Это ограниченный отрицательный результат по текущему checkout+доступному каталогу, не утверждение о невозможности установить внешний plugin.

## 6. Bounded outputs и stale-read contracts

- `src/agent/stashResult.ts:1-37`: <=6000 JS characters inline, больше — immutable stored result UUID с bounded preview; bash сохраняет tail preview, прочие head. readId receipt стараются оставить видимым. Storage failure явно означает no saved full output, без retrieval reference.
- `src/agent/readResult.ts:1-27`: UUID проверяется по доступной истории/fork boundaries или собственным trigger runs при каждом чтении, включая cache hit. Default 4000, max 16000 UTF-16 units; ok/text/truncated/error. Legacy rN unavailable; foreign/unknown not_found. Не читать scratchpad.results и не повторять операцию ради восстановления результата.
- `src/tools/edit.ts:18-22,44-55`: readId связан с session/path/host/version/range, TTL 30 минут, потеря при restart; literal/anchor modes. Concurrent version conflict не перезаписывается, возвращается свежая receipt/диапазон.
- `src/tools/write.ts:46-97`: replace требует complete read, expectedVersion передаётся writer; create — ifAbsent. Важный пробел: legacy path-only write остаётся и может overwrite без version check, выводит warning. Native schema/инструкция рекомендует безопасный путь, но не весь исторический API принудительно stale-safe.
- `src/files/write.ts:9,86-94`: in-process queue + exclusive lock directory, precondition внутри lock, fsync/rename; SSH аналог. Lock координирует только MauzCode writers: shell/direct fs/editor обходят его.

## 7. Security и interaction: конкретные границы

- Presets **не sandbox**, eval/shell имеют server-process privileges: docs/architecture.md:9; docs/agent-presets.md:62. Guard ограничивает ctx.fns facade, не OS filesystem/process/network.
- `src/procs/repl/eval.ts:29-39`: TS source typecheck до исполнения. Это не runtime validation и не permission boundary; any может пересечь границу. Автоматическая проверка одного ошибочного eval в этом исследовании отказала implicit-any до выполнения. CLI typecheck не запускался.
- `src/tools/call.ts:44-59`: JSON schema и bespoke validation защищают tool arguments. Не следует приравнивать это к schema-validation каждой произвольной прямой runtime функции.
- `src/input/request.ts:1`: explicit waitForAnswer; не poll/sleep. Обычный confirm собирает решение, но approval защищённых flows требует их собственного exact approval, не произвольного confirmed boolean.
- `src/canvas/$canvas_html.ts:1-3,41-44`; `src/canvas/htmlFrame.ts:16-20`: HTML iframe с opaque origin, без allow-same-origin, CSP connect-src none, CDN allowlist; имеются allow-forms/modals/downloads/popups — не описывать как абсолютный запрет всех внешних side effects. Это sandbox **canvas HTML**, не sandbox eval.
- `src/git/commit.ts:9-14`, push.ts:9-13 напрямую вызывают git.run, сами не спрашивают confirm. Обязательная human approval этих действий задана policy AGENTS.md, не универсальным техническим gate git helpers. Нельзя объявлять все outward actions принудительно защищёнными одним механизмом.

## 8. Неясности / проверенные ограничения

1. Shipped browser/websearch/git plugin ≠ mounted/granted. Текущий tools interface подтверждает nrepl, но не их availability. Полный unfiltered registry намеренно не извлекался после отказа docs tools.list.
2. Нет подтверждённых MCP/LSP namespaces/плагинов в scoped src/plugins discovery. Code graph и in-process TypeScript language service для eval не равны MCP connector/LSP tools для target workspace.
3. Нет подтверждённого resumable background exec lifecycle. Agent triggers/delegation и active tool cancellation — другие механизмы.
4. docs/runtime-authoring.md:40 ещё упоминает src/llm provider dispatch, тогда как проверенные актуальные provider-neutral tool adapters находятся в src/models. Для tool path опираться на agent.wireTools и models/protocol source.
5. `tools.schemas` существует, но не надо выдавать его за непосредственный текущий agent provider path.
6. Исторические edit/write режимы и shell/direct FS означают, что stale-read protection не универсальна для всех способов записи.
7. `tools.list` source существует, но denied API в данном preset. Доступность names нельзя определять одним наличием файла.

Практических изменений или проектных рекомендаций не делалось. Все утверждения о runtime availability ограничены явно указанными наблюдениями.
