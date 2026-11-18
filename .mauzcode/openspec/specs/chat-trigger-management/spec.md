# chat-trigger-management Specification

## Purpose
Let people create, run, check or cancel individual agent triggers from their chat without mistaking a scheduling request for a firing or acting on the wrong trigger.

## Requirements

### Requirement: Immediate action uses normal scheduling
Each expanded wake or cron row SHALL offer Run now; each watch row SHALL offer Check now. An accepted request SHALL make the active trigger due for normal processing, not bypass the engine, and SHALL NOT be reported as a firing. Checking or finished triggers SHALL NOT be scheduled a second time.

#### Scenario: Immediate wake or cron
- **WHEN** the user selects Run now on an active wake or cron
- **THEN** the UI reports the scheduling outcome, firing appears only after delivery, and normal one-shot completion or recurring cron scheduling is preserved.

#### Scenario: Immediate watch check
- **WHEN** a user requests a check and the watch condition is false
- **THEN** the normal watch check takes place without a firing or agent wake; another request while checking does not start a parallel evaluation.

### Requirement: Immediate action reports an explicit outcome
The run/check-now operation SHALL return exactly one outcome — `scheduled`, `deferred_paused` (made due while the recipient is paused; runs after resume), `already_checking` or `not_active` — and the UI and agent SHALL report it in plain language.

#### Scenario: Paused recipient
- **WHEN** the user selects Run now while the owning agent is paused
- **THEN** the trigger is made due, the response is `deferred_paused`, the UI says it is scheduled and will run after the agent resumes, and no firing is shown until actual delivery.

#### Scenario: Finished target
- **WHEN** the user selects Run now or Check now on a trigger that has already completed, timed out or been cancelled
- **THEN** the response is `not_active`, nothing is scheduled, and the panel refreshes.

### Requirement: Cancellation is scoped to one trigger
Each expanded row SHALL offer cancellation of that trigger alone, applied immediately without a separate confirmation step. The command path SHALL cancel only the exact resolved target. No bulk cancellation, schedule editor or creation form SHALL be added to the panel.

#### Scenario: Cancel from the panel
- **WHEN** the person cancels a still-active or checking trigger from its row
- **THEN** that trigger alone is cancelled, its group count updates and the chat shows the committed cancellation once.

#### Scenario: Stale target
- **WHEN** the selected trigger finished before the cancellation reached the server
- **THEN** no cancellation is applied; the response explains the no-op and refreshes the panel instead of selecting a substitute.

### Requirement: Discoverable conversational command
The chat SHALL support `/trigger` from the command catalogue and from typed input even with no armed triggers. An argument SHALL be handled as an ordinary human request to the current agent to create, run/check now, or cancel one trigger, not as trusted executable input. With no argument the agent SHALL ask which kind to add before creating anything.

#### Scenario: Empty command in an empty chat panel
- **WHEN** the person submits `/trigger` with no arguments
- **THEN** the agent asks whether to add a one-shot wake, a recurring schedule or a condition watch; asking creates no trigger.

#### Scenario: Sufficient creation request
- **WHEN** the user asks `/trigger in 20 minutes check the build` and creation is authorized
- **THEN** the agent uses the supplied timing and purpose without asking for them again, and reports creation only after the trigger operation succeeds.

#### Scenario: Run or cancel by description
- **WHEN** a request identifies one armed trigger and asks to run, check or cancel it
- **THEN** the command uses the same operation and outcomes as its row control and reports accepted versus completed work truthfully.

#### Scenario: Cancellation names its target
- **WHEN** `/trigger` resolves exactly one trigger and cancels it without a confirmation step
- **THEN** the agent's reply names the cancelled trigger by ID, kind and purpose, so the person can recreate it if the wrong one was chosen.

### Requirement: Clarify before acting on incomplete requests
The agent SHALL ask only for missing or ambiguous action, target, timing, time zone, condition or purpose. It SHALL offer a choice when several authorized triggers match and SHALL NOT substitute a different trigger when none match.

#### Scenario: Ambiguous time zone or target
- **WHEN** a recurring schedule lacks a determinable time zone, or an immediate action or cancellation matches multiple triggers
- **THEN** the agent asks for the missing time zone or presents the matching targets; no scheduler mutation occurs before resolution.

#### Scenario: No target or failed operation
- **WHEN** no trigger matches a cancellation request or the engine rejects creation
- **THEN** the agent states that no action was applied and does not report success or silently choose another operation.

### Requirement: Owner, capability and session boundaries
Chat reads and writes SHALL enforce current-agent ownership. Every trigger UI write — the new JSON action endpoint and the existing inspector form route — SHALL require a valid `x-csrf-token` checked with the existing CSRF verifier. Command and row actions SHALL respect the applicable preset grants, session state and planning mode. `/trigger` SHALL NOT change mode, dismiss a pending plan review, or grant privileges to its arguments.

#### Scenario: Planning session with a pending proposal
- **WHEN** a person submits `/trigger` in PLAN or attempts a mutating panel action in PLAN
- **THEN** clarification is allowed, but no trigger changes, the mode stays PLAN and any existing proposal remains pending.

#### Scenario: Unauthorized, foreign or ineligible request
- **WHEN** a client substitutes a foreign trigger ID, omits a valid CSRF token on a UI write (including the existing inspector form route), lacks an applicable grant, or attempts a write forbidden in the current session state
- **THEN** the server rejects it without revealing foreign trigger data, mutating state, or scheduling work.

### Requirement: Request replay cannot duplicate work
Chat commands SHALL deduplicate retries through the existing per-agent command request records. Mutating row and conversational trigger actions SHALL deduplicate through a per-agent trigger action request record keyed by request ID, storing the normalized action, target and result in the action's transaction. An identical retry SHALL NOT repeat a turn, creation or immediate action; a conflicting reuse SHALL be rejected. A lost race SHALL report the actual outcome.

#### Scenario: Lost acknowledgement
- **WHEN** an accepted command or row action is resent with the same request key after a lost response
- **THEN** its prior acceptance or outcome is returned without another side effect, even if the worker has already fired; reusing the key with different input is refused.

#### Scenario: Cancellation races delivery
- **WHEN** delivery and a cancellation compete for the same trigger
- **THEN** the committed lifecycle is reflected in the refreshed chat; a request that changed nothing reports that fact and emits no cancellation entry.
