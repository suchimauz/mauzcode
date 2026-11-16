# OpenAI Codex: инструменты coding harness — проверка исходников

## Срез и метод

Публичный репозиторий: https://github.com/openai/codex. Default branch **main**, HEAD **090be4df0724cdef5758e6a0934ba557af8b6bbe**, commit date **2026-11-16T16:38:13Z**, subject `Close late command approval items when turns are interrupted (#61841)`. HEAD получен `git ls-remote --symref`, затем подтверждён `git show` в shallow clone. Это существенно более новый срез, чем широко цитируемые старые списки Codex tools.

Исследование статическое: registry/spec assembly, реальные handlers, feature catalogue, extension contributors. Никаких сборок, установки зависимостей, вызова платных backend/API, commit/push. Clone и отчёт только в `/home/suchimauz/mauzcode/.mauzcode/tmp/qg/`; checkout чистый (`git status --short` пуст). Корневого AGENTS.md в этом commit нет; найденные вложенные AGENTS.md относятся к другим поддеревьям (rollout-trace, code-mode-host, exec-server/sandbox_integrity, tui/bottom_pane), не к исследованным tools/core/ext. Инструкции родительского workspace прочитаны.

**Важное ограничение:** единого неизменного списка model-visible tools нет. Он строится для turn из модели, provider capabilities, config/features, среды, уровня агента, MCP и extension contributors. Backend-hosted web search нельзя описывать как обычный локальный handler. Проверенный ниже список — union поверхностей, а не обещание, что каждый пользователь видит всё одновременно. Динамические MCP/app tools невозможно перечислить без конкретной конфигурации.

## 1. Registry и поверхность модели

Основной assembly — `core/src/tools/spec_plan.rs`; фактическая регистрация — `registry.rs`. Registry различает trusted builtin и external runtimes, обнаруживает коллизии имён. `ToolExposure` отдельно описывает Direct, Deferred, DirectModelOnly, DeferredModelOnly, CodeModeOnly, Hidden. Следовательно «зарегистрирован» не значит «виден модели сейчас» и не значит «доступен из code mode».

