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
