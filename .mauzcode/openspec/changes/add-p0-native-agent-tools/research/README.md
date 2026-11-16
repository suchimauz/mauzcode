# Инструменты Codex, Qwen Code, OpenCode и DeepSeek Harness: что перенять в MauzCode

**Срез: 16 ноября 2026, UTC.** Исследование исходников, а не рекламных списков. Подробные инвентари, ключевые аргументы, результаты, условия включения и pinned-ссылки — в пяти приложениях ниже. Рекомендации описывают будущие изменения: **tools, настройки и код MauzCode не изменялись**.

## Короткий вывод

**Нам не нужно превращать весь runtime в сотни native tools. Нужна небольшая понятная поверхность поверх существующих возможностей, а рядом — несколько действительно недостающих возможностей.** Первая очередь: `tool_search`, `tool_describe`, `read_result`, `request_input`. Следующий набор: планы и делегирование через адаптеры с доверенным контекстом текущего агента. Интернет — через условно подключаемые tools существующего websearch-плагина. Главный функциональный пробел относительно конкурентов — управляемые фоновые процессы с handle, чтением вывода, отменой и уведомлением о завершении.

**Eval стоит сохранить.** У всех четырёх исследованных harness уже есть программная композиция вызовов: Codex `exec`, Qwen `exec`, OpenCode `execute`, DeepSeek `run_code`/PTC. Но их режимы и границы безопасности отличаются: MauzCode `tools_eval` работает в процессе сервера, а не в изолированном tool-only runtime. Нативные обёртки улучшают обнаружение, типизацию входа и наблюдаемость; сами по себе они не создают sandbox и не дают разрешения на действия.

---

## 1. Область исследования и воспроизводимость

