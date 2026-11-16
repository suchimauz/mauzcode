# Qwen Code: инструменты coding harness — исследование исходников

## Срез и достоверность

- Репозиторий: https://github.com/QwenLM/qwen-code (доступен; не заменялся другим).
- Default branch проверена `git ls-remote --symref … HEAD`: **main**.
- Проверенный HEAD/checkout: **fdd30c6fd66f575cc2ba790480350782db0929cd**.
- Committer date: **2026-11-17T00:42:11+08:00**, сообщение `fix(managed-agent): resolve shared workspace owners for extension control (#17480)`.
- Исследование статическое: реестр → определения schema → обработчики и permission layer. Не запускались модели, приложения, тесты; зависимости не устанавливались. SHA важнее представлений о «текущей версии»: этот срез значительно шире старых списков Gemini-подобных инструментов.
- Клон и этот отчёт находятся только в `/home/suchimauz/mauzcode/.mauzcode/tmp/qh/`. Прочитаны host AGENTS.md и корневой AGENTS.md цели; вложенный AGENTS относится к managed-agent-server, его исходники не анализировались. Целевые исходники не менялись; `git status --porcelain` пуст.
- Ниже **registered ≠ declared ≠ permitted**. Нельзя назвать весь набор default model-visible tools без режима запуска, settings, возможностей host и модели. Ссылки в конце закреплены на SHA. Поля ниже — ключевые model-facing поля; служебные поля TypeScript interfaces (`modified_by_user`, `ai_proposed_content` и т. п.) не следует автоматически считать частью JSON Schema.

## 1. Архитектура поверхности

`Config.createToolRegistry()` создаёт lazy factories. `registerLazyTool()` запрашивает у PermissionManager статус `registered | deferred | disabled`; исключённые tools не регистрируются. `tools.eager` только откладывает схемы, но не запрещает вызовы. `permissions.allow` даёт auto-approval и **не включает** отключённую capability. `getFunctionDeclarations()` дополнительно фильтрует availability, declaration policy, memory protocol и deferred state. [S1,S2,S3]

Есть две разные поверхности:

1. **direct**: native function declarations; hidden/deferred tools доступны через `tool_search` → `tool_call`.
2. **code_mode_only**: `exec({source})` с изолированным JavaScript, `tools.<jsName>(args)` и `text()/image()/audio()/generatedImage()`. Определённые interaction/control tools остаются direct-only; `tool_call` здесь скрыт. Код вызывает инструменты через audited runtime dispatch, а не получает свободный host runtime как в MauzCode eval. [S4]

`tool_search` не меняет активный tool list, следовательно сохраняет prompt-cache prefix. Возвращает схемы; в direct mode hidden tool вызывается `tool_call({name,arguments})`, а не внезапным прямым вызовом. В code mode выдаёт также `jsName` и signature; сам поиск вызывается отдельным top-level call вне `exec`. Поддерживаются `select:ExactName,OtherName`, keywords, `+requiredWord`, `max_results`. Реестр фиксирует fingerprint найденной декларации, что позволяет проверять актуальность контракта. [S2,S5]

### Особые режимы

- **managed execution engine**: отдельная ранняя ветка, только `read_file`, `write_file`, `edit`, `run_shell_command`, обёрнутые runtime-backed execution tools. Это не тот же набор, что обычный CLI. [S1,S6]
- **bare**: `read_file`, `edit`, `notebook_edit`, `run_shell_command`, goal worker tools; optional terminal structured output и exec. Нет обычного полного discovery/skills/web набора. [S1]
- **shellExecutionSandbox**: отдельная ограниченная ветка: shell, task_stop, read/write/edit, monitor, agent, glob, list_directory, interaction при поддержке, exec/structured output; не переносить на неё общий каталог. [S1]
- **agent-host**: константа разрешённого read-only набора `read_file`, `grep_search`, `list_directory`. [S7]
- **subagents** получают scope/policy overrides; например no SkillManager → нет skill; no goal worker tools/structured_output; `request_shutdown` не регистрируется для подагента.

## 2. Файлы, изменения, локальный поиск

