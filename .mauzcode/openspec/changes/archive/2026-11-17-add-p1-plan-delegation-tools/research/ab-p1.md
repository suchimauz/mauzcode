# A/B: native plan and delegation tools vs eval route (`bench.routes`)

Run for task 4.2 with `.mauzcode/bench/routes.ts`, scenarios `plan` and `delegate`, 2 arms × 3 repetitions per report, concurrency 4, model `claude/2yfl55fsh:claude-opus-5-5` (same as `ab-baseline-2.md`).

Reports:

1. `.mauzcode/bench/results/routes-2026-11-17T09-53-31-264Z.json` — first run, `finish_task.result` untyped.
2. `.mauzcode/bench/results/routes-2026-11-17T09-56-06-951Z.json` — after `result` became `type: object`.
3. `.mauzcode/bench/results/routes-2026-11-17T09-57-53-241Z.json` — repeat of 2.

## Procedure changes (task 4.2)

- `NATIVE` now also lists `tools.planUpdate`, `tools.planDone`, `tools.delegateTask`, `tools.finishTask`; the eval arm denies all eight adapters.
- Both arms start from the stored default preset **plus allow of all eight adapters**. The stored Standard on this machine is customized (plugins `nrepl`, `openspec`), so the migration did not grant the new adapters to it; without this the native arm would silently be a second eval arm. Self-test asserts the arms differ only by the denies and the native arm is base + these grants.
- The `plan` and `delegate` prompts no longer name `session.plan`/`session.done`/`agent.delegate`; they named the eval route and would steer the native arm into eval. **Because of this the numbers are not directly comparable with `ab-baseline-2.md`**; comparison below uses the same-prompt eval arm.

## Results (all 3 reports, 9 runs per arm and scenario)

| Arm / scenario | Success | Error | Failure | Calls/run (ok) | Rejected (ok) | Tokens/run (ok) | p50 turns (ok) |
|---|---|---|---|---|---|---|---|
| eval / plan | 9 | 0 | 0 | 5.8 | 3 | 94,795 | 7 |
| native / plan | 9 | 0 | 0 | 7.0 | 0 | 115,928 | 8 |
| eval / delegate | 4 | 5 | 0 | 4.8 | 0 | 107,159 | 5 |
| native / delegate | 6 | 0 | 3 | 4.0 | 0 | 130,707 | 4 |

The 3 native `delegate` failures are all from report 1: the child computed the right count but passed `result` as a JSON-encoded string (`"{\"count\": 9}"`) to the untyped field. After `result` became `type: object` (design decision 4, revised) the native route went 6/6.

The 5 eval `delegate` errors (reports 2–3) are `Run ownership lost`: the eval parent kept polling `agent.team` through `tools_eval` instead of ending its turn, the child's completion woke the parent through the worker, and the bench's inline run lost ownership. The native parent ended its turn after `delegate_task` in every run (its description says so).

Baseline 2 for reference (old prompts naming the API, eval route in both arms): plan 2.3 calls / 46,596 tokens / 3 turns per run; delegate 6 calls / 125,889 tokens / 5 turns per run.

## Observations

- **Reliability improved, tokens did not.** Native runs had 0 rejected calls (eval: 3 typecheck rejections in `plan`) and no polling errors in `delegate`. But the native `plan` route costs ~22% more tokens: it makes one tool call per step (`plan_update`, 3×`write`, 3×`plan_done` = 7 calls, 8 turns), while the eval route batches a file write and `session.done` in one `tools_eval`. Native `delegate` costs ~22% more per successful run, partly from the four extra schemas in every request (as with P0, ≈1.4k tokens per request for four schemas).
- Variance is high between reports (native plan 99k–132k tokens/run; eval plan 41k–125k).

## Decision

Rule: native success ≥ eval success and tokens or p50 turns fall ≥10%, exercised runs only.

- Success: native 15/18 over all reports, 12/12 after the `result` fix (reports 2–3). Eval 13/18; its 5 errors are excluded by the rule's exercised-runs filter, which leaves 13/13. By the rule, native is therefore lower overall (15/18 < 13/13) and equal after the fix (12/12 vs 7/7 exercised in reports 2–3), even though eval actually completed fewer runs.
- Tokens: higher (+22% per successful run in both scenarios). p50 turns: plan 7 → 8, delegate 5 → 4.

**The token threshold is not met.** The bundle ships for reliability (no typecheck rejections, typed `result`, no polling after delegation) rather than cost. Follow-ups worth measuring before more native tools: deferred exposure of rarely used schemas (design risk 1), and letting `plan_done` be batched (e.g. accept an optional list of ids) so a step does not need its own turn.

## Checks (task 4.3)

- `code.quality({})`: ok, 0 errors; 568 warnings, none in the new or changed functions (`tools.planUpdate/planDone/delegateTask/finishTask/available/isDelegatedChild`, `tools.call`, `agent.wireTools`, `agent.delegate`, `agent.fullSystemPrompt`).
- `procs.dev.typecheck({})`: ok, 0 errors (after the last edit).
- Fast suite `bun run test`: 3763 pass, 12 skip, 0 fail (626 files). The first run had 32 failures caused by this change (hand-built fixture contexts without `tools.available`, and expected tool lists); fixed by calling the gate only for tools that declare `availableWhen` and by updating the expected lists (`tools.test.ts`, `run.test.ts`, `presetPrompt.test.ts`). No pre-existing failures.
