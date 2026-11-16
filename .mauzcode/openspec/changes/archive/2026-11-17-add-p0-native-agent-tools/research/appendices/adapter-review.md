# Независимый review native adapters

Метод: только чтение AGENTS.md, двух parent notes, MauzCode inventory, Codex/OpenCode reports и ключевых MauzCode handlers. Проект/тесты/настройки не изменялись; тесты не запускались. Единственная запись — этот scratch-отчёт. Внешние checkout повторно не аудировались: их результаты — сравнительный контекст, не независимое подтверждение.

## 1. Discovery filter: вывод верен, но требование сильнее текущего eval

`src/agentPreset/guardFns.ts:13–42` внедряет trusted `allows` только в перечисленные discovery calls; `src/tools/call.ts:39–42,63–105` проверяет implementing function и вызывает её через ordinary context. Прямой native mapping на docs.search/get не переносит этот predicate. Wrapper должен проверять и свою доступность, и исходные capabilities.

**Поправка:** «фильтровать до ranking/limits» — не уже достигнутая parity. `src/runtime/docs/search.ts:28–39` сначала получает ограниченный BM25/vector candidate pool, затем `.filter(visible)`. Запрещённые кандидаты могут вытеснить разрешённые, хотя наружу не возвращаются. Критерии отдельно: (а) отсутствие metadata leak, (б) полнота разрешённого top-k; тест с >60 denied hits над allowed hit. Wrapper, просто переиспользующий guard, решает (а), но не гарантирует (б).

## 2. Проверить отрицательные ответы, не только успешный каталог

`src/tools/call.ts:33–37` делает unfiltered tools.list и в unknown-tool error печатает все available wire names; preset check идёт позже. Поэтому существующий dispatcher сам по себе не доказывает обещание «denied function not leaked via catalog» для всех каналов. Это статически обнаруженный риск, не выполненный exploit.

**Критерий:** неизвестное имя при ограниченном preset не раскрывает denied tool names; те же проверки для unknown input kind, docs.get точного denied name, plugin search/read, коллизий wire names. Не переносить «generic registry sufficient» на утверждение «его ошибки уже полностью permission-filtered».

## 3. Trusted binding — разные контракты delegation и input

`src/agent/delegate.ts:16,28–39` использует переданный Agent как parent authority и источник fork; `src/input/request.ts:35–48` разрешает явный agentId, иначе agent.current. Поэтому native schemas должны исключать Agent/agentId владельца, брать их из trusted invocation. Goal adapter (`src/goal/toolCreate.ts:20–25`) — пример separation, но его root/CAS/claim нельзя механически копировать.

**Критерии:** попытка подменить владельца отвергается до эффекта; конкурентные вызовы двух agents сохраняют правильные workspace/host/parent/wake target; delegated preset только сужает права; отсутствующий trusted context даёт отказ, а не случайный current agent. `request_input` возвращает open/id, не ответ; wait gate и ранний ответ проверяются на turn boundary. Goal-bound delegation и обычная delegation должны обе сохранить свои lifecycle contracts.

## 4. Registry достаточен для wrappers, не для deferred exposure

`src/agent/wireTools.ts:14–22` строит полный выбранный разрешённый список из registry; discovery не меняет этот список. `src/tools/call.ts:101–105` разрешает актуальный handler на invocation (hot reload), а не фиксирует advertised executor.

**Поправка:** разделить два проекта: небольшие декларации/wrappers поверх существующего dispatcher и deferred activation со state/lifetime/provider protocol. Критерии второго: schema появляется только после разрешённой активации; activation не расширяет grants; unload/reload между advertise/call даёт определённый результат; коллизии и stale schema не вызывают иной handler. По OpenCode report immutable request snapshot — полезная альтернатива, но это не нынешняя гарантия MauzCode.

## 5. Сохранение eval разумно, но native не уменьшает общую власть само по себе

`src/repl/eval.ts:20–29` устанавливает guarded facade и trusted agent binding; `guardFns.ts:40–42` явно оставляет allowed procedures unguarded caller context. AGENTS.md прямо говорит: presets не sandbox. Поэтому wrappers повышают понятность schema/validation и могут сокращать ошибки, но сохранённые eval/shell не становятся confined Code Mode, как описан в OpenCode report.

**Критерии:** сравнивать одинаковые реальные grants, не только число tools; не экспортировать все admin/secret/storage APIs; не обещать security boundary от замены eval native вызовами. Сохранять eval для композиции; не обещать, что большие batch-вызовы безопасно прерываются после input.request — handler прямо требует ставить его последним.

## 6. Приоритеты P0 пока гипотеза: измерять полный цикл и fallback

Наличие в Codex/OpenCode похожего tool не доказывает выигрыш для MauzCode. Сравнение должно фиксировать model/config/mount/grants, учитывать initial schema tokens и следующий turn после discovery, а не только число вызовов.

**Критерии:** A/B baseline eval против малого native набора: успешное завершение, ошибки параметров, p50/p95, суммарные tokens, восстановление UUID output, ownership failures, отмена с неизвестным исходом, early-answer input, child completion/result delivery. Не смешивать accepted/running/completed. Нужны сценарии unavailable plugin и provider schema incompatibility без автоматической установки/ослабления прав. Рекомендация сохранить eval и не экспортировать всё обоснована; точный порядок P0/P1 — до измерения не доказан.

Итог: основные рекомендации подтверждены; существенные новые уточнения — pre-ranking filtering ещё не обеспечен существующим discovery и unknown-tool error использует unfiltered names. Остальные пункты уточняют acceptance criteria, а не требуют переписать registry.