| Точное имя | Ключевые параметры | Результат / ограничения |
|---|---|---|
| `read_file` | `file_path`, `offset?`, `limit?`, `pages?` | Текст с диапазоном строк или multimodal parts; PDF pages; offset в коде 0-based. Формирует prior-read evidence. |
| `write_file` | `file_path`, `content`, `record_as_artifact?` | Создание/полная перезапись; llmContent + UI diff/status; existing file проверяется на prior read и изменение с момента чтения. |
| `edit` | `file_path`, `old_string`, `new_string`, `replace_all?`, `record_as_artifact?` | Literal replacement, не unified-diff patch; проверка совпадений и prior-read, diff результата. |
| `notebook_edit` | `notebook_path`, `cell_id?`, `new_source?`, `cell_type?`, `edit_mode?`, `record_as_artifact?` | Редактирование ячеек notebook: replace/insert/delete по schema. |
| `glob` | `pattern`, `path?` | Список совпадающих путей; основной файловый finder, заменяет list_directory во многих сценариях. |
| `grep_search` | `pattern`, `path?`, `glob?`, `limit?` | Поиск содержимого: RipGrepTool при доступном rg, fallback GrepTool под **тем же** именем; не две model tools. |
| `list_directory` | `path`, filters по schema | Список каталога; **opt-in**, `tools.listDirectory.enabled` либо явный coreTools allowlist. |
| `zoom_image` | `file_path`, `x1`, `y1`, `x2`, `y2` | Crop изображения для рассмотрения моделью. |
| `display_image` | `file_path` | Показ пользователю; только interactive, не SDK/screen-reader/subagent. |

Источник definitions/handlers [S8], registry [S1,S7]. Отдельного зарегистрированного `apply_patch` нет. Старые имена/классы нельзя переносить в каталог: `save_memory` есть в ToolNames, но не в исследованной основной регистрации; `readManyFiles.ts` существует, но `ReadManyFilesTool` не зарегистрирован в `createToolRegistry`.

### Защита изменений — важное отличие от readId

`priorReadEnforcement.ts` отслеживает identity/fingerprint (`dev`, `ino`, `mtimeMs`, size) и проверяет актуальность перед записью. **Любое предыдущее текстовое чтение**, а не обязательно полное, может дать достаточную evidence. Код прямо объясняет, что full-read prerequisite убран из-за тупика на файлах больше лимита. `fileReadCacheDisabled: true` отключает safety net, а не делает его строже. У edit есть ограниченная stale-recovery процедура с повторным exact unique matching и recheck snapshot; write_file её не запрашивает. Это не MauzCode readId/anchored receipt contract и не следует описывать как гарантированное предотвращение всех overwrite races. [S9]

## 3. Исполнение, background, продолжения

| Имя | Вход | Выход / семантика |
|---|---|---|
| `run_shell_command` | `command`, `is_background?`, `timeout?`, `description?`, `directory?` | Foreground output/status, background managed task. Timeout в **миллисекундах**, default 120000, max 600000; долгие задачи предлагают background. Не PTY stdin protocol с отдельными write/poll tools. |
| `task_stop` | `task_id` | Остановка отслеживаемой фоновой задачи/агента; не только shell kill PID. |
| `monitor` | `command`, `description?`, `max_events?`, `idle_timeout_ms?`, `directory?` | Запуск процесса, события доставляются в parent chat через notification callback. В handler outputFile пока зарезервирован, файл не создаётся: нельзя советовать polling этого пути. |
| `exec` | `source` | Изолированный JS и композиция callable tools; **только code_mode_only**. Result helpers нужны для возврата вывода. |
| `enter_worktree` | `name?` | Переключение/изоляция работы в git worktree. |
| `exit_worktree` | `name`, `action: keep|remove`, `discard_changes?` | Возврат с сохранением либо удалением; разрушительное действие не «просто закрыть task». |
| `workflow` | один из `script`, `scriptPath`, `name`; `args?`, resume fields | Отдельный workflow JS runtime с сохранёнными workflows/продолжением, а не alias exec; opt-in settings/env/встроенный review skill. |
| `autofix_pr` | `command`, `pr?`, `repo?`, `host?`, `run_id?`, `plan?`, `no_post?`, и др. | Специализированный PR-fix lifecycle, со своими подтверждениями push/unattended; нельзя считать просто read-only GitHub API. |

Shell prompt предписывает специализированные file tools вместо cat/grep/find/sed; это guidance, не самостоятельная OS sandbox гарантия. [S10,S4,S18]

### Агентная работа

