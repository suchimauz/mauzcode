## Purpose

Let people see which triggers are still armed in the open chat and distinguish their actual lifecycle events from routine scheduler activity.

## ADDED Requirements

### Requirement: Armed counts by kind
The chat SHALL show a collapsed panel above the composer with positive counts of the open agent's active and checking triggers in wake, cron, watch order. It SHALL count definitions, not executions, hide zero groups, and hide the entire panel when empty.

#### Scenario: Mixed kinds on a narrow screen
- **WHEN** two one-shot wakes, one recurring cron with prior runs, and three watches (one currently checking) are armed
- **THEN** all three kind labels and the counts 2, 1 and 3 are readable without expanding, including on a narrow screen.

#### Scenario: Only watches remain
- **WHEN** a watch is the only armed trigger
- **THEN** the collapsed panel shows only the watch label and count 1; after its final removal the panel occupies no space.

### Requirement: Expanded schedule details
The panel SHALL be keyboard-expandable and list armed triggers nearest due first with their kind, short purpose and next action time. The purpose SHALL be derived at read time from the first non-empty line of the trigger prompt, whitespace-collapsed and truncated to 120 characters with an ellipsis; no separate purpose is stored. Cron rows SHALL include the expression and time zone; watch rows SHALL label their time as the next check, not a guaranteed firing.

#### Scenario: Compare a watch and a recurring schedule
- **WHEN** the user expands the panel by keyboard beside an existing todo dock and a watch is due before a cron
- **THEN** the watch check appears first, the cron row identifies its schedule and time zone, and the todo dock remains independently usable.

### Requirement: Current and private panel data
The counts and rows SHALL reflect the same complete, authorized active selection, independent of recent audit limits. The panel SHALL refresh on open, relevant changes and reconnection and discard old chat data on navigation. Its data SHALL exclude raw predicate configuration, SQL, HTTP parameters, function arguments and predicate results.

#### Scenario: An old trigger is still armed
- **WHEN** one armed trigger predates more than 100 finished triggers
- **THEN** the panel still counts and lists it without exposing raw predicate inputs or results.

#### Scenario: Missed update or late response
- **WHEN** the client reconnects after a cancellation, or a read for the previous chat returns after navigation
- **THEN** the displayed counts and rows reflect the current chat's authorized state, without restoring old or foreign rows.

### Requirement: Meaningful lifecycle entries
The transcript SHALL show committed creation, delivered firing, manual or automatic cancellation and expiry. Each entry SHALL identify the kind and transition as system activity, not as human input. Polls, rearming, coalesced ticks and retryable errors SHALL NOT generate lifecycle rows. Retried predicate errors SHALL NOT produce failure entries.

#### Scenario: Trigger created and later cancelled by task completion
- **WHEN** a task creates a bound trigger and later finishes without a delivery
- **THEN** creation and automatic cancellation appear in order in the owning chat, and no firing is claimed.

#### Scenario: Repeated cron or edge watch
- **WHEN** a recurring timer or edge watch delivers, then has repeated polls, coalesced ticks or retryable errors
- **THEN** each distinct delivered firing appears once through its existing firing entry; intervening scheduler activity produces no visible row.

#### Scenario: Error classification
- **WHEN** a check fails but is scheduled for another attempt
- **THEN** no entry appears in the chat and no failure is reported; no retry cutoff is introduced.

### Requirement: No duplicate creation entry for visible tool calls
Each trigger SHALL record its creating agent and, when created during a tool call, that tool call's ID (for code-evaluation tools, the enclosing evaluation call). Creation SHALL skip the separate entry only when the creating agent owns the trigger and the recorded tool call is in its chat; that tool card SHALL carry a "trigger created" badge instead. When one agent creates a trigger for another, the creator's tool card gets the badge and the owner's chat gets one creation entry.

#### Scenario: Creation by a visible tool call
- **WHEN** the agent creates its own trigger through a tool call, directly or inside a code evaluation, shown in the same chat
- **THEN** no separate creation entry appears; that tool card shows a "trigger created" badge, while creation from the form, task cleanup or without a recorded tool call still adds one entry.

#### Scenario: Creation for another agent
- **WHEN** agent A creates a trigger owned by agent B
- **THEN** A's tool card shows the badge and B's chat shows one creation entry naming A as the creator.

### Requirement: One durable entry per committed transition
The transcript SHALL preserve lifecycle entries across reloads, without duplicating delivered firing or timeout entries, adding model messages for display, or reconstructing old history from mutable trigger state. Failed or rolled-back transitions SHALL NOT appear.

#### Scenario: Watch timeout with or without delivery
- **WHEN** a watch expires and its timeout prompt is delivered
- **THEN** its delivered timeout is shown once, not as both a firing and an expiry.
- **WHEN** another watch expires silently
- **THEN** one expiry entry appears without waking its agent or adding a model message.

#### Scenario: Timeout prompt coalesced with an earlier firing
- **WHEN** an edge watch expires with a timeout prompt but an earlier firing is still pending and no timeout delivery is committed
- **THEN** the earlier firing remains unchanged and one expiry entry is visible before and after reload, with no new wake or model message.

#### Scenario: Retry, rollback and historical entries
- **WHEN** a committed transition is retried, another mutation rolls back, and the conversation is reopened
- **THEN** the committed entry appears only once, the rolled-back one is absent, and older firing entries retain their original details.
