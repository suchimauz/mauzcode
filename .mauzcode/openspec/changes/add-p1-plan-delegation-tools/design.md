## Context

See proposal.md. P0 native tools (`tool_search`, `tool_describe`, `read_result`, `request_input`) are `$tool_*.md` declarations with adapters in `src/tools/`, dispatched by `tools.call`; `requires:` names the runtime function, and `tools.permitted` checks both the adapter and the required function against the frozen preset snapshot. Adapters bind the agent from the trusted session, never from arguments. Plans live in the agent scratchpad (`session.plan`, `session.updatePlan`, `session.done`); delegation is `agent.delegate` + `agent.finishTask` with the result delivered through the inbound outbox.

## Goals / Non-Goals

**Goals:** typed schemas for the four operations; identical semantics to the runtime functions; Standard grants for new installs and untouched factory Standard rows.

**Non-Goals:** changing plan, delegation, goal or planning-mode semantics; native `agent_message`/`team_status` (separate, by observed frequency); `wakeParent`/await modes beyond what `agent.delegate` does by default.

## Decisions

1. **Thin adapters over existing functions.** `plan_update` calls `session.plan` when the agent has no plan and `session.updatePlan` otherwise; `plan_done` → `session.done`; `delegate_task` → `agent.delegate`; `finish_task` → `agent.finishTask`. Reimplementing state transitions was rejected: two sources of truth for plan state would drift.
2. **One `plan_update` instead of separate create/update tools.** The model does not need to know whether a plan exists; fewer schemas cost fewer prompt tokens (the P0 run showed ≈1.4k tokens per request for four schemas).
3. **`finish_task` visibility by delegation metadata.** Advertised only when the invoking agent's scratchpad carries delegation metadata from `agent.delegate`; the adapter re-checks at execution. Advertising it to every agent was rejected: the model calls it outside delegation and gets an error.
4. **`result` schema is any JSON value, required.** Mirrors `agent.finishTask`; `null` is rejected as missing.
5. **Conservative Standard migration.** Same pattern as `20380103120000_native_agent_tools`: one conditional UPDATE that matches only the exact previous factory definition and appends `tools.planUpdate`, `tools.planDone`, `tools.delegateTask`, `tools.finishTask`.
6. **Measurement.** Extend `bench.routes` arms with the new adapters as the "native" difference for the `plan` and `delegate` scenarios (the eval arm denies them), and compare with the baseline in `refresh-native-tools-ab-baseline/research/ab-baseline-2.md`.

## Risks / Trade-offs

- [Extra schemas raise the cost of every request] → measured by `bench.routes`; if the `question` scenario cost grows notably, consider deferred exposure in a later change.
- [A customized Standard does not receive the grants] → documented; operators add them in the preset editor, as with P0.
- [Goal-bound delegation path in `agent.delegate`] → the adapter calls the same function, so goal authority handling is unchanged; covered by a test with a goal-bound parent.