- `agent`: `description`, `prompt`, `todo_id?`, `subagent_type?`, `model?`, `fork_turns?`, `fork_tools?`, `fork_profile?`, `run_in_background?`, `name?`, `plan_mode_required?`, `read_only?`, `isolation:'worktree'?`, `working_dir?`.
- Синхронное выполнение возвращает итог; background возвращает `task_id` и `output_file`, результат приходит позже как `<task-notification>`. В тексте handler явно сказано **не считать отсутствие notification отменой и не запускать дубликат**.
- `list_agents({})`: roster ordinary background agents + reachable sessions, status, can_message, blocking reasons.
- `send_message({to?,task_id?,message,summary?})`: сообщения running agent на tool-round boundary; paused → resume; completed → resident continuation либо revival из retained transcript. Это актуальная замена воображаемому `agent({resume:…})`: такого параметра в AgentParams нет.
- `create_sub_session({prompt,completion?:'sent'|'first-turn',model?,name?,workspace?})`: daemon/ACP-only, нужен реально подключённый spawner; отсутствует в обычном TUI/headless.
- `advisor({})`: независимое second opinion по текущей беседе, только когда настроена advisor model, вне bare/safe.

Источники [S11,S1]. Parent-child notifications и resume/revive — близкий к MauzCode контракт; но фоновые агенты, durable sessions и experimental teams не одно и то же.

## 4. План, общение с человеком, team task board, goals, расписания

| Имя | Ключевой вход | Контракт / gate |
|---|---|---|
| `ask_user_question` | `questions[]`, `metadata?` | Структурированные вопросы/варианты, interactive host; не регистрируется в headless. |
| `enter_plan_mode` | `userRequested?` | Переход в planning; не SDK, нужен interaction. |
| `exit_plan_mode` | `plan`, `originalRequest?`, `researchSummary?`, `resolutionSummary?` | Предложение/согласование плана; не SDK; разрешён и subagent-context по отдельной ветке. |
| `todo_write` | `todos[]` | Замена task list; **default false**, не стандартная always-on tool данного SHA. |
| `team_create` | `team_name`, `description?` | Experimental team scope. |
| `team_delete` | `{}` | Удаляет текущую команду, leader-only; handler останавливает агентов и чистит файлы. |
| `team_plan_approval` | `request_id`, `action:approve|reject`, `message?` | Ответ на plan approval участника команды. |
| `request_shutdown` | `to` | Leader-only enforced by registration absence у subagents, не просто runtime error. |
| `task_create` | `subject`, `description`, `activeForm?`, `metadata?` | Team shared task. |
| `task_update` | `taskId`, `status?`, `owner?`, `subject?`, `description?`, `addBlocks?`, `addBlockedBy?`, … | Обновление shared task/dependencies; status включает deleted. |
| `task_list` | `status?`, `owner?`, `blockedBy?` | Список/фильтр shared tasks. |
| `get_goal` | `{}` | Получить текущую goal worker context; main, не subagent. |
| `update_goal` | `status:complete|blocked`, `reason`, `blockerKind?` | Обновить goal, blocker kinds authority/external/repeated/infeasible. Это не копия MauzCode API. |
| `propose_goal` | `objective` | Human-approved proposal; enabled unless disabled, interactive либо goalProposalHostSupported, не subagent. |
| `cron_create` | `cron`, `prompt`, `recurring?`, `durable?`, `sessionMode?:unbound|current`, `gate?` | Задание scheduler, session-only либо durable. |
| `cron_list` | `{}` | Задания: id, cron, prompt, recurring/durable, fireAtMs/gate state. |
| `cron_delete` | `id` | Удаление задания. |
| `loop_wakeup` | `delaySeconds`, `prompt`, `reason?` | Session-only one-shot wakeup на том же scheduler. |
| `structured_output` | schema пользователя `--json-schema` | Синтетическая terminal tool, не обычный текст; не subagent, т.к. его loop не реализует этот terminal handler. |

Team tools имеют **default false**, `QWEN_CODE_ENABLE_AGENT_TEAM=1`/setting включают; shell sandbox выключает. Cron имеет **default true**, выключается `QWEN_CODE_DISABLE_CRON=1` и shell sandbox. План/вопросы зависят от interaction mode, не просто от permissions.allow. [S12,S13,S1]

## 5. Web, MCP, LSP, skills и memory

