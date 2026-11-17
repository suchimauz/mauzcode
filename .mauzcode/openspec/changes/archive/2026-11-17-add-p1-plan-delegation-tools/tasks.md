## 1. Plan tools

- [x] 1.1 Add `$tool_plan_update.md` and `tools.planUpdate` (create via `session.plan` when absent, otherwise `session.updatePlan`); verify create, revise-with-kept-state and duplicate-id rejection in tests
- [x] 1.2 Add `$tool_plan_done.md` and `tools.planDone` over `session.done`; verify active, already-done (idempotent) and pending (rejected) cases in tests

## 2. Delegation tools

- [x] 2.1 Add `$tool_delegate_task.md` and `tools.delegateTask` over `agent.delegate`; verify the immediate child id, the child plan, and that a wider `presetId` cannot widen the parent's preset
- [x] 2.2 Add `$tool_finish_task.md` and `tools.finishTask` over `agent.finishTask`, advertised only to delegated children; verify single delivery, unfinished-plan rejection and absence for non-delegated agents

## 3. Binding and gating

- [x] 3.1 Reject unknown arguments, including `agent`/`agentId`, and calls without a trusted invocation in all four adapters; verify in tests
- [x] 3.2 Verify preset gating: denying an adapter removes the tool while the runtime function stays reachable through evaluation

## 4. Presets and measurement

- [x] 4.1 Add the conservative Standard migration granting the four adapters; verify factory Standard is upgraded and a customized Standard is untouched
- [x] 4.2 Extend `bench.routes` so the eval arm also denies the four new adapters; run the `plan` and `delegate` scenarios (2 arms × 3) and record the comparison with `ab-baseline-2.md` in this change's `research/`
- [x] 4.3 Run `code.quality`, one project typecheck and the fast test suite; record results, separating pre-existing failures

## Workflow follow-up

- Archive this change after 4.3.
- Next roadmap item: native web tools (`web_search`, `web_read`) as a separate change, proposed after this one ships and its effect is measured.
