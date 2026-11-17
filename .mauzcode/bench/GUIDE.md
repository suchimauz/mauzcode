# Бенчмарк инструментов для моделей в MauzCode

Стенд: `.mauzcode/bench/run.ts` → `ctx.fns.bench.run({ models, tasks?, label? })`.

## Как запустить

```js
await ctx.fns.bench.run({
  models: ["oneapi:qwen3.8-flash-next", "zai-coding:glm-5.3-flash"],
  label: "run-2026-10",
});
// или только часть заданий
await ctx.fns.bench.run({ models: ["oneapi:qwen3.8-flash-next"], tasks: ["runtests", "fixcode"] });
```

Каждая задача выполняется в **изолированном** child-агенте со свежим контекстом
и отдельной рабочей папкой `.mauzcode/tmp/<agent-id>/bench/...`, поэтому прогоны
не влияют друг на друга. Проверка объективная: эталон считает сам стенд
(файл на диске, реальный `bun test`, маркер в ответе).

## Задания

| id | что проверяет |
|---|---|
| `count` | подсчёт файлов через инструменты |
| `bughunt` | поиск бага и точное воспроизведение маркера |
| `writeverify` | запись файла + чтение обратно |
| `analysis` | сумма/медиана по данным файла |
| `fixcode` | правка бага + реальный запуск кода |
| `grepalias` | поиск по нескольким файлам |
| `runtests` | добиться зелёного `bun test` |
| `puzzle` | логика с ограничениями + строгий формат ответа |
| `multistep` | пошаговое выполнение инструкции |
| `notools` | ответ по памяти без инструментов |

## Результаты (свежий прогон)

| модель | pass | tool-вызовов/задачу | ср. время/задачу | completion-токены |
|---|---|---|---|---|
| oneapi:qwen3.8-flash-next | 27/30 (90%) | 3.7 | ~7.7 c | ~4300 на 30 |
| oneapi:qwen3-next-coder | 9/10 (90%) | 3.8 | ~18 c | ~670 |
| minimax-coding:MiniMax-M3.1-Flash | 10/10 | 3.8 | ~32 c | ~2000 |
| zai-coding:glm-5.3-flash | 10/10 | 2.5 | ~18 c | ~770 |

Единственный стабильный провал qwen — `puzzle`: ответ по логике верный, но
формат `apples11=2 code4=13` он соблюдает не всегда.

## Как писать промпты для qwen3.8-flash

1. **Формат — жёстко и в первую строку.** «Ответь одной строкой в формате X» работает плохо.
   Работает: «СТРОГО: твоя ПЕРВАЯ строка ответа должна быть ровно `apples11=<число> code4=<число>`» (3/3 успеха против 1/3 у мягкой формулировки).
2. **Давайте пример формата, а не только описание** — но пример должен быть «шаблон», а не готовый ответ.
3. **Просите инструменты явно и по делу**: «используй поисковые инструменты», «перечитай файл и только потом отвечай».
4. **Маркеры копировать дословно**: «скопируй ровно маркер из комментария, в точности как записано» — иначе переводит/переписывает.
5. **Не перегружайте форматом**: qwen хорошо работает с одним-двумя проверяемыми полями, плохо — с пятью.
6. **Проверку результата просите явно**: «выполни и приведи фактический вывод команды» — иначе он может заявить успех без запуска.

## Сравнение маршрутов инструментов: `bench.routes`

`.mauzcode/bench/routes.ts` → `ctx.fns.bench.routes({ model, scenarios?, arms?, repetitions?, concurrency?, timeoutMs?, presetId?, label?, selfTest? })`.

Сравнивает не модели, а **маршруты**: один снимок пресета (по умолчанию Standard) даёт две «руки».

- общая база — снимок + `allow` всех нативных адаптеров (`tools.toolSearch`, `tools.toolDescribe`, `tools.readResult`, `tools.requestInput`, `tools.planUpdate`, `tools.planDone`, `tools.delegateTask`, `tools.finishTask`), чтобы кастомизированный Standard без этих grant'ов не превращал native-руку во вторую eval-руку;
- `eval` — база + `deny` тех же адаптеров;
- `native` — база.

Промпты сценариев `plan` и `delegate` не называют API (`session.plan`, `agent.delegate`), чтобы не подталкивать ни одну руку к конкретному маршруту; результаты до `add-p1-plan-delegation-tools` получены со старыми промптами.

Перед запуском стенд проверяет, что снимки отличаются только этими deny. Каждый прогон — новый hidden-агент со своей папкой в `.mauzcode/tmp/<agent-id>/bench-routes/...`.

```js
await ctx.fns.bench.routes({ selfTest: true });              // бесплатно: руки, not_exercised, порог
await ctx.fns.bench.routes({ model: "claude/…:claude-opus-5-5" }); // 2 руки × 6 сценариев × 3, concurrency 4
await ctx.fns.bench.routes({ model, arms: ["native"], scenarios: ["large_result"], repetitions: 1 });
```

| сценарий | что проверяет (объективно) | exercise-детекция |
|---|---|---|
| `discovery` | имя `markdown.highlight` и обязательные опции из `runtime.docs.get` в ответе | был хотя бы один вызов инструмента |
| `question` | ровно один `choice`-input с `_agentWait`, все три ветки в опциях, вызов формы — последний | — |
| `mixed` | `input.kinds` назван (в ответе или в форме), один `confirm`-input, последний вызов | — |
| `large_result` | точный токен строки N из `cat data.txt` (~37k символов, токен в середине) | есть stored result (`result_ref`), иначе `not_exercised` |
| `plan` | план s1..s3 в scratchpad, все `done`, файлы `stepN.txt` с метками | — |
| `delegate` | ребёнок со статусом `ready` и `result.count` = числу файлов в фикстуре | — |

Метрики на прогон: исход (`success`/`failure`/`not_exercised`/`error`), вызовы по именам (вместе с детьми), отклонённые вызовы (`invalid arguments`, `typecheck failed`, `unknown option`), stored results, токены из событий `context_usage` (prompt+completion, корень и дети), ходы модели корня, длительность. Открытые формы после прогона отменяются (`actor: system:bench`) и учитываются в `openInputsCancelled`/`openInputsLeft`.

Отчёт: `.mauzcode/bench/results/routes-<timestamp>.json` (агрегаты по рукам и сценариям, решение по порогу, все прогоны). Порог: success native ≥ success eval **и** токены или p50 ходов падают ≥10%; считаются только exercised-прогоны.

Последние результаты и решение: `openspec/changes/refresh-native-tools-ab-baseline/research/ab-baseline-2.md`.
