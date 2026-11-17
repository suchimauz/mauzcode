## Why

The first A/B for native agent tools (archived `2026-11-17-add-p0-native-agent-tools`, `research/ab-baseline.md`) was run by hand from an eval snippet. Its results were judged by the operator, and its large-result scenario never produced a stored result, so `read_result` was not measured. Total tokens fell by 7.2%, short of the 10% threshold, so the P1 bundle (plan and delegation tools) is blocked on evidence we did not actually collect. We need a repeatable benchmark whose scenarios provably exercise each tool and whose checks are objective.

## What Changes

- Add a reproducible tool-route benchmark that runs fixed scenarios in two arms (eval-only and native), with fresh hidden agents on one model and isolated working directories. It records success, tool calls, rejected calls, tokens and turns per run, and stores the results.
- Make the checks objective: compare the answer with an expected value computed by the benchmark, look at forms in the inputs table, and look at tool calls in the transcript, with no operator judgement.
- Fix the large-result scenario: the answer requires quoting from a single large output that cannot be reduced by a shell pipeline. A run where no stored result was created is counted as "not exercised", not as a success.
- Add planning and delegation scenarios that measure the eval route today and provide the baseline for the P1 native plan/delegation tools.
- Re-run the benchmark, record the results, and decide on P1 with the threshold from the original design. If the threshold is met, create the change for the first P1 bundle (plan and delegation tools). Web tools (`web_search`, `web_read`) and background process tools (`exec_start`, `exec_read`) follow as separate changes, in that order.

## Capabilities

### New Capabilities

- `tool-route-benchmark`: reproducible comparison of agent tool routes (eval-only vs native) with fixed scenarios, objective checks, exercise detection, metrics and a decision threshold.

### Modified Capabilities

None.

## Impact

Project-local benchmark procedure next to `.mauzcode/bench/run.ts`, a temporary preset or snapshot for the arms, and model tokens for the runs (about 2 arms × 6 scenarios × 3 runs). Runtime tools and presets do not change. The stored Standard already grants the four native tools.