### Web

- `web_search({query})`: внешний backend, результаты поиска и grounding; registry opt-out при наличии usable backend (явный конфиг либо выводимый auth/backend), session search budget. Handler возвращает явный отказ при исчерпанном бюджете — нельзя интерпретировать это как выполненный поиск. [S14]
- `web_fetch({url,prompt,format?:auto|markdown|html|text})`: загрузка страницы, extraction/processing по prompt, контент либо summarization; errors/fallback raw content в результате. Есть безопасная обработка redirects: другой host/scheme/port не следует автоматически; это не unrestricted browser automation. [S14]
- Отдельного универсального `browser`/`browser_*` в основном native ToolNames/registry нет; MCP/другие execution surfaces могут расширять возможности. Нельзя смешивать встроенные пакеты Browser Use с always-on function declarations.

### MCP и discovery

MCP tools динамические: `mcp__<server>__<tool>` с нормализацией имени (учитываются length/collisions). `read_mcp_resource({server_name,uri})` читает resource. Resource reading не равно tool invocation. Общие `tool_search`/`tool_call` включают deferred MCP и built-ins. Permission/scope checks применяются к реальной цели за bridge, а не только к имени proxy tool. `/mcp`, `/tools` и extension CLI — **не model tools**. [S5,S15,S3]

### LSP

`lsp` выключен по умолчанию (`lsp.enabled ?? false`), требует клиента, отключается bare/provisional workspace/shell sandbox. Вход: `operation`, `filePath?`, `line?`, `character?`, `endLine?`, `endCharacter?`, `includeDeclaration?`, `query?`, `callHierarchyItem?`, `serverName?`, `limit?`, `diagnostics?`, `codeActionKinds?`. Операции handler: `goToDefinition`, `findReferences`, `hover`, `documentSymbol`, `workspaceSymbol`, `goToImplementation`, `prepareCallHierarchy`, `incomingCalls`, `outgoingCalls`, `diagnostics`, `workspaceDiagnostics`, `codeActions`. Возвращает navigation/symbol/diagnostics/action data, это не отдельная tool на каждую операцию. [S16]

### Skills

`skill({skill,args?})` загружает инструкции и контекст skill; может менять session allow rules и устанавливать hooks из frontmatter. Побочные эффекты trust-gated; при восстановлении сверяются с SKILL.md. Нельзя описывать как безвредный cat markdown: grants/hooks влияют на последующие tool calls. Нет основания считать каждый slash skill самостоятельной model function. Отсутствует у subagent, чья policy не дала SkillManager. [S17,S1]

### Memory

- `manage_memory({action:'remember'|'forget',content})`.
- `search_memory`: discriminated modes: `search` + keywords/scopes/categories/limit; `fetch` + refs/cursor; `explore` + scopes/branches/limitPerBranch. Возвращает structured memory bodies/refs/version/range/truncation, учитывает уже доступный контекст и дубли поиска.
- Эти factories регистрируются в обычной ветке, но **обе декларации скрыты в legacy recall mode**, visible только при structured protocol. Поэтому таблица registry без declaration filter ошибочно даст их как default-visible.
- `save_memory` — legacy константа/реализация, не доказательство active native tool в данном createToolRegistry. [S2,S19]

## 6. Артефакты, multimodal, дополнительные tools

- `artifact({file_path,title?})`: публикует/показывает созданную HTML-страницу. default artifactEnabled true, но нужен interactive или managed preview; SDK/shell sandbox выключают; env kill switch. Это **outward-effect surface**, не эквивалент записи файла.
- `record_artifact({title,kind?,storage?,description?,workspacePath?,managedId?,url?,mimeType?,sizeBytes?,metadata?})`: записывает artifact reference; требует artifactRecordingSupported, не SDK, учитывает kill switch.
- `record_source`: регистрация только с SessionSourceService, не SDK/bare/safe, не subagent; версия/ссылка источника. Не объявляю полный input contract: schema этой вспомогательной tool глубоко не анализировалась.
- `report_findings`: structured findings (severity/confidence/source/file/line/summary/failureScenario/category/baseline/outcome и др.); не CLI review command.
- `image_gen({prompt,…})`: включается только при доступной configured image-generation capability. Это не default обещание генерации для любой модели.
- При Omni enabled есть семейство policy tools: `omni_downsample_image`, `omni_downscale_video`, `omni_downsample_audio`, `omni_extract_keyframes`, `omni_extract_audio`, `omni_clip_video`, `omni_convert_image`, `omni_transcribe_audio`, `omni_clip_image`, `omni_clip_audio`, `omni_caption_image`, `omni_caption_audio`, `omni_ocr_image`, `omni_understand_video_segments`. **Fixed-policy-only по умолчанию**, modelAccess config может открыть модели. `omni_recall_media_memory` требует omni и recall.mode=active. Это conditional catalogue, а не доказанные default-visible tools. Полные схемы каждой media tool в этом исследовании не разбирались. [S7,S20,S1]

