# OpenCode: инструменты coding harness, проверка исходников

## Срез и метод

Исследован именно публичный `https://github.com/anomalyco/opencode`, не fork и не одноимённый пакет. `git clone --depth 1` завершился успешно. Default branch из `origin/HEAD`: **dev**. HEAD **96a6c43b34e0ba59a9aad7247fbc77f0384eb17c**, committer date **2026-11-16T22:28:00+05:30**. Clone: `/home/suchimauz/mauzcode/.mauzcode/tmp/qi/opencode`. `git remote -v` подтверждает origin; `git status --short` пуст. Исследование статическое: зависимости не устанавливались, приложение и тесты не запускались, правок проекта/commit/push не было. Прочитаны применимые `AGENTS.md` хоста, корня checkout, `packages/core/src/tool/AGENTS.md`, инструкции schema-пакета. Все выводы относятся к этому HEAD, а не к stable release. Особенно важно: этот срез уже значительно отличается от привычного старого OpenCode с `bash`, `task`, `apply_patch`.

Ссылки ниже pinned на SHA. `P` в таблицах означает `packages/core/src/tool/plugin/`. Полный машинный result хранится рядом в `opencode-result.json`.

## 1. Реальный registry и два model-facing слоя

Центральная служба `packages/core/src/tool.ts` хранит Location-scoped registrations и снимает snapshot для одного запроса модели. Built-ins подключены в `packages/core/src/plugin/internal.ts:250–286`; plugin и MCP используют тот же `transform(editor)`/`editor.add` контракт. Snapshot сначала исключает полностью запрещённые permission action, затем делит инструменты:

- `options.codemode === false`: отдельные native model tools;
- остальные (по умолчанию codemode=true): доступны внутри **`execute`** через `tools.<namespace>.<name>`; namespace в direct-режиме становится `<namespace>_<name>`;
- если action `execute` запрещён целиком, Code Mode tools **не исчезают**, а выставляются напрямую. Поэтому «запрет execute» не равен «запрет capabilities»;
- latest valid active registration wins; dispose раскрывает предыдущую регистрацию. Snapshot удерживает definitions и executors до конца запроса. MCP refresh сохраняет precedence последующих plugin overrides.

Registry валидирует input/output; output и model content — разные каналы. Leaf handlers владеют actual authorization. Whole-tool filtering — только видимость, не security boundary. Документ архитектуры отчасти отстаёт: в текущем `tool.ts` есть Permission dependency для Code Mode; утверждение AGENTS об отсутствии зависимости нельзя переносить буквально на весь сервис.

