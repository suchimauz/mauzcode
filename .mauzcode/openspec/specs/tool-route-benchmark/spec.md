# tool-route-benchmark Specification

## Purpose
Compare agent tool routes, such as eval-only and native tools, with a repeatable benchmark whose scenarios provably exercise the routes under test and whose checks are objective. Decisions about new native tools rest on its measured evidence.

## Requirements

### Requirement: Isolated two-arm runs
The benchmark SHALL run every selected scenario a fixed number of times in each arm, on the same model and preset base. Each run SHALL use a new hidden agent and its own working directory. The eval-only arm MUST differ from the native arm only by denying the native adapters under test.

#### Scenario: Arms differ only in native adapters
- **WHEN** the benchmark starts both arms
- **THEN** the arm snapshots are equal except that the eval-only arm denies the native adapters under test

#### Scenario: Runs do not share state
- **WHEN** two runs of the same scenario execute
- **THEN** they use different agents and working directories, and neither sees the other's files or transcript

### Requirement: Objective scenario checks
Each scenario SHALL define a check that decides success from data the benchmark computes or observes: an expected value derived from the fixture, opened input records, or tool calls in the transcript. Success MUST NOT depend on operator judgement. The benchmark MUST NOT perform outward or destructive actions, and it SHALL cancel any form a run leaves open.

#### Scenario: Expected value from fixture
- **WHEN** a scenario asks for a fact about its generated fixture
- **THEN** the check compares the final answer with the value computed from that fixture

#### Scenario: Open forms are cleaned up
- **WHEN** a run ends with an open input
- **THEN** the benchmark records it and cancels it before the next report

### Requirement: Exercise detection
A scenario SHALL declare the capability it exercises, for example a stored-result read, a discovery lookup or a structured input. A run SHALL be classified as `not_exercised` when the transcript shows the capability was not needed: for a stored-result scenario, no stored result was created. `not_exercised` runs MUST be reported separately and MUST NOT count as successes.

#### Scenario: Large output reduced by a pipeline
- **WHEN** a stored-result scenario run finishes without any stored result in its transcript
- **THEN** the run is reported as `not_exercised`, not as success

### Requirement: Metrics and stored report
For every run the benchmark SHALL record arm, scenario, repetition, agent id, success or `not_exercised`, tool call count by tool name, calls rejected for parameters or typecheck, total prompt and completion tokens, model turns, and duration. The report SHALL aggregate success rate, rejected calls, total tokens and p50/p95 turns per arm and per scenario. It SHALL be saved where a later run can compare against it.

#### Scenario: Per-arm aggregate
- **WHEN** all runs finish
- **THEN** the report shows, for each arm, success rate, rejected calls, total tokens and p50/p95 turns, plus per-scenario token totals

### Requirement: Decision threshold
The report SHALL state whether the native arm meets the threshold. The threshold is met when the native success rate is not lower than the eval-only rate and either total tokens or p50 turns falls by at least 10%. Only exercised runs count.

#### Scenario: Threshold missed
- **WHEN** native success equals eval-only success and tokens fall by 7% while p50 turns rise
- **THEN** the report states the threshold is not met
