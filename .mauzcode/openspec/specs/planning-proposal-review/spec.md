# Planning mode and proposal review

## Purpose

Record which plan a person reviewed and whether the session should implement it or continue planning, even when the chat is reopened.

## Requirements

### Requirement: Session planning state
The session SHALL report advisory planning state from its durable record, defaulting to execute mode, revision zero and no proposal when no record exists.

#### Scenario: Read before entering planning
- **WHEN** an authenticated client reads planning state for an existing session with no planning record
- **THEN** it receives execute mode, revision zero and a null proposal; the response includes a CSRF token and is marked `no-store`.

<!-- id: planning-read-default -->
<!-- kind: invariant -->
<!-- entities: session, planning state -->
<!-- enforced: src/planning/read.ts (planning.read); src/planning/http.ts (planning.http GET) -->

### Requirement: Agent entry into planning
An agent SHALL be able to enter plan mode for its own non-archived session during a run without scheduling work. Entry from execute advances the revision and clears the proposal; repeated entry preserves both.

#### Scenario: Re-enter with a pending proposal
- **WHEN** the agent enters planning again while awaiting review
- **THEN** it receives the same revision and pending proposal.

<!-- id: planning-enter-mode -->
<!-- entities: session, proposal -->
<!-- enforced: src/planning/enter.ts (planning.enter) -->
<!-- test: src/planning/planning.unit.test.ts:134 -->

### Requirement: Fork without review authority
A new fork SHALL inherit plan mode from a planning parent but not its proposal or revision history.

#### Scenario: Fork while review is pending
- **WHEN** a new child is forked from a session with a pending proposal
- **THEN** the child starts in plan mode at revision one with no proposal to approve.

<!-- id: planning-inherit-plan -->
<!-- entities: parent session, child session -->
<!-- enforced: src/planning/inherit.ts (planning.inherit); src/session/fork.ts:69 -->
<!-- test: src/planning/planning.unit.test.ts:124 -->

### Requirement: Exact pending plan
The system SHALL accept a proposal only for the current non-archived session in plan mode, with 1–50,000 UTF-16 code units after trimming surrounding whitespace. It SHALL bind the trimmed text to a proposal ID and revision for review.

#### Scenario: Repeat identical pending text
- **WHEN** a submitted plan matches the pending plan after trimming
- **THEN** its proposal ID and revision stay unchanged and no second review card is created.

#### Scenario: Revise the text
- **WHEN** a different valid plan replaces a pending proposal
- **THEN** the old open review is cancelled and a new pending review carries the revised text, a new ID and the next revision.

<!-- id: planning-propose-pending -->
<!-- entities: plan text, proposal, review card -->
<!-- enforced: src/planning/propose.ts (planning.propose) -->
<!-- test: src/planning/planning.unit.test.ts:105 -->

### Requirement: Human review request
Review SHALL require the current human HTTP request, a principal, a valid CSRF token, an `approve` or `keep` decision and an integer expected revision.

#### Scenario: Invalid token
- **WHEN** a review request carries an invalid CSRF token
- **THEN** review returns HTTP 403 with `invalid_csrf` without applying the decision.

<!-- id: planning-review-request -->
<!-- entities: request, decision -->
<!-- enforced: src/planning/review.ts (planning.review request checks) -->
<!-- test: src/planning/planning.unit.test.ts:124 -->

### Requirement: Stale and duplicate decisions
For a valid request, review SHALL reject a missing or mismatched proposal with `409 stale_proposal`. For the current ID it SHALL acknowledge an already applied identical decision before checking revision; otherwise it requires a pending proposal in plan mode at the expected revision.

#### Scenario: Retry after the first decision advanced the revision
- **WHEN** the client repeats the same decision for the current proposal using its original revision
- **THEN** review reports duplicate success without scheduling or delivering the result again.

#### Scenario: Obsolete review
- **WHEN** the client reviews a replaced ID, submits an obsolete revision for a pending proposal, or reverses an already applied decision
- **THEN** review returns `409 stale_proposal` without changing the current state.

<!-- id: planning-review-stale-proposal -->
<!-- entities: proposal ID, revision, decision -->
<!-- enforced: src/planning/review.ts (planning.review target and stale_proposal branches) -->
<!-- test: src/planning/planning.unit.test.ts:111; src/planning/planning.unit.test.ts:118 -->

### Requirement: Review availability
A fresh decision SHALL be rejected for an archived session or one with running, claimed, locally active or streaming work. Queued work SHALL prevent review unless the session has a durable input wait.

#### Scenario: Active run despite pending review
- **WHEN** the session is running and the person approves its current pending plan
- **THEN** review returns `409 agent_running` and leaves the proposal pending.

<!-- id: planning-assert-idle-review -->
<!-- entities: session, pending proposal -->
<!-- enforced: src/planning/assertIdle.ts (planning.assertIdle); src/planning/review.ts (planning.review) -->
<!-- test: src/planning/planning.unit.test.ts:162; src/planning/planning.unit.test.ts:181 -->

### Requirement: Apply the reviewed decision
Successful first review SHALL advance the revision once and complete the review with the decision, proposal ID and stored text. Approval switches to execute; keeping the plan leaves the session in plan mode. Success does not guarantee that another run is scheduled.

#### Scenario: Approve the stored plan
- **WHEN** the person approves the current open review at the displayed revision and the session allows review
- **THEN** the proposal becomes approved and the agent receives the exact stored plan with instructions to implement it without waiving separate action confirmations.

#### Scenario: Keep planning
- **WHEN** the person chooses keep on the current review and the decision succeeds
- **THEN** the proposal becomes kept and the agent receives instructions to continue planning rather than implement it.

<!-- id: planning-review-complete -->
<!-- entities: session mode, proposal, decision result -->
<!-- enforced: src/planning/review.ts (planning.review completion transaction) -->
<!-- test: src/planning/planning.unit.test.ts:111; src/planning/planning.unit.test.ts:118; src/planning/planning.unit.test.ts:171 -->

<!-- Last verified: 2026-11-22, source commit d35de7c21ff42cdbfb2db0272d6874d4db17a4e0; static inspection only. -->
<!-- uncertainty: Named tests were inspected, not executed. Database concurrency and browser-to-server integration were not exercised. -->
<!-- deferred: src/planning/publish.ts (notification delivery); generic input lifecycle and UI layout are outside this specification. -->

### Requirement: Stable collaboration guidance across compaction

When preparing a normal session request, the system SHALL use the latest collaboration guidance visible in the effective history for that request. If the current guidance is missing or outdated, the system SHALL persist it once at a safe transcript boundary so that unchanged guidance remains in the shared prefix of subsequent requests. Read-only previews SHALL NOT append transcript rows.

#### Scenario: A checkpoint drops the instruction
- **WHEN** compaction removes the last visible current-mode instruction but the original history still contains it
- **THEN** the next safe request restores the current instruction to durable history, and a subsequent request extends that prefix without another copy at the end

#### Scenario: Existing instruction is still visible
- **WHEN** the active checkpoint and retained tail, or full history selected by fallback, already expose the latest current instruction
- **THEN** preparing the request does not append another instruction

#### Scenario: Unsafe tool boundary or read-only preview
- **WHEN** the latest assistant tool call is awaiting its results, or a request is only being previewed
- **THEN** no collaboration instruction is written to the transcript during that operation