## 7. Permission, isolation и output contracts

### Authorization не sandbox

PermissionManager объединяет deny/ask/allow, legacy coreTools/allowedTools/excludeTools; приоритет **deny → ask → allow**, режимы plan/default/auto-edit/yolo. Scheduler проверяет policy до выполнения и выполняет confirmation/hook flow. Registration filters, runtime permission, working-directory/file constraints и OS isolation — разные механизмы. Слова read_only/plan не означают контейнерную изоляцию. [S3]

Есть отдельные sandbox backends в serve path, включая bwrap, sandbox-exec и container-oriented paths; их существование не означает sandbox on by default в обычном CLI. Runtime managed tools идут через execution environment с outcome-unknown состояниями, а не локальную команду с заведомо известным результатом. Sandbox режим меняет **сам registry**, а не только prompt. Этот отчёт не проверяет реальные platform launch policies на запущенной машине. [S6,S21,S1]

### Общий результат

`ToolResult` содержит `llmContent: PartListUnion` и отдельный `returnDisplay` для UI, optional typed error и дополнительные runtime metadata. Результат для модели может быть text+media, не обязательно JSON строка. Существует общий boundary/truncation/recovery слой; UI preview не тождествен model payload. Пример важного контракта: background dispatch даёт task id и обещание будущего notification, **не доказательство завершения**. Structured_output terminal handling и code-mode metadata (terminateTurn/modelOverride) сохраняются через nested dispatch. [S22,S11,S4]

## 8. Что особенно полезно сравнить с MauzCode

1. **Стабильные declarations при lazy discovery**: tool_search выдаёт контракт без изменения tool list; hidden calls через один bridge. Сильный аналог runtime docs + eval, но с explicit schema fingerprints и отдельными direct/code surfaces.
2. **Availability отдельно от auto-approval**: permissions.allow не включает tool; tools.eager не отключает capability. Полезный принцип для presets, discoverability и ошибок «почему tool не существует».
3. **Policy у вложенного вызова**: exec/tool_call не должны обходить permission checks реальной цели. Direct-only список оставляет human-facing controls вне произвольной JS композиции.
4. **Typed lifecycle**: background launch, asynchronous notification, continuation/revival и stop разделены; нет polling-only ожидания и нет необходимости порождать новый агент на каждый follow-up.
5. **Scope enforced by absence**: leader-only request_shutdown отсутствует у teammates, structured_output отсутствует в loop без terminal handler; не выставлять заведомо неработающие tools.
6. **Prior-read safety компромисс**: Qwen использует metadata cache и допускает partial-read evidence; MauzCode readId/full-read replacement даёт более явную связанность edit с прочитанной версией. Не выдавать Qwen механизм за content-addressed capability.
7. **Skills являются policy-bearing**: trust gating/hook restore так же важны, как markdown discovery.
8. **Три разных task/plan уровня**: todo list (opt-in), team shared tasks (experimental), durable goals/cron; нельзя свести к единому «есть planning».
9. **Нельзя сравнивать по README inventory**: конкретный SHA содержит code mode, goals, workflows, managed runtime, media policy; default видимость существенно уже полного набора констант.

## Источники (pinned)

Все ссылки ниже указывают на точный исследованный commit; диапазоны охватывают определения и ключевые ветки, а не документационные имена.

