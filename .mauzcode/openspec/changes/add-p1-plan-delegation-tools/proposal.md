## Why

The refreshed A/B baseline (`refresh-native-tools-ab-baseline`, `research/ab-baseline-2.md`) met the decision threshold: with the four P0 native tools, total tokens fell by 19.7% at equal success (18/18). Planning and delegation still go through `tools_eval` in both arms: the `plan` and `delegate` scenarios spend 7 and 18 tool calls per 3 runs, include typecheck rejections, and the eval route needs extra turns to read a child's result. The roadmap names plan and delegation tools as the first P1 bundle.

## What Changes

- Add native tool `plan_update`: create or replace the invoking agent's visible plan (title and ordered tasks with stable ids), preserving the state of tasks whose ids are kept.
- Add native tool `plan_done`: mark the active task of the invoking agent's plan done by id and return the next active task.
- Add native tool `delegate_task`: delegate an ordered task list to a new child agent of the invoking agent and return the child id immediately.
- Add native tool `finish_task`, advertised only to delegated children: finish the delegated plan with a required summary and JSON-compatible result delivered to the parent.
- Grant the four adapters in the built-in Standard preset through a conservative migration, as was done for the P0 tools; customized presets are not changed.
- Measure the effect with `bench.routes` (`plan` and `delegate` scenarios) against the recorded baseline.

## Capabilities

### New Capabilities

- `native-plan-delegation`: typed native tools for the invoking agent's visible plan and for delegating work to child agents and finishing it, bound to the trusted invocation.

### Modified Capabilities

None.

## Impact

Four `$tool_*.md` declarations and adapters in `src/tools/`, delegating to `session.updatePlan`/`session.plan`, `session.done`, `agent.delegate` and `agent.finishTask`; a Standard preset migration; tool prompt snippets; tests next to the existing native tool tests. No change to the underlying plan, delegation or preset semantics.
