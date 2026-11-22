# Pending human turns in chat

## Purpose
Describe how a human can leave a turn for later, revise or withdraw it, or deliver it to a running agent without sending the current draft.

Last verified: 2026-11-22 at `d35de7c21ff42cdbfb2db0272d6874d4db17a4e0` by source inspection. The cited source files were clean.

## Requirements

### Requirement: Read pending work
The queue SHALL list only the selected agent's pending turns in ascending sequence order and report whether the agent is waiting for input.

#### Scenario: Inspect attachments during a wait
- **WHEN** an authenticated caller reads a waiting agent's queue containing a pending attachment
- **THEN** the response reports `waitingForInput: true` and includes the attachment name, type and size without its contents.

<!-- id: queue-request-get -->
<!-- entities: agent, pending turn, attachment -->
<!-- enforced: src/agent/queueRequest.ts default export, GET branch -->
<!-- test: src/agent/queueRequest.test.ts :: queue GET exposes authoritative durable input wait (wait flag and empty list) -->

### Requirement: Enqueue by request identity
The queue SHALL accept trimmed text, attachments, or both under an agent-specific request key, initially at version 1, without accepting the turn as a chat message yet.

#### Scenario: Retry an enqueue
- **WHEN** the same agent receives a second enqueue with the same key, normalized text and identical ordered attachments
- **THEN** it returns the original item ID, current version and `duplicate: true`; different content under that key returns HTTP 409 instead.

#### Scenario: Reject an empty turn
- **WHEN** a submission contains only whitespace and no file
- **THEN** the queue returns HTTP 400 without adding an item.

<!-- id: queue-request-post -->
<!-- entities: request key, pending turn -->
<!-- enforced: src/agent/queueRequest.ts default export, POST fingerprint and prior branches -->
<!-- test: src/agent/queueRequest.test.ts :: queue POST during input wait retains bytes idempotently without scheduling (matching retry) -->

### Requirement: Respect stop and input waits
Enqueueing SHALL retain the turn without scheduling an idle agent that is stopped or waiting for input.

#### Scenario: Queue while stopped
- **WHEN** an idle stopped agent receives a valid queue submission without an input wait
- **THEN** the item is accepted without clearing the stop or setting a next run time.

<!-- id: queue-request-post-schedule -->
<!-- entities: agent, pending turn -->
<!-- enforced: src/agent/queueRequest.ts default export, locked.run_state scheduling branch -->
<!-- test: src/agent/queueRequest.test.ts :: queue POST preserves Stop even without an input gate -->
<!-- test: src/agent/queueRequest.test.ts :: queue POST during input wait retains bytes idempotently without scheduling -->

### Requirement: Edit or withdraw a pending revision
A successful edit or removal SHALL require the current pending revision and return its version plus one.

#### Scenario: Edit text without changing files
- **WHEN** a caller edits the current revision
- **THEN** the queue stores trimmed replacement text and preserves the attachments; if neither text nor attachments would remain, it rejects the edit with HTTP 409 instead.

#### Scenario: Remove and retry
- **WHEN** a caller removes the current revision and retries removal with that version
- **THEN** the item disappears from the pending list and the retry returns HTTP 409.

<!-- id: queue-request-pending-version -->
<!-- entities: pending turn, revision -->
<!-- enforced: src/agent/queueRequest.ts default export, PATCH and DELETE under queue row lock -->

### Requirement: Steer a selected turn
Explicit steering SHALL deliver the selected current pending revision through message acceptance, without requiring it to be first, only while the agent is running, not stopped and not waiting for input.

#### Scenario: Deliver the second item
- **WHEN** steering of the second pending item succeeds
- **THEN** its text and attachments become a human turn, it leaves the pending list, and the first item remains pending.

#### Scenario: Input wait prevents steering
- **WHEN** a caller steers a pending revision while durable input is outstanding
- **THEN** the request returns HTTP 409 with `input_waiting` and leaves the item pending.

<!-- id: accept-message-queue-explicit -->
<!-- entities: agent, pending turn, revision -->
<!-- enforced: src/agent/promoteQueuedTurn.ts default export; src/agent/acceptMessage.ts default export, opts.queue checks and promoted update -->

### Requirement: Promote in sequence automatically
An automatic promotion attempt SHALL select at most the oldest pending turn and defer it if an accepted human message still awaits processing.

#### Scenario: Accepted work takes precedence
- **WHEN** automatic promotion finds a non-excluded user message beyond the processed cursor
- **THEN** the oldest queued turn remains pending and no later item is promoted in its place.

<!-- id: accept-message-queue-first -->
<!-- entities: agent, pending turn, processed cursor -->
<!-- enforced: src/agent/run.ts:123; src/agent/promoteQueuedTurn.ts default export; src/agent/acceptMessage.ts default export, pending and first checks -->

<!-- uncertainty: The inspected worker and instant-steering tests exercise ordinary accepted messages, not end-to-end promotion or stale mutations of pending queue rows. Tests were not run. -->
<!-- deferred: frontend/src/lib/queue.ts (client transport); worker recovery and model retries are outside this capability. -->
