## Context

See proposal.md. The first run lives in `archive/2026-11-17-add-p0-native-agent-tools/research/ab-baseline.md`. `.mauzcode/bench/run.ts` (`bench.run`) is an existing project-local harness. It builds fixtures per task, runs a hidden child agent per task, and checks results objectively. It compares models, not tool routes or presets.

## Goals / Non-Goals

**Goals:** a repeatable route benchmark; a valid `read_result` measurement; a baseline for P1 plan/delegation tools.

**Non-Goals:** implementing P1 tools; changing native tools or presets; a CI job (runs cost real model tokens and stay manual).

## Decisions

1. **A separate project-local procedure, `bench.routes`, next to `bench.run`.** It reuses the same structure: a task list with `build` and `check`, and hidden agents. The difference is that it runs over arms (preset snapshots) rather than models. Extending `bench.run` was rejected: its results and guide are about models, and mixing the two axes complicates both.
2. **Arms as snapshots.** Resolve Standard once. Arm A is a clone with the native adapters denied, and arm B is the unmodified clone. This matches the first run and does not touch stored presets.
3. **Scenarios:**
   - `discovery`: the expected function name and required options are read from `runtime.docs.get` at run time.
   - `large_result`: the fixture is one generated file of more than 30k characters, with random tokens on numbered lines. The prompt asks for the exact token on line N, which appears only in the middle of the output, and forbids filtering commands. A pipeline that avoids storage is still possible, and that is why exercise detection exists.
   - `question`: expects one choice input in the inputs table and no tool calls after it.
   - `mixed`: same as before, with a confirm input check.
   - `plan`: the prompt requires a 3-step plan, completing step 1 and reporting. The check is that the plan exists with the right task states.
   - `delegate`: the prompt delegates counting files in a fixture directory to a child. The check is that the child finished with the right result.
4. **Metrics from storage.** Tokens come from `context_usage` events, calls from `messages.tool_calls`, rejections from tool results matching typecheck or argument errors, and inputs from the `inputs` table. The report is written to `.mauzcode/bench/results/routes-<timestamp>.json`, and a summary goes to the guide.
5. **Concurrency 4, 3 repetitions.** Same as the first run, so the numbers can be compared.

## Risks / Trade-offs

- [The model still avoids the stored result] → exercise detection reports it; if most runs are `not_exercised`, the scenario is reworked rather than counted.
- [Token cost of about 36 runs] → the scenario set and repetitions are parameters; the default is the full set.
- [Child agents in `delegate` inherit the parent preset intersection] → arms are applied at the parent, so children follow the arm.
