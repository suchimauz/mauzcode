# Persistent agent goal lifecycle

## Purpose
Describe how an agent's explicit goal survives runs, how work is charged to it, and when the worker may continue without another human message.

## Requirements

### Requirement: Root mutation authority
Native goal creation and status updates SHALL require an enabled feature, a captured root invocation belonging to the owner, and a postcommit handoff.

#### Scenario: Descendant attempts to pause its owner's goal
- **WHEN** a descendant invokes the native update tool with `paused`
- **THEN** the tool rejects the request before mutation.

#### Scenario: Publication fails after persistence
- **WHEN** the mutation commits but the handoff fails
- **THEN** the tool reports the committed state and instructs the caller not to retry the mutation.

<!-- id: goal-tool-create-root-handoff -->
<!-- entities: root invocation, goal owner -->
<!-- enforced: src/goal/toolCreate.ts#default; src/goal/toolUpdate.ts#default -->
<!-- test: src/goal/toolAdapters.unit.test.ts::unscoped, descendant, sidecar and mismatched owner writes fail closed; src/goal/toolAdapters.unit.test.ts::postcommit handoff failure reports committed state and preserves cause -->

### Requirement: Conditional persistent mutations
The system SHALL check the expected goal identity and revision before changing the owner's persistent goal and record an audit event for a committed change.

#### Scenario: Stale writer
- **WHEN** the owner has a different goal or a newer revision than the writer observed
- **THEN** the change fails without an additional transition event.

<!-- id: goal-transition-expected-revision -->
<!-- kind: invariant -->
<!-- entities: goal identity, revision, transition event -->
<!-- enforced: src/goal/transition.ts#default; src/goal/persistTx.ts#default -->
<!-- test: src/goal/core.test.ts::revision conflicts produce no extra audit -->

### Requirement: Fresh explicit objective
Model creation SHALL start an active goal only when no goal exists or the previous goal is complete. It SHALL trim the objective, require 1–4000 Unicode code points, and enforce the host token cap when present.

#### Scenario: Replace a completed goal without specifying a budget
- **WHEN** creation succeeds with a finite host cap and no requested budget
- **THEN** the new goal inherits that cap, has a fresh identity at revision one, and starts with zero tokens and zero elapsed seconds.

#### Scenario: Requested budget exceeds the cap
- **WHEN** the model requests a budget larger than the finite host cap
- **THEN** creation fails rather than silently reducing the budget.

<!-- id: goal-transition-create -->
<!-- entities: objective, token budget, goal identity -->
<!-- enforced: src/goal/transition.ts#default; src/goal/toolCreate.ts#default -->
<!-- test: src/goal/core.test.ts::model inherited and oversized host cap; src/goal/core.test.ts::replacement resets usage and identity only for complete -->

### Requirement: Edit and resume an existing goal
An edit SHALL retain identity and accumulated usage, advance the revision, and prevent activation against an exhausted budget. Native model updates SHALL accept only complete, paused, or blocked.

#### Scenario: Resume without increasing the exhausted budget
- **WHEN** an external edit requests active status with a finite budget no greater than usage
- **THEN** the goal remains budget_limited; explicitly resuming with a budget above usage or no cap permits activation.

#### Scenario: Stop work after budget exhaustion
- **WHEN** the model requests paused or blocked on a budget_limited goal
- **THEN** the status stays budget_limited, whereas a complete update can mark it complete.

<!-- id: goal-transition-existing-status -->
<!-- entities: status, token budget, usage -->
<!-- enforced: src/goal/transition.ts#default; src/goal/toolUpdate.ts#default -->
<!-- test: src/goal/core.test.ts::resume cannot reset exhausted cap; src/goal/core.test.ts::external raised/null budget and explicit resume; src/goal/core.test.ts::complete overrides budget -->

### Requirement: Charge cumulative usage once
Accounting SHALL subtract the cached-input delta from the input delta, add only positive output growth using signed saturating 64-bit arithmetic, and charge no negative increment. An accepted replay of a checkpoint SHALL NOT charge again.

#### Scenario: Soft budget exceeded
- **WHEN** a new checkpoint brings an active goal's token total above its finite budget
- **THEN** the full increment is retained and the goal becomes budget_limited; replaying the accepted checkpoint reports a duplicate rather than another budget transition.

#### Scenario: Descendant work
- **WHEN** an authorized descendant checkpoint charges its owner's goal
- **THEN** its token increment counts but it adds no elapsed seconds.

<!-- id: goal-accounting-checkpoint-tx-increment -->
<!-- entities: checkpoint, source agent, usage, budget -->
<!-- enforced: src/goal/accountingDelta.ts#default; src/goal/accountingCheckpointTx.ts#default -->
<!-- test: src/goal/accounting.test.ts::signed saturation and final-only clamp; src/goal/accounting.test.ts::checkpoint soft overshoot, dedupe, fractional baseline, CAS retry; src/goal/accounting.test.ts::idle-root descendants charge once, never elapsed, and lock root before source -->

### Requirement: Admit an internal continuation
Worker finalization SHALL admit at most one continuation per owner, goal identity and run token, only for the matching live running owner and active goal revision with budget remaining or no cap.

#### Scenario: Eligible continuation
- **WHEN** admission succeeds in the finalize transaction
- **THEN** a cursor- and model-visible user-role message beyond the consumed cursor identifies itself as an internal continuation, not new human authorization, and its index is recorded.

#### Scenario: Other work takes precedence
- **WHEN** the goal is deferred, the owner has an open input or unconsumed cursor-visible user message, or native goal capability is unavailable
- **THEN** admission does not append a continuation.

<!-- id: goal-continuation-admit-guards -->
<!-- entities: goal, run token, consumed cursor, continuation receipt -->
<!-- enforced: src/goal/continuationAdmit.ts#default; src/agent/workerLoop.ts#default -->
<!-- test: src/goal/continuation.test.ts::one durable receipt, real runnable user message, no scheduler mutation -->

### Requirement: Goal snapshot visibility
The HTTP snapshot SHALL return a non-cacheable feature-disabled response without goal data when disabled and require successful authorization before returning an enabled goal snapshot.

#### Scenario: Feature disabled
- **WHEN** the feature is off at entry
- **THEN** the response contains only version 1 and enabled false, with Cache-Control set to no-store.

<!-- id: goal-surface-read-enabled -->
<!-- entities: HTTP snapshot, goal owner -->
<!-- enforced: src/goal/surfaceRead.ts#default -->

<!-- Last verified: 2026-11-22 at d35de7c21ff42cdbfb2db0272d6874d4db17a4e0; source and test paths are listed per requirement. -->
<!-- deferred: src/goal/lifecyclePause.ts; src/goal/surfaceAuthorize.ts; src/goal/accountingElapsed.ts -->
<!-- uncertainty: Test references were inspected, not executed. The HTTP response scenario is based on the adapter implementation. -->
