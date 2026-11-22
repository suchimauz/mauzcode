# Typed decisions and agent advice

## Purpose
Describe how callers obtain typed answers across decision engines and when opt-in agent helpers recommend a next step or withhold advice.

<!-- Last verified: d35de7c2, 2026-11-22 (source inspection) -->

## Requirements

### Requirement: Reject unsupported question counts
The decision entry point SHALL reject an empty question map, a choice outside two to 255 options, or a score with fewer than two levels before contacting a provider.

#### Scenario: Single-option choice
- **WHEN** a caller supplies a choice with just one option
- **THEN** the call fails without a provider request.

<!-- id: decision.ask.question-count -->
<!-- entities: question map, choice, score -->
<!-- enforced: src/decision/ask.ts decision.ask -->
<!-- test: src/decision/decision.test.ts :: malformed questions are rejected before any request is made -->

### Requirement: Select an engine compatible with the input
The decision entry point SHALL route images to OpenAI; without images it SHALL use an explicit engine or, if omitted, OpenAI for the global `openai` setting and Jev otherwise.

#### Scenario: Images override a text engine request
- **WHEN** a caller requests Jev and supplies a nonempty image list
- **THEN** OpenAI receives the message-form input including the images.

<!-- id: decision.ask.engine -->
<!-- entities: images, engine -->
<!-- enforced: src/decision/ask.ts decision.ask; src/decision/engineOpenai.ts decision.engineOpenai -->
<!-- test: src/decision/decision.test.ts :: images force the openai engine and the message input form -->

### Requirement: Return keyed typed answers
Both decision engines SHALL return typed answers keyed by question ID together with the responding engine, model, usage and latency.

#### Scenario: Choice on either engine
- **WHEN** either engine receives a valid provider choice for a question
- **THEN** its result exposes the selected option, probabilities and confidence under that question's ID, rather than requiring the caller to parse provider text.

<!-- id: decision.engineOpenai.answers -->
<!-- entities: answers, usage -->
<!-- enforced: src/decision/engineJev.ts decision.engineJev; src/decision/engineOpenai.ts decision.engineOpenai -->
<!-- test: src/decision/decision.test.ts :: openai engine converts questions to an array and answers back to a map -->

### Requirement: Assess explicit evidence without acting
Evidence assessment SHALL require the caller's evidence flag to be true and return advice rather than executing it. A weak choice, an unsupported answer or provider failure SHALL yield abstention.

#### Scenario: Evidence supports a next step
- **WHEN** an enabled caller receives a valid search choice with confidence and selected probability both at least 0.85
- **THEN** the helper recommends search without performing one.

#### Scenario: No evidence supports answering
- **WHEN** an otherwise acceptable choice recommends answering with an empty evidence list
- **THEN** the helper returns `abstain` with reason `unsupported`.

<!-- id: agent.assessEvidence.outcome -->
<!-- entities: caller, evidence, advice -->
<!-- enforced: src/agent/assessEvidence.ts agent.assessEvidence -->
<!-- test: src/agent/assessEvidence.test.ts :: maps search without executing it; empty evidence cannot justify answering -->

### Requirement: Preserve the caller's policy during risk review
Risk review SHALL skip provider assessment without opt-in or on policy denial. Its result SHALL preserve denial and required confirmation even if the suggested risk is low.

#### Scenario: Low risk for an action requiring confirmation
- **WHEN** an enabled caller supplies policy `confirm` and the assessment returns low risk
- **THEN** the effective requirement remains `human-review`.

#### Scenario: Assessment times out on an allowed action
- **WHEN** policy is `allow` and the enabled assessment times out
- **THEN** risk is unknown and the effective requirement is `human-review`.

<!-- id: agent.reviewActionRisk.finish -->
<!-- entities: policy decision, risk, effective requirement -->
<!-- enforced: src/agent/reviewActionRisk.ts agent.reviewActionRisk -->
<!-- test: src/agent/reviewActionRisk.test.ts :: low risk never overrides confirm; timeout preserves allow -->

### Requirement: Recommend only eligible candidates without dispatch
Executor advice SHALL require caller opt-in and an eligible explicit candidate list. It SHALL return a snapshot recommendation, not dispatch work, and abstain on ambiguous advice or provider failure.

#### Scenario: Clear candidate choice
- **WHEN** the enabled helper receives a valid candidate choice with confidence at least 0.6 and probability strictly above every alternative
- **THEN** it maps the opaque choice back to the candidate ID and returns `recommended-snapshot`.

#### Scenario: Tied candidate choice
- **WHEN** another option has the same probability as the selected candidate in an otherwise valid response
- **THEN** the helper returns no ID and reason `ambiguous-response`.

<!-- id: agent.recommendExecutor.weak -->
<!-- entities: caller, candidate IDs, executor advice -->
<!-- enforced: src/agent/recommendExecutor.ts agent.recommendExecutor -->
<!-- test: src/agent/recommendExecutor.test.ts :: caller scope, explicit allowlist, opaque titles only and no side effects; low confidence and tied distributions abstain with usage -->

<!-- source: src/jev/decide.ts (Jev compatibility caller); source and test paths above -->
<!-- uncertainty: Provider availability and calibration are not established by the adapter and helper tests. -->