- **S1** [config registry и mode branches, L13476–14376](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/config/config.ts#L13476-L14376); [defaults L3616–3771](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/config/config.ts#L3616-L3771); [gates L10852–10995](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/config/config.ts#L10852-L10995).
- **S2** [registry declarations L1041–1105](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/tool-registry.ts#L1041-L1105); [fingerprints L62–95](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/tool-registry.ts#L62-L95).
- **S3** [permission contract L47–221](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/permissions/permission-manager.ts#L47-L221); [scheduler target policy L3423–3510](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/core/coreToolScheduler.ts#L3423-L3510).
- **S4** [code mode exposures L14–90](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/code-mode.ts#L14-L90); [exec handler L28–245](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/exec.ts#L28-L245).
- **S5** [tool_search contract L153–169](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/tool-search.ts#L153-L169); [tool_call target checks L165–220](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/tool-call.ts#L165-L220); [schema L297–323](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/tool-call.ts#L297-L323).
- **S6** [managed execution names L35–56](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/services/execution-environment.ts#L35-L56).
- **S7** [canonical model names / agent-host L20–114](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/tool-names.ts#L20-L114).
- **S8** [read_file params/handler L66–240](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/read-file.ts#L66-L240); [edit schema L1060–1125](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/edit.ts#L1060-L1125); [write schema L767–800](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/write-file.ts#L767-L800); [ripgrep schema L686–730](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/ripGrep.ts#L686-L730); [glob L385–410](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/glob.ts#L385-L410); [notebook params L72–105](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/notebook-edit.ts#L72-L105).
- **S9** [prior-read contract L18–160](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/priorReadEnforcement.ts#L18-L160).
- **S10** [shell schema/timeouts L7019–7165](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/shell.ts#L7019-L7165); [monitor L312–405](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/monitor.ts#L312-L405).
- **S11** [agent params L274–330](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/agent/agent.ts#L274-L330); [continuation guidance L1085–1115](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/agent/agent.ts#L1085-L1115); [background result L4735–4752](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/agent/agent.ts#L4735-L4752); [list_agents L24–90](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/list-agents.ts#L24-L90); [send_message L58–90](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/send-message.ts#L58-L90).
- **S12** [goal status schema L340–370](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/goals/goal-tools.ts#L340-L370); [propose_goal L830–855](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/goals/goal-tools.ts#L830-L855); [task_update L45–85](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/task-update.ts#L45-L85).
- **S13** [cron_create L63–105](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/cron-create.ts#L63-L105); [loop_wakeup L20–70](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/loop-wakeup.ts#L20-L70).
- **S14** [web_search budgets/handler L895–975](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/web-search.ts#L895-L975); [web_fetch redirect L325–350](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/web-fetch.ts#L325-L350); [fetch result processing L624–779](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/web-fetch.ts#L624-L779).
- **S15** [MCP naming L1260–1340](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/mcp-tool.ts#L1260-L1340); [read_mcp_resource L27–90](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/read-mcp-resource.ts#L27-L90).
- **S16** [LSP params/operations L52–180](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/lsp.ts#L52-L180); [LSP schema L1025–1170](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/lsp.ts#L1025-L1170); [gate L9606–9616](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/config/config.ts#L9606-L9616).
- **S17** [skill trust/restore L579–710](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/skill.ts#L579-L710).
- **S18** [workflow params L117–186](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/workflow/workflow.ts#L117-L186); [autofix params L81–120](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/autofix-pr.ts#L81-L120); [worktree exit L36–65](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/exit-worktree.ts#L36-L65).
- **S19** [search memory union/results L80–130](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/memory/search-memory.ts#L80-L130); [manage_memory L15–65](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/manage-memory.ts#L15-L65).
- **S20** [artifact schema L314–369](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/artifact/artifact-tool.ts#L314-L369); [record_artifact params L33–70](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/record-artifact.ts#L33-L70); [Omni gates L14225–14351](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/config/config.ts#L14225-L14351).
- **S21** [serve sandbox backend branches L250–360](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/cli/src/serve/sandbox.ts#L250-L360).
- **S22** [ToolResult L589–680](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/tools.ts#L589-L680).

## Ограничения

Статическое чтение не доказывает успешный запуск каждого backend, безопасность всех shell/parser cases, поведение каждой ОС, доступность credentials или гарантию UI approval в каждой integration. Полностью инвентаризированы native names из основного registry и conditional families; dynamic MCP, runtime-added/managed external server tools и произвольные extension tools по определению не имеют фиксированного полного списка. Полные JSON Schema редких Omni/artifact/source инструментов не воспроизведены; это отмечено, а не заменено догадками. Параметры приведены компактно, canonical truth — pinned source schema.
