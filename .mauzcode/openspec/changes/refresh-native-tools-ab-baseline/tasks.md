# Tasks

## 1. Benchmark procedure

- [ ] 1.1 Create `bench.routes` in `.mauzcode/bench/` with arms as preset snapshots, concurrency and repetitions; verify that the arm snapshots differ only by the adapter denies (unit check in the procedure's self-test)
- [ ] 1.2 Implement the metrics collection and report file; verify on one cheap scenario run that the report has every field from the spec
- [ ] 1.3 Cancel open inputs at the end of each run; verify that no benchmark input stays open after a run

## 2. Scenarios

- [ ] 2.1 Port `discovery`, `question`, `mixed` with objective checks; verify each passes once in the native arm
- [ ] 2.2 Add `large_result` with fixture-derived expected token and exercise detection; verify one run creates a stored result, and that a synthetic transcript without one is classified `not_exercised`
- [ ] 2.3 Add `plan` and `delegate` scenarios with storage-based checks; verify each passes once
- [ ] 2.4 Document `bench.routes` in `.mauzcode/bench/GUIDE.md`

## 3. Run and decide

- [ ] 3.1 Run the full benchmark (2 arms × 6 scenarios × 3); record the results and the threshold decision in this change's `research/ab-baseline-2.md`
- [ ] 3.2 Act on the decision: if the threshold is met, create the OpenSpec change for the first P1 bundle (native `plan_update`/`plan_done` and `delegate_task`/child-only `finish_task`) and verify that it passes `validate --strict`; if it is not met, record in `research/ab-baseline-2.md` why P1 is blocked and what would unblock it

## Workflow follow-up

- Roadmap after this change, in order, each one a separate OpenSpec change with its own spec, proposed only after the previous one ships and its effect is measured with `bench.routes`:
  1. P1 plan and delegation tools: `plan_update`, `plan_done`, `delegate_task`, child-only `finish_task` (created by task 3.2 when the threshold is met).
  2. Native web tools: `web_search`, `web_read` over the shipped `websearch` plugin, advertised only when the plugin is granted.
  3. Background process management: `exec_start`, `exec_read` and related lifecycle tools. This is a new capability, not a wrapper over an existing one, and it needs its own design for ownership, limits and cleanup.
- Source of the order: `archive/2026-11-17-add-p0-native-agent-tools/research/README.md`, section 5.
- Archive this change after 3.1–3.2.
