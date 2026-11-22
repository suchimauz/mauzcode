# Observed goals in a chat

## Purpose
Describe how a chat opts into a display-only goal preview and which observer may replace that preview after a user message.

## Requirements

### Requirement: Per-chat tracking switch
The tracking switch SHALL persist only for the selected chat and refresh its goal metadata without clearing its preview.

#### Scenario: Submit the tracking form
- **WHEN** the form supplies `enabled=1` for an existing chat
- **THEN** the switch is on after reload and the response is 204; any other value or a missing field switches tracking off on a successful submission.

#### Scenario: Unknown chat
- **WHEN** the setter cannot find the requested agent
- **THEN** the form handler returns 400 with the setter's error message.

<!-- id: set-goal-tracking-enabled -->
<!-- entities: chat, tracking switch -->
<!-- enforced: src/agent/setGoalTracking.ts#default; src/agent/$route_$id_goal-tracking_POST.ts#default -->
<!-- test: src/agent/setGoalTracking.test.ts::persists an opt-in flag per agent -->

### Requirement: Independent observation of accepted text
At post-commit notification, message acceptance SHALL dispatch the available observer without waiting for its result only if the message has text and the chat's switch is true.

#### Scenario: Tracking is unset or off
- **WHEN** text is accepted without an explicit opt-in
- **THEN** the acceptance path starts no goal observer.

#### Scenario: Observe an opted-in message
- **WHEN** the observer receives nonblank text from the acceptance path
- **THEN** it runs in a hidden fork of the chat with the parent's sleep context and the committed message index; on finalization it attempts to archive the fork.

#### Scenario: Blank observation request
- **WHEN** the observer is called directly with whitespace-only text
- **THEN** it returns up to the first 20 previous goals and an empty sidecar ID without forking.

<!-- id: accept-message-goal-tracking-enabled -->
<!-- entities: user message, parent chat, observer fork -->
<!-- enforced: src/agent/acceptMessage.ts#default; src/agent/updateGoalSidecar.ts#default -->
<!-- test: src/agent/updateGoalSidecar.test.ts::forks a hidden observer that reports goals through agent.setObservedGoals -->

### Requirement: Parent-bound display update
An accepted observer report SHALL replace only its own parent's goal preview, mark it ready, and refresh goal metadata without changing the parent's execution goal or appending the report to its transcript.

#### Scenario: Caller is not the parent's observer
- **WHEN** the caller lacks an agent or parent ID, or its observer marker does not match its parent ID
- **THEN** the report is rejected before the parent preview is updated.

#### Scenario: Normalize a replacement list
- **WHEN** an eligible observer submits a replacement list
- **THEN** only the first 20 entries are considered; blank statements are discarded, statements and verification text are trimmed and capped at 1000 characters, and unrecognized statuses become `candidate`.

#### Scenario: No goals remain
- **WHEN** an accepted report contains an empty list
- **THEN** the ready preview contains no goals and records the reporting fork and triggering message index.

<!-- id: set-observed-goals-parent-preview -->
<!-- entities: observer report, parent chat, goal preview -->
<!-- enforced: src/agent/setObservedGoals.ts#default -->
<!-- test: src/agent/updateGoalSidecar.test.ts::setObservedGoals refuses callers that are not a goal sidecar of the parent; src/agent/updateGoalSidecar.test.ts::forks a hidden observer that reports goals through agent.setObservedGoals -->

### Requirement: Order competing reports by triggering message
The report handler SHALL return the stored goals without replacing a newer preview or another identified observer's ready preview for the same message.

#### Scenario: Older message finishes late
- **WHEN** the stored message index exceeds the reporting observer's index
- **THEN** the stored preview remains unchanged and the handler sends no goal refresh.

#### Scenario: Same message reported twice
- **WHEN** an identified observer has already published a ready preview for the same index
- **THEN** another fork's report is ignored, but the original fork can replace its own answer.

<!-- id: set-observed-goals-stale-duplicate -->
<!-- entities: message index, observer fork, stored preview -->
<!-- enforced: src/agent/setObservedGoals.ts#default -->
<!-- test: src/agent/updateGoalSidecar.test.ts::setObservedGoals refuses a stale writer for an older message -->

### Requirement: Preserve reported goals at finalization
Finalization SHALL preserve the current goals when extraction fails and distinguish a missing report from a ready answer.

#### Scenario: Prose instead of a report
- **WHEN** a fork returns prose without reporting and no newer or same-index ready result protects the preview
- **THEN** the preview keeps its goals and records an error instead of treating prose as a goal list.

#### Scenario: Failure after reporting
- **WHEN** a follow-up turn fails after this fork has published a ready answer for this index
- **THEN** its preview stays ready without a new error; finalization also leaves a newer preview or a different fork's same-index ready answer unchanged.

<!-- id: update-goal-sidecar-finish -->
<!-- entities: observer run, ready preview, extraction error -->
<!-- enforced: src/agent/updateGoalSidecar.ts#finish -->
<!-- test: src/agent/updateGoalSidecar.test.ts::marks an error and keeps the previous preview when the sidecar answers in prose; src/agent/updateGoalSidecar.test.ts::a ready result written by this sidecar survives a failing follow-up turn -->

<!-- Last verified: 2026-11-22 at d35de7c2; source and test paths are listed per requirement. -->
<!-- uncertainty: Tests were inspected, not run. The HTTP responses, blank input, normalization limits and equal-index branches are based on implementation inspection. Archive failure is tolerated. -->
<!-- deferred: src/session/fork.ts; src/session/archive.ts (session storage and archival mechanics). -->
