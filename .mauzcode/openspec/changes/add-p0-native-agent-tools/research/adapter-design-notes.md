# Технические требования к native adapters (проектные рекомендации, не реализовано)

## Важная ловушка безопасности

Существующий `tools.call` проверяет разрешение на `tool.fn`, но затем исполняет обработчик с ordinary callCtx. `agentPreset.guardFns` внедряет `allows` в discovery (`runtime.docs.*`, `plugins.*`, `input.kinds`, `canvas.*`) лишь при вызове через guarded eval facade. Следовательно нельзя бездумно добавить `$tool_capability_search` с `fn: runtime.docs.search`: исходная функция принимает необязательный внутренний `allows`, и вызов вне facade может показать запрещённые метаданные. Native adapter обязан восстановить тот же доверенный preset-aware discovery filter и фильтровать до ranking/limits, не принимать allows от модели. Одна проверка разрешения на новый wrapper также не заменяет проверки его базовых capabilities.

## Binding

Не передавать `agent: Agent`, произвольный agentId владельца, ctx, session, snapshot, allows, raw secret в JSON инструмента. Current agent/session/workspace/host — доверенный контекст вызова. Поддерживать только явно авторизованный peer/member identifier там, где он предмет действия, с ownership check. Существующий goal.toolCreate показывает разницу model payload и trusted authority; нельзя механически переиспользовать goal authority для иных функций.

## Наборы

- Малое постоянное ядро: существующие file/shell/eval + capability_search/capability_describe/read_result/request_input.
- Orchestration bundle: plan_update/plan_done/delegate_task/finish_task, при необходимости agent_message/team_status; только нужные текущей роли. Finish_task обязателен дочернему агенту, не обязателен корню. Tracking-plan != advisory planning.enter != goal.
- Optional plugin bundle: web_search/web_read/browser actions/semantic workspace code tools; только mounted+granted+configured. Source presence и docs grants недостаточны.
- Research phase не меняет default preset/tool grants или project configuration.

## Параметры и результаты

Discovery: bounded compact summaries, explicit function name, runtime schema+returnType по exact name, не полный source/blob на каждый hit. Можно позднее отдельно добавить deferred native schema activation, но docs search сам по себе ничего в следующем tools[] не активирует.

Read_result: существующие UUID/range/ownership/error semantics; offset UTF-16 (не byte offset), no rerun on truncated output/storage failure.

Request_input: kind-specific validation, current agent injected; wait happens at turn boundary; dispatch only returns request id, not answer or permission. Protected action approval remains exact workflow-specific approval.

Delegate: return accepted child id and explicit running state; no immediate invented result; result through existing finishTask mechanism. Completion requires a JSON-compatible result. No synchronous busy wait/poll.

Exec lifecycle (new capability): separate start, stdin/output or continue, cancel; handle owner+host+cwd; output cursor with maxBytes/tokens; exitCode optional until finished; process-group cleanup; redaction across chunks; restart/TTL/disconnect explicit. Durable process survival is a design choice, not an automatic consequence of returning job id. Forbid arbitrary PID takeover. Respect host/environment separation and no secrets in returned command/output.

## Проверки

Native and eval path same authorization/results; denied function not leaked via catalog; wrong ownership no effect; invalid input rejected before handler; schema valid per supported provider (neutral wireTools + models.protocol.* authoritative, legacy tools.schemas not necessarily agent path); output preservation JSON/images/documents; strictable != schema merely has additionalProperties false; cancellation can mean result unknown and must not trigger automatic replay.