Источники: [registry](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool.ts#L250-L302), [подключение built-ins](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/plugin/internal.ts#L250-L286), [контракт регистрации](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/AGENTS.md#L30-L61).

## 2. Native tools: точные имена, параметры, результаты

Все перечисленные ниже реально зарегистрированы handlers. Доступность дополнительно зависит от agent permissions, model hooks и флагов.

| Tool | Основной input | Output и поведение | Gating |
|---|---|---|---|
| `shell` | `command`, `workdir?`, `timeout?` (ms), `background?` | combined output, nullable exitCode, wallTimeSeconds; optional outputPath, signal, shellID, pid. Foreground timeout по умолчанию 120000 ms переводит процесс в background, **не убивает**. Для background timeout останавливает процесс. Автоматическое уведомление, запрет polling в описании | native; permission `shell` по разобранным командам + external directory |
| `read` | `path`, `offset?` (1-based), `limit?` (максимум/default 2000) | текстовая страница, directory page или file content; картинки/PDF непосредственно модели, line prefixes не часть файла. Поддержка skill URI | native; read/external_directory |
| `edit` | `path`, `oldString`, `newString`, `replaceAll?` | строковый machine output + diff/metadata. По умолчанию одно совпадение; matching имеет нормализацию/эвристики и подсказки при промахе | permission **edit**, скрывается для части GPT-моделей |
| `write` | `path`, `content` | перезапись/создание, создание родителей, строковый output | permission **edit**, тот же model hook |
| `patch` | `patchText` | add/update/delete/move multi-file patch; machine output намеренно `{}`, изменения в content/metadata | permission **edit**; только model hook GPT |
| `glob` | `pattern`, `path?`, `limit?` | массив FileSystem.Entry и compact paths для модели | native |
| `grep` | `pattern`, `path?`, `include?`, `literal?`, `caseSensitive?`, `limit?` | массив FileSystem.Match, сгруппированный текст с номерами строк, признак truncation в model content | native |
| `webfetch` | `url`, `format=text|markdown|html` (markdown default), `timeout?` seconds | `{url,contentType,format,output}`, управляемое усечение больших текстов | read-only HTTP(S), permission leaf |
| `websearch` | `query` | `{provider,results}` | selected search integration, при необходимости user form для включения/выбора provider; tool registered не означает доступный backend |
| `subagent` | `agent`, `description`, `prompt`, `model?`, `sessionID?` | `{sessionID,status:"running",output}`. **Всегда background**, сообщения `<subagent>` при каждом idle; follow-up использует тот же sessionID | permission `subagent`; тип agent из реестра; model только по явному запросу пользователя согласно описанию |
| `question` | `questions[]` (непустой массив prompts) | `{answers[]}` через Form; single/multiple choices и автоматически добавляемый free-form answer | permission question; dismissal отличается от обычного tool error |
| `skill` | `id` | `{directory,content}`; инструкции/ресурсы skill | skill должен быть обнаружен или явно назван пользователем; leaf permission |
| `todowrite` | `todos:[{content,status}]`, status pending/in_progress/completed/cancelled | `{todos}`; замена текущего списка | **experimental flag `todo`**, не гарантированный default stable |
| `experimental_image_generate` | `prompt`, `images?` (1–8 path/URL), `model?`, `path?` | `{id,path,model}` job receipt; реальное изображение сохраняется позднее, automatic notification | **on by default при наличии image model**, legacy `experimental.image_generate:false` отключает; не путать experimental имя с opt-in |
| `execute` | JS program (`{code}` schema; freeform text там, где provider поддерживает) | `{output,toolCalls:[{tool,status,input?}],error?,files}` | доступен пока целиком не запрещён permission `execute` |

Критичный model hook: `model.id.includes("gpt-") && !includes("oss") && !includes("gpt-4")` удаляет `edit` и `write`; иначе удаляет `patch`. Это **не** условие «все OpenAI» и не три одновременно доступных editing tools.

Источники definitions/handlers:

- [shell input/output](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/shell.ts#L24-L100), [shell authorization](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/shell.ts#L270-L310).
- [read](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/read.ts#L18-L72), [edit schema](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/edit.ts#L21-L58), [edit execution](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/edit.ts#L254-L350), [write](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/write.ts#L17-L57).
- [patch](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/patch.ts#L21-L34), [patch output/model gating](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/patch.ts#L270-L309).
- [glob](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/glob.ts#L17-L45), [grep](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/grep.ts#L16-L60).
- [webfetch](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/webfetch.ts#L13-L43), [websearch and setup](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/websearch.ts#L12-L135).
- [subagent](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/subagent.ts#L16-L57), [question](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/question.ts#L10-L95), [skill](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/skill.ts#L10-L65), [todo](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/todo.ts#L12-L63).
- [image schema](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/image-generate.ts#L27-L74), [image availability](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/image-generate.ts#L232-L259).

## 3. Code Mode capabilities — НЕ дополнительные native tools по умолчанию

Точные callable paths в обычном режиме приведены ниже. При fallback direct mode точное имя образуется заменой единственной границы namespace на `_`, например `opencode_session_rename`; это не имя JS helper.

| JS callable | Input / output | Условия |
|---|---|---|
| `tools.opencode.session_rename` | `sessionID?`, `title` → sessionID/title | default registration |
| `tools.opencode.session_move` | `sessionID?`, `directory` → sessionID/directory | перемещение placement session, не произвольный filesystem move |
| `tools.opencode.worktree_create` | `name` → worktree info | git workspace, permissions |
| `tools.opencode.worktree_list` | `{}` → worktrees | git workspace |
| `tools.opencode.worktree_remove` | `directory`, `force?` → результат удаления | force описан только после явного подтверждения пользователя |
| `tools.opencode.models` | `query?`, `provider?`, `type?`, `offset?`, `limit?` → provider/model listings | chat default, pagination default 20, own provider first |
| `tools.opencode.list_mcp_resources` | `server?` → resources/templates | connected MCP servers; проверяет разрешения по server |
| `tools.opencode.read_mcp_resource` | `server`, `uri` → resource contents | URI из discovery/template/user, MCP permissions |
| `tools.opencode.schedule_create` | `name?`, `when?`, `if?`, `until?`, `prompt` → schedule View | flag `schedules`; delay/date/interval/cron; conditions shell `{run}` или Code Mode `{code}` |
| `tools.opencode.schedule_list` | `{}` → `{now,schedules}` | только текущая session |
| `tools.opencode.schedule_pause` / `.schedule_resume` | `id` → View | session ownership проверяется; resume просроченной one-shot исполняет её сейчас |
| `tools.opencode.schedule_delete` | `id` → `{id,removed}` | session ownership |
| `tools.opencode.artifact_create` | `title`, UTF-8 `files` map, `entry?`, `provider?` → artifact | flag `artifacts`, provider-backed |
| `tools.opencode.artifact_read` | `id` → artifact | flag artifacts |
| `tools.opencode.artifact_update` | `id`, `files`, `title?`, `entry?` → artifact | replacement files map, не patch |
| `tools.opencode.artifact_delete` | `id` → `{id,deleted}` | flag artifacts |
| `tools.opencode.watch_mcp_event` | `server?`, `event?`, `arguments?`, `cursor?`, `once?` → discovery/watch info | flag `mcp_events`; без event discovery; once default; reconnect с последнего cursor |
| `tools.console_watch.watch` | target либо MCP event parameters | flag `console_watches` + connected Console member + workspace remote watches enabled |
| `tools.console_watch.unwatch` / `.watches` / `.events` | удаление/list watches/list offered event types | тот же provider-specific gate; события будят session |
| `tools.<MCP namespace>.<server tool>` | inputSchema/outputSchema из MCP | динамически обнаруженные remote tools, default codemode=true, server может codemode=false |

`opencode` в `editor.namespace` — namespace, **не** tool с именем `opencode`. Аналогично `schedule` зарегистрирован ещё и как slash command через `ctx.command`, не включён в перечень model tools. `/goal` — command, не tool: `plugin/goal.ts:343–350`. Plan — agent + hooks, а не `plan_enter`/`plan_exit` tools в этом срезе. Нет основания добавлять legacy `task`, `bash`, `apply_patch`, `todoread`, `codesearch` или `lsp` из старых документаций.

Источники:

- [opencode schemas](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/opencode.ts#L17-L94), [registrations](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/opencode.ts#L113-L285).
- [schedule handlers and command boundary](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/schedule.ts#L45-L165), [schedule request schema](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/schema/src/schedule.ts#L208-L244).
- [artifact](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/artifact.ts#L12-L151).
- [MCP resources](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/mcp-resource.ts#L10-L83), [MCP tools](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/mcp.ts#L23-L85), [MCP events](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/mcp-events.ts#L25-L110).
- [Console watches registrations](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/plugin/provider/opencode-watches.ts#L245-L380), [Console gating](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/plugin/provider/opencode.ts#L330-L345).
- [goal command](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/plugin/goal.ts#L343-L357), [plan agent](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/plugin/plan.ts#L12-L60).

## 4. Permission, sandbox, execution и восстановление

Permission evaluate выбирает **последнее** подходящее правило action/resource; fallback **ask**. Отсутствующий agent имеет deny rules. Поэтому нельзя писать «все действия разрешены по умолчанию» только по наличию tool. Leaf execution запрашивает permission с canonical invocation context. Read/external path и shell command resources проверяются отдельно; shell parser собирает команды и directories. Это policy enforcement, **не доказательство OS sandbox**. Shell запускает реальные процессы через Environment/process daemon или spawn fallback. Локальный daemon позволяет переживать рестарт; remote workspace/unavailable daemon использует spawner, у которого lifetime иной. Нельзя обещать одинаковую durability всем shell вызовам.

Code Mode, напротив, явно confined: JS, `tools`, `fetch`, helper `search`; нет imports, direct filesystem, timers/sleep. Native tools с codemode=false недоступны через `execute`. Завершение программы прерывает pending calls; все важные вызовы надо await. Независимые вызовы рекомендуется объединять `Promise.allSettled`. Catalog/search относятся к discovery, а не native tool `search`. Input schema и output schema не тождественны model prose; в частности, `patch` с `{}` machine output вполне сообщает diff через content.

Большие результаты ограничиваются Session runner после выполнения; shell отдельно пишет backing file и возвращает bounded tail/path. Не следует путать path-backed recovery с immutable result UUID в MauzCode.

Subagent стартует свежий child context, потому prompt обязан передать контекст. Follow-up sessionID продолжает child, работающий child присоединяет запрос к текущему run; уведомление приходит на idle, не только «единожды завершён». В `AGENTS.md` Session Core описаны process-local execution claim и startup recovery, а не clustered fencing/exactly-once; это архитектурный контракт, не результат нагрузочного теста.

[Permission fallback](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/permission.ts#L90-L105), [external authorization](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/file-access.ts#L100-L155), [Code Mode contract](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/codemode/tool.ts#L24-L98), [daemon caveat](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/shell.ts#L140-L155), [daemon fallback](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/shell.ts#L930-L975).

## 5. Defaults / experimental / LSP

Флаги `todo`, `schedules`, `artifacts`, `mcp_events`, `console_watches` описаны в schema registry. Feature flags default **on для local/dev build channel, off для остальных**. Важно различать default Git branch `dev` и build channel: сама ветка не доказывает включённый flag. Приоритет: `OPENCODE_FLAGS` → experimental config → all_flags → channel default. Config update может reload tools; schedule дополнительно rechecks flag на каждом вызове, поскольку snapshot мог пережить reload.

Image tool — исключение: несмотря на `experimental_` имя, включён при наличии image model, legacy false respected. Websearch registered, но backend может требовать выбора пользователя. MCP и custom plugins расширяют каталог, поэтому фиксированного полного списка всех tools инсталляции не существует.

**LSP model tool не найден в checked registry**. Более сильная конкретная улика: `edit.ts:254` и `write.ts:30` имеют TODO о notifications/diagnostics **after LSP runtime exists**. Не переносить старое утверждение «OpenCode встроенно предоставляет LSP tool» на этот HEAD. Это вывод по runtime tool surface, не утверждение об отсутствии вообще любых LSP-упоминаний в monorepo.

[Feature flag definitions](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/schema/src/config/flag.ts#L1-L23), [resolution](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/flag.ts#L26-L75), [LSP TODO edit](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/edit.ts#L254-L260), [LSP TODO write](https://github.com/anomalyco/opencode/blob/96a6c43b34e0ba59a9aad7247fbc77f0384eb17c/packages/core/src/tool/plugin/write.ts#L24-L42).

## 6. Что важно для сравнения с MauzCode

1. **Сравнивать capability, native schema surface и runtime helper surface отдельно.** У OpenCode Code Mode только для части каталога, direct file/shell tools остаются вне него. У MauzCode текущая сессия имеет native wrappers + discovery `ctx.fns`; это не эквивалент одного плоского набора.
2. **Auto-background вместо timeout-kill.** Shell timeout semantics и automatic wake существенно меняют orchestration; parameter `timeout` нельзя сравнивать одним checkbox.
3. **Детерминированный immutable request snapshot + reversible override**: reload не изменяет уже advertised executors; удаление plugin раскрывает предыдущую registration. Полезный контракт для hot reload и воспроизводимости.
4. **Visibility ≠ authorization** и **execute deny → direct fallback**. Нужны tests на запрет конкретных действий, а не на скрытие scripting tool.
5. **Раздельные machine output/model content/metadata**: machine output может быть маленьким, UI diff — большим. Это полезно для программной композиции без повторного парсинга prose.
6. **File-edit concurrency**: здесь внутренние locks и exact/normalized matching, но input не требует MauzCode-подобного `readId` version token. Нельзя заявлять одинаковую защиту от устаревшего прочтения.
7. **Background children с повторным idle notification**, session-scoped schedules и event cursor reconnect дают более точные lifecycle semantics, чем общее «есть subagents/background».
8. **Конфигурация и версии критичны**: stable/local/dev flags и модель меняют каталог. Old-name comparisons (`bash/task/apply_patch/lsp`) здесь фактически неверны.

## Ограничения

Статическое исследование конкретного remote HEAD. Не проверялись фактические сетевые providers, browser/UI behavior, исполнение MCP servers, безопасность sandbox adversarial-тестами, полный plugin ecosystem, все поддерживаемые OS и crash recovery. Некоторые output типы (worktree/artifact/MCP) в отчёте названы доменными типами, а не распечатаны рекурсивно; это намеренное ограничение объёма. Источник tool inventory — registrations и schemas/handlers, не marketing docs.
