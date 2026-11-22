# Agent subscriptions to external events

## Purpose
Describe how a declared producer's event reaches a subscribed agent conversation and what callers can infer from attachment, emission and delivery outcomes.

<!-- Last verified: 2026-11-22 at d35de7c21ff42cdbfb2db0272d6874d4db17a4e0 (source inspection) -->
<!-- uncertainty: The tests do not establish exactly-once transcript effects across crashes or cancellation during dispatch, or that the model consumed the trigger. -->
<!-- deferred: src/agent/attachments.ts (listing subscriptions) -->

## Requirements

### Requirement: Register a subscription
Attachment SHALL require a nonblank agent ID and source, a nonarchived agent and a declared source. If the declaration lists accepted event types, every requested type SHALL belong to that list.

#### Scenario: Valid registration
- **WHEN** an agent attaches to a declared source with valid event types
- **THEN** an active subscription is stored with its distinct nonempty event types, filter and optional prompt, the source is started if not already running, and the caller receives the attachment ID and trimmed source name

#### Scenario: Producer start throws
- **WHEN** registration succeeds but the producer's start callback throws
- **THEN** the start failure is logged and the caller still receives the stored attachment ID and source

#### Scenario: Unsupported type
- **WHEN** any requested type is missing from a nonempty declared type list
- **THEN** registration fails without creating a subscription

<!-- id: agent.attach.register -->
<!-- entities: agent, attachment, producer declaration -->
<!-- enforced: src/agent/attach.ts (agent.attach); src/agent/startAttachments.ts (agent.startAttachments) -->

### Requirement: Detach by owner and attachment ID
Detachment SHALL change only the named owner's active or paused attachment to detached, fail its pending or delivering records and return whether an attachment changed state.

#### Scenario: Last active subscriber leaves
- **WHEN** the owner detaches the last active subscription to a running producer
- **THEN** detachment returns true, the producer is signalled to stop, its stop callback is invoked if present, and a later event creates no delivery for that attachment

#### Scenario: No eligible attachment
- **WHEN** the ID belongs to another agent or the subscription is already detached
- **THEN** detachment returns false

<!-- id: agent.detach.owner-status -->
<!-- entities: attachment, producer, delivery -->
<!-- enforced: src/agent/detach.ts (agent.detach); src/agent/stopUnusedAttachments.ts (agent.stopUnusedAttachments) -->
<!-- test: src/agent/attachments.test.ts :: agent attachments > detach stops the last producer and prevents later delivery -->

### Requirement: Admit producer events once per source and event ID
Emission SHALL require nonblank trimmed source, event ID and event type, a declared source and a serialized payload of at most 65,536 UTF-16 code units. A previously recorded source and event ID SHALL yield no new deliveries.

#### Scenario: Duplicate emission
- **WHEN** the producer repeats an admitted event ID for the same source
- **THEN** the result is `{duplicate: true, deliveries: 0}` without matching subscriptions again

#### Scenario: Payload over the limit
- **WHEN** JSON serialization of the payload exceeds the limit
- **THEN** emission fails before recording the event

<!-- id: agent.emitAttachment.admit -->
<!-- kind: invariant -->
<!-- entities: source, event ID, event payload -->
<!-- enforced: src/agent/emitAttachment.ts (agent.emitAttachment) -->
<!-- test: src/agent/attachments.test.ts :: agent attachments > deduplicates producer events and wakes each matching agent once -->

### Requirement: Fan out by matching subscription
For a new event, emission SHALL create one pending delivery per matching active subscription to its source and return the count of new deliveries without waiting for dispatch to finish.

#### Scenario: Match type and payload together
- **WHEN** the subscription's event list is empty or includes the event type, and every filter entry matches the corresponding top-level payload field
- **THEN** the subscription qualifies; an empty filter matches all payloads, a defined scalar compares by string value, and an array accepts any element with the same string value as the field

#### Scenario: No eligible subscriber
- **WHEN** every subscription is inactive, belongs to another source, rejects the type or fails a filter entry
- **THEN** the event is recorded and emission returns `{duplicate: false, deliveries: 0}`

<!-- id: agent.emitAttachment.fan-out -->
<!-- entities: event, attachment, delivery -->
<!-- enforced: src/agent/emitAttachment.ts (agent.emitAttachment); src/agent/attachmentMatches.ts (agent.attachmentMatches) -->

### Requirement: Deliver claimed events to the owning conversation
Dispatch SHALL claim only pending deliveries for active attachments. Successful dispatch SHALL append a user trigger and a linked attachment event to the owning conversation and request worker processing.

#### Scenario: Successful dispatch
- **WHEN** dispatch processes a claimed delivery successfully
- **THEN** the cursor-excluded trigger contains the optional prompt followed by the source, event type, a warning to treat the content as untrusted data and the JSON payload
- **THEN** the `attachment_event` records the source, type, payload, message index, delivery ID and occurrence time; an unarchived agent keeps its existing next run time or becomes due now if none was set

#### Scenario: Delivery cannot be claimed
- **WHEN** no pending delivery with that ID belongs to an active attachment
- **THEN** dispatch returns `missing` without appending a message

#### Scenario: Append fails while the claim is held
- **WHEN** the session append throws and the delivery still has the dispatcher's claim token
- **THEN** dispatch records a failed attempt with up to 1,000 characters of error text, clears the claim and rethrows the error

<!-- id: agent.dispatchAttachment.claim -->
<!-- entities: delivery, agent conversation, attachment event -->
<!-- enforced: src/agent/dispatchAttachment.ts (agent.dispatchAttachment) -->
<!-- test: src/agent/attachments.test.ts :: agent attachments > deduplicates producer events and wakes each matching agent once -->