| Проект | Default branch | Проверенный commit | Дата commit, UTC | Детальный инвентарь |
|---|---|---|---|---|
| [Codex](https://github.com/openai/codex) | main | `090be4df0724cdef5758e6a0934ba557af8b6bbe` | 2026-11-16 16:38:13 | [Приложение: Codex](appendices/codex.md) |
| [Qwen Code](https://github.com/QwenLM/qwen-code) | main | `fdd30c6fd66f575cc2ba790480350782db0929cd` | 2026-11-16 16:42:11 | [Приложение: Qwen](appendices/qwen-code.md) |
| [OpenCode](https://github.com/anomalyco/opencode) | dev | `96a6c43b34e0ba59a9aad7247fbc77f0384eb17c` | 2026-11-16 16:58:00 | [Приложение: OpenCode](appendices/opencode.md) |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) | master | `39163dd30f703a79079e2d2446545cff3c453738` | 2026-11-13 07:37:50 | [Приложение: DeepSeek](appendices/deepseek-harness.md) |
| MauzCode, локальный checkout | текущий HEAD | `4d3d618a21fc3404970c72a928d60afffb6f584e` | зафиксирован при исследовании | [Приложение: MauzCode](appendices/mauzcode.md) |

Все четыре публичных репозитория доступны. Проверены реальные registry/composition, schemas, ключевые handlers и permission gates. SHA, branch и чистота checkout дополнительно сверены при сборке отчёта. Это HEAD веток, **не сравнение stable releases**. Особенно OpenCode в этом срезе уже отличается от старых списков `bash/task/apply_patch/lsp`.

Что различаем:

1. **Возможность** — система вообще умеет что-то делать.
2. **Native tool** — модель получает отдельное объявление/схему функции или специального hosted/freeform инструмента.
3. **Программно вызываемый API** — доступен через eval/code mode, но не обязательно отдельный tool.
4. **Дополнительный инструмент** — включается конфигурацией, моделью, host, provider, MCP или плагином.
5. **CLI/UI-команда** — не считается tool модели только из-за похожего имени.

Поэтому единое число «у X N tools» вводит в заблуждение. Динамический MCP-каталог и пользовательские расширения не перечислимы по одному checkout. В таблицах ниже указан проверенный набор возможностей с условиями, а не обещание одновременной доступности всего.

## 2. Сравнительная матрица

| Возможность | Codex | Qwen Code | OpenCode | DeepSeek Harness | MauzCode сейчас |
|---|---|---|---|---|---|
| Чтение/локальный поиск | Обычно shell через `exec_command`; отдельного обычного `read_file/grep` в checked core нет | `read_file`, `glob`, `grep_search`; `list_directory` opt-in | `read`, `glob`, `grep` | `read`, `glob`, `grep` | Native `read`, `find`, `grep` |
| Правки | `apply_patch`, freeform, зависит от модели | `edit`, `write_file`, `notebook_edit` | `edit`/`write` **или** `patch`, model hook | `edit`, `write`; `apply_patch` выключен в standard | Native `edit` literal/hashline и `write` create/replace |
| Связь правки с чтением | Не readId-контракт | Prior-read fingerprint/cache; partial read допускается | Locks + matching, не readId | Observation policy optional, default off | Read receipts/version/range; legacy и shell-пути остаются исключениями |
| Shell и background | `exec_command` + `write_stdin`, resumable session | `run_shell_command`, `task_stop`, `monitor` | `shell`, background и автоматическое уведомление | `bash`/`pwsh` + `job_output/list/kill` | Native `bash` ждёт завершения/таймаута; общего agent job lifecycle не найдено |
| Программная композиция | `exec` + `wait`, feature-gated | `exec({source})`, code_mode_only | `execute`; часть tools только в code mode | `run_code` в PTC preset; отдельно `workflow` | `tools_eval` в Bun server process |
| Discovery возможностей | `tool_search` добавляет deferred schemas в следующий model call | `tool_search` возвращает schemas; hidden call через `tool_call`, список стабилен | Catalog + `search` внутри Code Mode; не отдельный native search | Registry/PTC bindings; developer inspect list/query optional | `runtime.docs.search/get`, `plugins.search/read` через eval |
| Интернет | Hosted web либо gated `web.run` extension | `web_search`, `web_fetch`, backend gates | `websearch`, `webfetch`, provider gates | `web_search`, `web_fetch`, provider нужен | Shipped `websearch.search/read/fetch/answer`, eval-only; live mount не подтверждён здесь |
| Подагенты | V1/V2 families, model/config-dependent | `agent`, `list_agents`, `send_message`; foreground/background | `subagent`, всегда background | `subagent`, `subagent_fork`, `send_message`, `list_agents`, `wait_agent` | `agent.delegate/team/message/finishTask` через eval |
| Чеклист задач | `update_plan`, отдельный от Plan mode | `todo_write` default off; team tasks отдельно | `todowrite`, feature-flag | `todo_write`, team board отдельно | `session.plan/done/updatePlan`, eval-only |
| Вопрос человеку | `request_user_input`, условные async variants | `ask_user_question`, interactive-only | `question` | `ask_user_question` | `input.request`, durable explicit wait, eval-only |
| LSP по target repo | Не найден core LSP tool | `lsp`, opt-in, navigation/diagnostics/actions | В checked registry отсутствует; LSP runtime TODO | Optional `lsp`, четыре navigation/hover операции | `code.*` — граф host runtime, не универсальный LSP target project |
| Skills | Extension/prompt, не универсальный `skill` core tool | `skill`, может влиять на hooks/grants | `skill` | `skill` | Plugin SKILL discovery через eval; не доказана идентичная skill execution модель |
| MCP | Dynamic tools + resource tools | Dynamic `mcp__…` + resource read/discovery bridge | Dynamic tools, обычно Code Mode, resource helpers | Dynamic `mcp__…` + resource tools | Connector не найден в исследованной поверхности |
| Артефакты/показ | Images и optional extensions | `artifact`, `display_image`, gated recording | Conditional artifact Code Mode family, image generation | `present`, Office tools | `canvas.show`, существующий богатый UI, eval-only; native `respondHtml` |
| Долгие задачи/триггеры | Goals и optional extensions | Goals, cron/loop, experimental teams | Conditional schedules/watches | Goals, RRULE schedules, team | Goals уже native; wake/cron/watch/shared agents через eval |

**«Не найдено» ограничено исследованным registry/checkout.** Это не утверждение, что такую возможность нельзя добавить через сторонний плагин.

## 3. Что дают конкретные harness

### 3.1. Codex: маленькое рабочее ядро и управляемая экспозиция

Рабочее ядро: `exec_command`, `write_stdin`, model-dependent `apply_patch`, `view_image`, `update_plan`; другие семейства включаются условиями. У текущего `exec_command` есть `cmd`, `workdir`, `tty`, `yield_time_ms`, `max_output_tokens`; незавершённый процесс возвращает `session_id`, продолжение — через `write_stdin`. Это принципиально сильнее одноразового shell call.

Интереснее количества tools — **ToolExposure**: Direct, Deferred, DirectModelOnly, DeferredModelOnly, CodeModeOnly, Hidden. Инструмент может быть зарегистрирован, но не показан модели или не разрешён внутри программной композиции. `tool_search` ищет deferred инструменты и выставляет их для следующего обращения к модели. Отдельные UI/control tools остаются direct-only.

Multi-agent V1: `spawn_agent`, `send_input`, `resume_agent`, `wait_agent`, `close_agent` в `multi_agent_v1`. V2: `spawn_agent`, `send_message`, `followup_task`, `wait_agent`, `interrupt_agent`, `list_agents`, namespace configurable. Не смешивать `wait` code-mode cell и `wait_agent` ожидания агента. Web hosted capability и `web.run` — разные интеграции; `finance/weather/open` в `web.run` являются полями одного инструмента, не отдельными native tools.

Дополнительные surfaces: MCP resources, conditional permissions request, async human input, code-mode `exec/wait`, context-budget tools, goals, history/notes, message board, image generation. Они подробно отделены от baseline в приложении.

**Что взять:** явное разделение экспозиции и полномочий, controlled deferred discovery, process continuation, direct-only human controls. **Что не копировать:** shell-only чтение вместо наших уже более структурированных file tools; backend-specific web/API names без соответствующего backend.

Источники: [shell registry](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/spec_plan.rs#L1290-L1330), [exposure](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/tools/src/tool_executor.rs#L51-L96), [tool search](https://github.com/openai/codex/blob/090be4df0724cdef5758e6a0934ba557af8b6bbe/codex-rs/core/src/tools/handlers/tool_search_spec.rs#L18-L105).

### 3.2. Qwen Code: богатые возможности, но очень важны режимы и gates

Кроме обычных файлов/поиска/shell: notebook edits, image crop/display, structured questions, планирование, подагенты и сообщения, worktree isolation, web, skills, optional LSP, memory, workflow, cron/goals, артефакты и specialist review/PR-fix tools. Team board и `todo_write` выключены по умолчанию; headless/managed/bare/sandbox режимы имеют существенно разные каталоги. Media policy functions не становятся tools модели только потому, что существуют в коде.

**Полезная альтернатива Codex discovery:** `tool_search` показывает schema, но не меняет native tools list. Deferred tool вызывается через `tool_call({name,arguments})`; target policy проверяется отдельно. Это сохраняет стабильный prefix схем. В code_mode_only — `exec({source})` с известными tool bindings; input/plan/agent/control operations отделены в direct-only список. У найденной схемы есть fingerprint: контракт может измениться, нельзя бесконечно применять старую схему после reload.

`agent` может работать синхронно или background; `send_message` продолжает/resume/revive существующий child. Dispatch возвращает task id, не итог. `lsp` умеет definition/references/symbols/call hierarchy/diagnostics/code actions, но opt-in и зависит от runtime. Qwen prior-read protection — fingerprint/cache, не наш readId протокол и не обязательное полное чтение перед replace.

**Что взять:** стабильный discovery contract, проверки конечного инструмента за bridge, role-aware surface, LSP как отдельную capability, чёткий resume без дублирования агента. **Что не копировать в ядро:** многочисленные специализированные media/PR/team tools без подтверждённых сценариев; skill hooks/grants без trust review.

Источники: [tool search](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/tool-search.ts#L153-L169), [bridge checks](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/tool-call.ts#L165-L220), [direct-only controls](https://github.com/QwenLM/qwen-code/blob/fdd30c6fd66f575cc2ba790480350782db0929cd/packages/core/src/tools/code-mode.ts#L14-L90).

### 3.3. OpenCode: native для базовой работы, Code Mode для длинного хвоста

В этом HEAD реальные имена — `shell`, `read`, `edit`, `write`, `patch`, `glob`, `grep`, `webfetch`, `websearch`, `subagent`, `question`, `skill`, `execute`; conditional `todowrite` и `experimental_image_generate`. Для определённых GPT-моделей `edit/write` заменяются на `patch`. Имя `experimental_image_generate` не означает default off: наличие image model и legacy config решают доступность.

Session/worktree/model discovery, MCP resources, schedules/artifacts/events — преимущественно Code Mode API, не десятки дополнительных native declarations по умолчанию. `execute` описан как confined JS: tool bindings и fetch, без imports, direct FS и timers. Input, canonical output и model/UI content разделены. Снимок registry удерживает definitions/executors на время model request: reload не должен подменять уже объявленный контракт.

Сильный UX-контракт: foreground `shell` после timeout переходит в background, затем сам присылает завершение. `subagent` всегда background и уведомляет при переходе в idle; это не единственный окончательный ответ за всю жизнь child. Не надо строить бессмысленный polling loop.

**Что взять:** автоматические уведомления, bounded process output, стабильный request snapshot, раздельные machine/model/UI results. **Что не утверждать:** наличие LSP tool по старым версиям; безусловную доступность schedules/todo/artifacts — defaults зависят от build channel.

Источники: [shell contract](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/shell.ts#L24-L100), [Code Mode](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/codemode/tool.ts#L24-L98), [flags](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/schema/src/config/flag.ts#L1-L23).

### 3.4. DeepSeek Harness: явные jobs, composition и программный transport

Web standard preset включает file/search/shell/jobs, schedules, skills, goals, планы/questions/todo, subagent spawn/fork, workflow, web, deliverables, Office и conditional plugin management. `apply_patch` и fs-observation policy **выключены default**. Нельзя приписать standard обязательную защиту «править только прочитанную версию».

У shell два варианта по ОС: `bash`/`pwsh`. Долгий foreground процесс обычно promotes в job; управляют им `job_output`, `job_list`, `job_kill`. Отмена возвращает `cancellation-requested` либо `already-finished` — не ложное обещание уже убитого процесса. `job_output` поддерживает delta/cursor и ограниченное ожидание.

`run_code` — зарезервированный PTC transport, отдельный preset, а `workflow` — отдельный orchestration tool. Nested calls сохраняют guard/approval/logging. `when` влияет и на declarations, и на dispatch, набор admitted tools закреплён на step. Canonical JSON, projection для модели и UI metadata разделены. MCP tools динамические; LSP optional и уже, чем Qwen: definition/references/implementation/hover.

**Что взять:** job lifecycle, step admission, structured outputs, запрет путать transport с permission boundary. **Что не переносить без особого решения:** profile-wide plugin manager, Office, experimental browser/CUA/PTY/timeline families. Они полезны в отдельных продуктах, но не обязательное ядро coding harness.

Источники: [standard preset](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/bundle/web-app/presets/standard.patch.yml#L1-L137), [jobs](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/jobs/tool-jobs/src/index.ts#L434-L614), [step contract](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/core/tools/src/contracts.ts#L100-L149).

## 4. Где MauzCode уже силён, а где есть пробел

### Уже есть — не нужно переписывать

**11 core declarations:** `bash`, `read`, `write`, `edit`, `find`, `grep`, `eval` (в этом интерфейсе `tools_eval`), `respondHtml`, `create_goal`, `get_goal`, `update_goal`. Дополнительно текущий mounted nrepl предоставляет пять native операций; это не core baseline. В shipped git UI есть ещё две декларации, но их доступность в этой сессии не подтверждена.

Через eval уже доступны discovery/docs, code graph, планы, делегирование и сообщения, shared context agents, structured input, canvas, durable wake/cron/watch, bounded result retrieval. В исходниках есть web/browser plugins. **Большая часть первой очереди — улучшение интерфейса модели, не строительство нового backend.**

Сильные контракты, которые нельзя потерять:

- `readId` с path/host/version/range; `write replace` требует полного чтения, `edit` умеет anchors; conflict возвращает актуальное чтение, а не молча перезаписывает файл.
- Immutable result UUID + авторизованное `agent.readResult`, диапазоны и явная truncation; не перезапускать action ради восстановления результата.
- Async delegation с конкретным JSON result и native UI plans; input с durable wait; явное разделение human messages и peer messages.
- Host-aware file/shell tools, secret references и redaction.
- Отдельный registry `$tool_*.md/json` → обычная procs-функция; не нужен второй бизнес-слой для каждого нового native tool.

Оговорки: legacy path-only edit/write и shell/direct FS не обеспечивают универсальную stale-read защиту. Presets — guardrails, не OS sandbox. Общий confirm не заменяет exact approval защищённого workflow; git commit/push helper сам по себе не гарантирует встроенный human gate.

### Реальные либо вероятные пробелы, подтверждённые текущей поверхностью

1. **Нет native входа в discovery.** Модель должна сначала правильно написать TS и вспомнить docs API, чтобы узнать другие возможности.
2. **Важные управления скрыты за eval.** Input/планы/delegation/result retrieval требуют программного вызова, хотя это обычные шаги агента.
3. **Нет общего управляемого process/job API.** `bash` async внутри Bun, но ждёт результата; active tool tail/abort — не attachable background job. UI Terminal прямо не имеет agent-facing functions. Специализированный background test runner для host не заменяет general target-project exec.
4. **Нет подтверждённого универсального LSP/MCP connector.** Наш `code.slice/callers` индексирует зарегистрированный runtime MauzCode, а не автоматически чужой Clojure/Python/Rust проект.
5. **Разница shipped и available не всегда видна из общей документации.** Здесь plugin search фактически показал nrepl; websearch/browser нельзя объявлять доступными только по файлам в checkout.
6. **In-process eval имеет широкие привилегии.** Если требуется работа с недоверенным кодом, это отдельная архитектурная задача, не повод просто переименовать eval в exec.

## 5. Рекомендуемая очередь tools

Имена ниже — **предложения**, не существующие callable names. P0 = начать с небольшой группы и измерить; P1 = следующий полезный набор; P2 = отдельный feature project либо opt-in. Оценка сложности относительная, без обещания сроков.

| Приоритет | Предложенный tool / family | Основа сейчас | Польза и оговорки | Объём |
|---|---|---|---|---|
| **P0** | `tool_search` | `runtime.docs.search` + plugin workflow discovery | Нативная точка входа; компактные exact names/summary/source/availability. Не показывать весь каталог | Малый–средний: обязателен scoped adapter |
| **P0** | `tool_describe` | `runtime.docs.get`, при необходимости `plugins.read` | Полная входная схема + return type выбранной функции; без исходников и внутренних authority fields | Малый–средний |
| **P0** | `read_result` | `agent.readResult` | Один типизированный вызов вместо eval; UUID/range/ownership уже есть | Малый |
| **P0** | `request_input` | `input.request` и kind registry | Вопросы/выбор/подтверждение/секретные формы с правильным stop/wait; не смешивать request и answer | Средний: lifecycle/security важнее wrapper |
| **P1, первый bundle** | `plan_update`, `plan_done` | `session.plan/updatePlan/done` | Stable task ids, проверяемые переходы. Не заменяют goals и не включают planning mode | Малый–средний |
| **P1, первый bundle** | `delegate_task`, child-only `finish_task` | `agent.delegate/finishTask` | Асинхронный child receipt и обязательный structured result; без `agent: Agent` в схеме | Средний |
| P1, по наблюдаемой частоте | `agent_message`, `team_status` | `agent.message/team` | Адресация и продолжение существующих child, не породить duplicate; роли/ownership | Малый–средний |
| **P1** | `web_search`, `web_read` | Shipped `websearch.search/read` | Возвращать источники, URL, raw readable evidence отдельно от LLM answer | Средний; только mounted/configured/granted |
| **P1: новая возможность** | `exec_start`, `exec_read`, `exec_input`, `exec_cancel` | Переиспользовать shell/SSH/redaction, нужен job manager | Long builds/dev servers/PTY, ограниченный output, lifecycle, auto notification. Не обычный wrapper bash | Большой |
| P1 | `show_artifact` | `canvas.show(kind:file)` | Показать пользователю файл/отчёт рядом с чатом без знания canvas API | Малый; не смешивать с внешней публикацией |
| P1–P2, project opt-in | `code_navigate`, `code_diagnostics` | Нужен target-workspace LSP/backend | References/definition/symbols/diagnostics там, где rg недостаточно; учитывать стек и host | Большой |
| P2 | Native `code_slice`/`code_callers` | Existing runtime graph | Полезно именно для разработки MauzCode/runtime plugins, не global target coding default | Малый, но узкая применимость |
| P2 | MCP integration + deferred exposure | Новая интеграция с текущим registry | Совместимость с внешней экосистемой; не нужно экспортировать всё в startup prompt | Большой, отдельный security review |
| P2 | Multi-file patch | Existing edit/write + новая координация | Лишь если A/B показывает пользу; preserve read version guards, preview/delete approval, явная partial-failure семантика | Средний–большой |
| P2 | Worktree/notebook/browser/Office/media tools | Часть через git/browser; остальное feature-specific | Подключаемые bundles по задаче, не always-on core | Зависит от backend |

**Практический первый релиз: четыре P0 tools, без новых прав.** Точный порядок приоритетов — инженерная гипотеза до A/B, а не доказанная экономия. Затем отдельный orchestration bundle. Нет причин одновременно добавлять пятьдесят native schemas, менять presets, писать LSP и внедрять MCP. `tools_eval` остаётся для обработки массивов, batch чтения и композиции, где отдельные вызовы действительно создают лишние round trips.

## 6. Контракты, без которых native wrappers будут регрессией

### 6.1. Не простой alias на любую ctx.fns

Текущий dispatcher проверяет `tool.fn`, связывает session/workspace и запускает обычный handler. Но **guarded eval facade отдельно внедряет permission-aware `allows` в discovery**. Поэтому декларация с `fn: runtime.docs.search` без специального adapter может не воспроизвести фильтрацию eval-пути. Новый wrapper должен получить доверенный preset context и отфильтровать underlying capability, а не только разрешение на собственное имя.

Независимая проверка выявила ещё два нюанса текущего кода (статические наблюдения, не exploit-тесты): `runtime.docs.search` фильтрует **уже ограниченный** candidate pool — denied hits могут вытеснить разрешённые; `tools.call` в unknown-tool error печатает unfiltered список имён. Поэтому отдельно проверять отсутствие утечки и полноту разрешённого top-K. Существующий registry пригоден для wrappers, но это не доказательство безопасности всех negative paths. Подробности: [review адаптеров](appendices/adapter-review.md).

Не принимать от модели `ctx`, `session`, `agent: Agent`, `allows`, preset snapshot или owner authority. Идентификатор peer/member допустим лишь там, где это объект действия, с проверкой ownership. `goal.toolCreate` — существующий пример узкого native adapter с trusted authority, но goal-specific механизмы нельзя механически переносить на все функции.

### 6.2. Discovery и activation — разные изменения

Предлагаемые P0 `tool_search/describe` сначала **только находят доступные API**, далее вызов через существующий eval или уже объявленный native tool. Не обещать, что найденное имя автоматически появилось в `tools[]`.

Если позже делать deferred native surface, выбрать и проверить одну стратегию:

- Codex: поиск активирует схемы в следующем model call;
- Qwen: схемы остаются скрыты, отдельный audited bridge вызывает конечный tool;
- MauzCode начальный вариант: typed native discovery + проверенный eval, без нового generic invoke.

Bridge с `name + arbitrary args` не автоматически безопаснее eval: нужны schema validation, target authorization, ownership, invocation freshness и accounting вложенных вызовов. Полный runtime dump и неограниченный generic `call_anything` не рекомендуются.

### 6.3. Особые правила control tools

`request_input` возвращает id запроса; ответ придёт позднее. При `waitForAnswer:true` дальнейшие действия прекращаются на безопасной границе, нельзя запрашивать approval и исполнять action в том же продолжающемся eval. Generic confirm не заменяет защищённое approval конкретного инструмента. Secret kind возвращает только reference.

`delegate_task` возвращает принятую задачу/child id, не «готово». `finish_task` — конкретный результат после закрытия реального плана. `plan_done` не следует вызывать только потому, что достигнут лимит времени/токенов. `planning.enter` и create_goal по-прежнему только по соответствующему явному запросу человека.

Роль и условия показываем в catalog: root/child, interactive/headless, local/SSH, mounted/available. Не выставлять заведомо неработающий tool, но availability нельзя использовать как замену runtime permission check.

### 6.4. Фоновые процессы

Предлагаемый lifecycle: `start → running(handle) → output/input → completed|failed|cancelled|unknown`. Нужны:

- доверенный owner, host/environment и cwd на весь срок процесса;
- bounded output + cursor/immutable chunks, redaction на границах chunk;
- явное разделение времени ожидания результата и предельного времени работы процесса;
- opt-in background и уведомление завершения, без бесконечного polling;
- input/PTY только при поддержке, никакого arbitrary PID takeover;
- cancel request отдельно от подтверждённого завершения; process-group cleanup и bounded drain;
- явная семантика restart, TTL, SSH disconnect, потерянного handle; не обещать durable OS process resume без реализации;
- идемпотентность start/retry либо receipt проверки: неизвестный outcome не повод запускать команду второй раз.

Не менять молча нынешний `bash.timeout` с kill на promote: это несовместимое изменение semantics. Новый API либо явная опция должны назвать различие.

### 6.5. Программный режим и sandbox

Сохранить trusted eval как сильную сторону MauzCode. Отдельно рассмотреть **ограниченный tool-composition runtime** для сценариев, где нельзя давать host Bun/FS/process/network. Это самостоятельный проект: процессная изоляция, разрешённые bindings, проверки каждого leaf call, budgets/concurrency/abort, output transport. Снижение количества eval в диалоге не равнозначно уменьшению фактических полномочий, пока он остаётся доступен.

## 7. Что не стоит делать

- Экспортировать каждый `ctx.fns.*` в native tools: большой prompt, лишняя неоднозначность, внутренние APIs и churn схем.
- Удалять eval «потому что другие используют tools»: все четыре уже используют программную композицию.
- Выдавать каждому агенту admin/settings/storage/secret-value/plugin-install инструменты. Установка и публикация — отдельные авторизованные workflows.
- Копировать названия без contracts: timeout в четырёх системах означает разные вещи; wait может ждать cell, процесс, агента либо любой input.
- Заменять current stale-read edit на fuzzy patch только потому, что patch распространён. Multi-file patch сам по себе не обещает атомарность или защиту от конкурентных правок.
- Делать `code.quality/runTests` универсальным инструментом чужого проекта: текущие функции привязаны к host runtime и его stack.
- Путать human permission, plan checklist, planning mode, goal и team task board.
- Показывать search/LLM summary как проверенный первоисточник: retrieval должен сохранять evidence и явную truncation.

## 8. Как проверить пользу, а не только добавить имена

Предлагаемый A/B: одинаковые модель, задачи, права и workspace; baseline — нынешний eval API, variant — выбранные native adapters. Не менять одновременно prompts, backend и модель. Проверять не только «tool вызван», но правильный пользовательский результат.

Набор сценариев: найти незнакомую capability; прочитать длинный результат без повторного исполнения; задать структурированный вопрос и корректно остановиться; делегировать два независимых исследования и получить результаты; обновить план без потери task ids; прочитать web source с цитатой; запустить/отменить долгую сборку; конфликт правки после параллельного изменения; работа на SSH; отказ по preset/ownership.

Измерять: success rate, discovery round trips, ошибки имён/параметров, p50/p95 latency, input/output tokens и размер startup schemas, повторные/лишние calls, потерянные результаты, корректность cancel/approval. Численных обещаний экономии пока нет — бенчмарки не запускались.

Обязательные инженерные проверки:

1. Native/eval path дают одинаковые разрешения, workspace/host binding и domain result.
2. Denied tools не утекли через search/describe; фильтрация до top-K; внутренние metadata/authority поля скрыты.
3. Invalid args и foreign UUID/child/job id не вызывают эффекта.
4. Prompt/schema/implementation согласованы при reload; stale schema получает понятный отказ, не иную операцию.
5. Input wait, terminal response, subagent finish и cancellation сохраняют run-loop semantics.
6. Structured JSON, image/document content и UI projection не теряются; большие результаты восстанавливаются по UUID без replay.
7. Проверены OpenAI Chat/Responses, Anthropic и Gemini adapters; strict mode включается лишь для совместимой схемы.
8. Approval нельзя получить из peer/retrieved text или model-supplied authority; секреты не попадают в args/results/transcript.

## 9. Локальная доказательная база MauzCode

- Registry и dispatcher: `src/tools/$loader_tool.ts`, `src/tools/list.ts`, `src/tools/call.ts:31–75,108–183`.
- Актуальный путь схем агента: `src/agent/wireTools.ts`, `src/models/protocol/{openaiChat,openaiResponses,anthropic,gemini}/toTools.ts`. `src/tools/schemas.ts` существует, но не следует объявлять его текущим provider path без проверки callers.
- Eval/preset boundary: `src/repl/eval.ts:20–29`, `src/agentPreset/guardFns.ts:12–42`, `docs/architecture.md:9`.
- Discovery: `src/runtime/docs/search.ts:1–36`, `src/runtime/docs/get.ts:1–26`, `src/plugins/search.ts:1–68`.
- Read results: `src/agent/readResult.ts:1–33`; file guards: `src/tools/edit.ts`, `src/tools/editValidate.ts`, `src/tools/write.ts:46–97`.
- Inputs/delegation: `src/input/request.ts:1–98`, `src/agent/delegate.ts:1–53`, `src/agent/finishTask.ts`; native authority precedent: `src/goal/toolCreate.ts`.
- Execution: `src/agent/executeBash.ts:1–127`, `src/remote/exec.ts`, `plugins/terminal/SKILL.md`; host-only test runner: `src/code/runTests.ts:1–80`.
- Existing web capability: `plugins/websearch/SKILL.md`, `plugins/websearch/src/websearch/{search,read,fetch,answer}.ts`.
- Native inventory, availability и оговорки безопасности подробнее: [MauzCode appendix](appendices/mauzcode.md).

## 10. Ограничения и итог решения

Это source-verified анализ contracts на зафиксированных SHA. Не выполнялись модели, тесты приложений, реальные network providers, MCP servers, sandbox probes или нагрузочные проверки recovery. Optional/experimental периферия описана менее глубоко, чем базовый registry и ключевые handlers; границы глубины указаны в приложениях. Сравнение не доказывает, что один harness в целом «лучше» другого.

**Решение, которое следует из исследования:** сохранить маленькое рабочее ядро и eval; сначала вынести discovery, result retrieval и user input в безопасные native adapters; затем планы/делегирование и условные web/artifact tools. Управляемые jobs, target LSP/MCP и confined code mode рассматривать как отдельные возможности с собственными contracts и проверками. Копировать стоит не максимальный список имён, а ясные границы, наблюдаемые результаты и устойчивые жизненные циклы.