Источники: [assembly и shell/utility registrations](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/spec_plan.rs#L1235-L1509), [registry](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/registry.rs#L442-L630), [exposure enum](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/tools/src/tool_executor.rs#L51-L96).

## 2. Исполнение, background и permissions

| Точное имя | Ключевой контракт | Доступность |
|---|---|---|
| `exec_command` | `cmd` обязателен; `workdir`, `shell`, `login`, `tty`, `yield_time_ms`, `max_output_tokens`; в multi-environment — `environment_id`. Вывод: `wall_time_seconds`, `output`; опционально `chunk_id`, `exit_code`, `session_id`, `original_token_count`. | `ShellTool` и shell_type не Disabled. UnifiedExec по умолчанию true. |
| `write_stdin` | `session_id` обязателен; `chars`, `yield_time_ms`, `max_output_tokens`. Ввод/опрос продолжающегося процесса, не resume диалога. | Только при UnifiedExec. |
| `request_permissions` | `permissions` обязателен; `reason`, `environment_id`; profile включает network/file_system. Запрашивает расширение полномочий, а не исполняет команду. | RequestPermissionsTool, UnderDevelopment, default false. |
| `wait_for_environment` | Ожидание готовности вычислительной среды; не shell background job. | DeferredExecutor, UnderDevelopment, default false. |

При отключённом UnifiedExec managed policy сохраняет **одноразовый `exec_command`**, но исключает resumable process и `write_stdin`. Это важная поправка к старым спискам с `shell` / `shell_command`: в исследованном registry shell ветка использует именно exec_command.

Shell schema содержит `sandbox_permissions`: `use_default`, `require_escalated`, а `with_additional_permissions`/`additional_permissions` добавляются при разрешённом ExecPermissionApprovals и policy. Также `justification`, `prefix_rule`. Prefix rule — запрашиваемое повторно используемое approval для escalated command; наличие поля само по себе не даёт права.

ToolOrchestrator проводит approval, выбор sandbox и retry после sandbox denial. Guardian approval относится к проверенному объёму полномочий: escalation retry требует новой проверки. Patch тоже интегрирован с ToolOrchestrator и filesystem permission context; это не обход shell security.

Источники: [shell schema + output + permission fields](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/handlers/shell_spec.rs#L1-L281), [registration](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/spec_plan.rs#L1290-L1330), [orchestrator](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/orchestrator.rs#L1-L120), [patch handler imports/security integration](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/handlers/apply_patch.rs#L12-L45).

## 3. Files, patch, image, local search

- **`apply_patch`** — model-visible **freeform**, не JSON function; грамматика Lark, patch text с Begin/End Patch и hunks. Multi-environment добавляет строку `*** Environment ID:`. Включается если `model_info.apply_patch_tool_type.is_some()`. Не приписывать Codex readId/hashline optimistic concurrency из MauzCode: в этом контракте их нет.
- **`view_image`** — обязательный `path`; условно `detail: high|original`, `environment_id`. Output schema содержит image data URL и при соответствующем image-budget режиме detail. ViewImage Stable/default true; отдельная модельная возможность определяет original detail.
- **Отдельных обычных repository `read_file`, `write_file`, `grep`, `find`, `list_dir` в рассмотренном core registry нет.** Чтение/поиск обычно делегируются shell-командам через exec_command. Не путать с notes.read_file/write_file из отдельного remote history/notes extension.
- **`multi_env_copy_file`** — extension tool: `source_environment_id`, `source_path`, `target_environment_id`, `target_path`; возвращает `bytes_copied`. Contributor устанавливается после проверки feature flag хостом; это не универсальный core file reader.

Источники: [patch freeform](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/handlers/apply_patch_spec.rs#L1-L31), [image schema](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/handlers/view_image_spec.rs#L1-L74), [copy](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/ext/multi-env-copy-file/src/tool.rs#L21-L165), [copy installation](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/ext/multi-env-copy-file/src/extension.rs#L15-L28).

## 4. Search/web и discovery

**`tool_search`** — специальный ToolSpec::ToolSearch с `execution: client`; вход `query` и limit. BM25 по метаданным deferred tools, найденные определения включаются в **следующий model call**. Description прямо запрещает использовать list_mcp_resources/templates как замену discovery MCP tools. Это поиск возможностей, не файлов и не интернета.

**Hosted web search** — ToolSpec::WebSearch, конфигурируемый режимами Cached (`external_web_access=false`), Indexed (`true`, indexed=true), Live (`true`), Disabled/None (нет tool). Фильтры, user_location, search_context_size и image/text content зависят от конфигурации/модели. Его backend-внутренние subtools не надо выдавать за локально зарегистрированные функции.

**`web.run`** — отдельный проверенный extension function в namespace `web`. Standalone path включается при web capability provider и responses-lite либо StandaloneWebSearch feature. Schema SearchCommands: `search_query`, `literature_search_query` (capability-gated), `image_query`, `open`, `click`, `find`, `screenshot`, `finance`, `weather`, `sports`, `time`, `response_length`. Поисковый элемент: `q`, `recency`, `domains`; open: `ref_id`, `lineno`; click: `ref_id`, `id`; find: `ref_id`, `pattern`; screenshot: `ref_id`, `pageno`. Это **поля одного tool**, не самостоятельные registered tools. Handler делает HTTP/provider запрос и преобразует результат; endpoint/backend доступность статическим исследованием не проверялась.

Источники: [discovery schema/description](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/handlers/tool_search_spec.rs#L18-L105), [constant](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/tools/src/tool_discovery.rs#L1-L12), [hosted web](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/hosted_spec.rs#L1-L50), [standalone gating](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/spec_plan.rs#L1253-L1263), [web.run handler](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/ext/web-search/src/tool.rs#L49-L120), [SearchCommands](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/codex-api/src/search.rs#L32-L170).

## 5. Subagents — две разные поверхности

**V1, namespace `multi_agent_v1`:** `spawn_agent`, `send_input`, `resume_agent`, `wait_agent`, `close_agent`. При supports_search_tool регистрируются Deferred, иначе Direct. Depth limit ограничивает доступность. Spawn поддерживает message/items, agent type и fork context; send_input адресует id, передаёт message/items и interrupt; resume_agent принимает id; wait_agent ожидает ids с timeout. Не смешивать CLI `resume` с model tool resume_agent.

**V2:** `spawn_agent`, `send_message`, `followup_task`, `wait_agent`, `interrupt_agent`, `list_agents` (namespace configurable). `spawn_agent` handler: `message`, `task_name`, `agent_type`, `model`, `reasoning_effort`, `fork_turns`, `fork_context`; часть полей дополнительно фильтруется config/model definitions. send_message/followup_task: `target`, `message`; list_agents: `path_prefix`; interrupt_agent: `target`. V2 wait возвращает `message`, `timed_out`, а не следует автоматически переносить на него V1 status-map. send_message и followup_task разделены по семантике передачи сообщения и последующей задачи.

V2 visibility зависит от resolved multi_agent_version, disable_native_tools и модели дочернего агента. `non_code_mode_only` выбирает DirectModelOnly против Direct; отдельные переключатели управляют wait и messaging. Native guardian review может включаться. Feature Collab (`multi_agent`) deprecated/default true; MultiAgentV2 Stable/default false — это ещё не означает, что resolved version всегда V1: есть model/config resolution.

Источники: [V1/V2 schemas](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/handlers/multi_agents_spec.rs#L14-L375), [gating](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/spec_plan.rs#L763-L800), [registration](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/spec_plan.rs#L1512-L1656), [V2 spawn args](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/handlers/multi_agents_v2/spawn.rs#L203-L230), [V2 wait result](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/handlers/multi_agents_v2/wait.rs#L140-L172).

## 6. Plans, interaction, context и clock

- **`update_plan`**: `plan: [{step,status}]`, optional explanation; status pending/in_progress/completed; description допускает максимум один in_progress. Важно: handler **отклоняет вызов в Plan mode** — это TODO/checklist tool, а не включение режима проектирования. Успех отправляет PlanUpdate event, не исполняет пункты. Gate `config.update_plan_enabled`.
- **`request_user_input`**: `questions` (1–3), structured questions/options. Handler/schema нормализуют ответы/вопросы; options не могут быть пустыми. Доступные modes зависят от features; gate experimental_request_user_input_enabled; DirectModelOnly.
- **`request_user_input_async`**, **`send_message_to_user_async`**: отдельные асинхронные каналы взаимодействия, DirectModelOnly. Async question зависит от experimental request-input config и модели; send-message — feature либо experimental_supported_tools и отсутствие root capability restriction. Не приравнивать отправку вопроса к ответу человека.
- **`new_context`**, **`get_context_remaining`**: TokenBudget gated, default false. new_context — именно такое имя, хотя файл называется new_context_window.rs. Первый DirectModelOnly, второй обычный register. Контекстное управление, не терминальная сессия.
- **`clock.curr_time`**, **`clock.sleep`**: namespaced tools. curr_time при CurrentTimeReminder либо model-supported clock. sleep: `duration_ms`, ограниченная задержка, прерывается новым input, возвращает elapsed wall time; SleepTool default true, но дополнительный sleep_tool_mode/model-driven gate.
- **`test_sync_tool`**: только model experimental_supported_tools; тестовый tool, не пользовательский baseline.
- **`list_available_plugins_to_install`**, **`request_plugin_install`**: suggestions gate требует ToolSuggest+Apps+Plugins и непустых candidates; list только при ListTool presentation. Request installation нельзя считать инструментом исполнения произвольной установки без пользовательского процесса.

Источники: [plan schema](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/handlers/plan_spec.rs#L7-L58), [plan handler](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/handlers/plan.rs#L60-L108), [questions](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/handlers/request_user_input_spec.rs#L9-L114), [all utility gates](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/spec_plan.rs#L1352-L1509), [clock sleep](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/handlers/sleep.rs#L26-L58).

## 7. MCP, dynamic tools, skills, LSP

MCP resource tools: **`list_mcp_resources`**, **`list_mcp_resource_templates`** (`server`, `cursor` optional; pagination), **`read_mcp_resource`** (`server`,`uri` required). Conditional environment qualification. Registered при MCP servers либо CodeModeOnly. Возвращают MCP resources/templates/content, не список функций.

Сами MCP функции приходят динамически из сервера, со схемами, namespace/qualified names и discovery metadata; нет фиксированного набора tool names. DynamicToolSpec поддерживает Function и Namespace; runtime создаёт DynamicToolHandler и register_external. Поэтому имена конкретных GitHub/Slack/etc функций без выбранного MCP сервера были бы выдумкой.

Skills — extension/catalog/host prompt и SkillInvocationContributor. В проверенном core registry нет универсального model-visible `skill` или `read_skill` tool. Skills metadata/instructions инжектируются, поддерживаются источники/каталоги и чтение ресурсов через инфраструктуру. Это не равнозначно LSP. В рассмотренном core tools + skills tree поиск LSP/lsp не выявил native model tool; нельзя утверждать, что конкретный MCP/plugin никогда не предоставляет language-server функции.

Источники: [resource schemas](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/handlers/mcp_resource_spec.rs#L8-L110), [resource gating](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/spec_plan.rs#L1332-L1350), [dynamic registrations](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/spec_plan.rs#L1658-L1695), [skills extension architecture](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/ext/skills/src/extension.rs#L1-L70).

## 8. Code mode и дополнительные extension surfaces

**`exec`** — freeform JavaScript cell (не exec_command), Lark допускает `// @exec:` pragma. **`wait`** — `cell_id` required, `yield_time_ms`, `max_tokens`, `terminate`; получает последующий вывод/завершение либо останавливает cell. CodeMode и CodeModeOnly UnderDevelopment/default false. В code-mode-only часть native tools не показывается отдельно, но доступна через code runtime; DirectModelOnly остаётся отдельной модельной поверхностью. Incremental exec требует responses-lite + IncrementalTools + IncrementalExecTools + CodeModeOnly. Это наиболее близкий аналог MauzCode tools_eval, но нельзя автоматически переносить Bun/ctx API MauzCode в Codex.

Дополнительно подтверждены extension definitions (не baseline):

- **`image_gen.imagegen`**, image generation extension; ImageGeneration flag Stable/default true, но registry дополнительно учитывает model/config/provider. Имя не `image_generation`.
- **`get_goal`**, **`create_goal`**, **`update_goal`**: GoalExtension config.enabled. create: objective, optional explicitly requested token_budget; update: complete/blocked/paused. Не путать с update_plan.
- **`history.list_windows`**, **`history.list_items`**, **`history.read_item`**, **`history.search_contents`**;
- **`notes.list_files_by_prefix`**, **`notes.read_file`**, **`notes.search_contents`**, **`notes.append_to_file`**, **`notes.write_file`**. Token-budget/history-notes HTTP backend gate; это не локальная project filesystem поверхность. Append/write объявлены non-parallel.
- Message-board configurable namespace: **`create_channel`**, **`upsert_channel`**, **`get_channels`**, **`list_threads`**, **`search_posts`**, **`read_thread`**, **`read_post`**, **`subscribe`**, **`unsubscribe`**, **`post`**, **`append`**. Это отдельный extension selection, не обязательный subagent baseline. Полные schemas и host-install gating этих дополнительных extensions не аудированы исчерпывающе.

Источники: [code mode names](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/code-mode-protocol/src/lib.rs#L61-L62), [exec grammar](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/code_mode/execute_spec.rs#L1-L30), [wait schema](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/code_mode/wait_spec.rs#L7-L65), [assembly](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/spec_plan.rs#L1120-L1158), [image names](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/ext/image-generation/src/lib.rs#L8-L9), [goals](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/ext/goal/src/spec.rs#L9-L90), [history/notes registration](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/ext/history-notes/src/tools.rs#L85-L102), [history backend gate](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/ext/history-notes/src/extension.rs#L40-L65), [message board names](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/message-board/src/tools/selection.rs#L6-L66).

## 9. Default vs optional: проверенная feature-таблица

Stable/default true: ShellTool, UnifiedExec, UnifiedExecTty, ViewImage, SleepTool, Apps, Plugins, ToolSuggest, ImageGeneration. Но true — **первый gate**, не гарантия tool exposure.

UnderDevelopment/default false: DeferredExecutor, CodeMode, CodeModeOnly, StandaloneWebSearch, ExecPermissionApprovals, RequestPermissionsTool, TokenBudget.

MultiAgentV2 Stable/default false. Collab/multi_agent Deprecated/default true. Model metadata и turn resolution могут выбрать другой фактический режим.

Источники: [feature defaults 1193–1545](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/features/src/lib.rs#L1193-L1545), [multi-agent/apps](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/features/src/lib.rs#L1667-L1745), [plugins](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/features/src/lib.rs#L1901-L1918), [image](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/features/src/lib.rs#L2039-L2044), [token budget](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/features/src/lib.rs#L2273-L2278).

## 10. Что полезно для сравнения с MauzCode

1. Разделять **registered / model-visible / deferred / callable from code**. Плоский каталог tools теряет security и context-budget смысл.
2. Discovery должен возвращать/подключать проверенную схему, не только текст названия; MCP resources и tool search — разные продукты.
3. Одна shell функция может иметь resumable и policy-constrained one-shot implementation без ложного обещания background authority.
4. Stable feature default и actual turn capability — разные оси; сравнение обязано фиксировать commit, модель/режим и flags.
5. Code mode `exec` — реальная compositional поверхность уже в Codex, поэтому «MauzCode единственный с кодовым вызовом tools» было бы неверно; различаются API, sandbox и lifecycle.
6. Freeform grammar apply_patch против MauzCode readId/literal/hashline — существенное различие edit contracts, а не просто разные имена write.
7. V2 subagents отдельно различают messages, followup tasks, wait, interrupt. Не сводить всё к одному delegate.
8. `update_plan` не Plan mode и даже запрещён в нём. UI/CLI commands не надо включать в перечень model tools.
9. Host/runtime-owned history/notes tools существуют, но не позволяют переносить их семантику на transcript mutation MauzCode; внешняя authority и gates сохраняются.
10. Проверка локальных исходников не доказывает operational доступность backend web/image/apps, не доказывает отсутствие plugin LSP и не определяет полный пользовательский MCP registry.
