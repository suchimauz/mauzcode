# Direct messages between agents

## Purpose
Describe who can exchange ordinary peer messages, how recipients identify the sender, and what a delivery receipt proves before and after compaction.

Last verified: 2026-11-22 at `d35de7c21ff42cdbfb2db0272d6874d4db17a4e0` by source inspection. Cited source and test files were clean; unrelated untracked specifications were present.

## Requirements

### Requirement: Direct addressing
A sender with an ID SHALL be able to address an unrelated visible agent by ID without sharing its owner. The send SHALL reject a blank target or body after trimming, self-addressing, and missing, archived or hidden targets.

#### Scenario: Different owners
- **WHEN** an agent sends nonblank text to an unrelated visible recipient and neither delivery limit is reached
- **THEN** the send accepts the recipient regardless of the owner difference.

#### Scenario: Hidden recipient
- **WHEN** the same recipient is hidden
- **THEN** the send fails before creating a receipt.

<!-- id: agent.message.target -->
<!-- entities: sender, recipient -->
<!-- enforced: src/agent/message.ts (default export, target and visibility checks) -->
<!-- test: src/agent/message.test.ts :: agent.message: allows unrelated visible agents and rejects hidden internals -->
<!-- test: src/agent/message.test.ts :: agent.message: rejects self, empty text and unknown targets -->

### Requirement: Sender provenance
Delivered peer input SHALL be a user-role `agent_message` authored by `agent:<sender ID>`, not by the sender's human owner. Its envelope SHALL identify the sender, title and hop and direct replies to the sender ID.

#### Scenario: Message sent on behalf of an owner
- **WHEN** a sender with a known owner sends a message
- **THEN** the recipient sees the trimmed body and reply guidance in the envelope, with the owner's name or fallback ID in the on-behalf-of attribute; the recipient event still identifies the agent as actor.

<!-- id: agent.message.attrs -->
<!-- kind: invariant -->
<!-- entities: sender, recipient, owner, envelope -->
<!-- enforced: src/agent/message.ts (attrs, content, event); src/session/deliverInbound.ts (default export, recipient message insert) -->
<!-- test: src/agent/message.test.ts :: agent.message: stored under the sender's name, envelope names whom to answer -->

### Requirement: Exchange limits
By default a send SHALL reject hops above 50 and reject a send if the recipient already has at least 30 message rows by that sender newer than ten minutes ago. Only boolean false in the sender's persisted `messageLimitsEnabled` setting SHALL bypass both checks.

#### Scenario: Reply chain
- **WHEN** the sender's latest cursor-included user row other than trigger or wake-up is an agent message carrying hop 50
- **THEN** the next send fails with a hop-limit error by default; with the persisted opt-out it carries hop 51 even if the live setting is stale.

#### Scenario: New conversation after human input
- **WHEN** the latest qualifying row is ordinary human input
- **THEN** the next hop is one, but the recipient-specific rate check still applies unless disabled.

<!-- id: agent.message.limitsEnabled -->
<!-- entities: sender, recipient, hop -->
<!-- enforced: src/agent/message.ts (prevHop, limitsEnabled, recent) -->
<!-- test: src/agent/message.test.ts :: agent.message: reply continues the hop counter and stops at the limit -->
<!-- test: src/agent/messageLimits.unit.test.ts :: enabled rate limit remains enforced -->
<!-- test: src/agent/messageLimits.unit.test.ts :: durable sender opt-out bypasses both limits even with stale live scratchpad -->

### Requirement: Pending versus delivered input
A send SHALL report the target and hop and distinguish a queued receipt with no message index from a delivered receipt with the recipient transcript index. A compaction draft SHALL defer transcript insertion until pending receipts can drain in sequence order.

#### Scenario: Queue during compaction
- **WHEN** two sends arrive while the recipient has a compaction draft revision
- **THEN** each returns queued rather than delivered, without a transcript index or delivery wake; draining after the draft clears appends both messages in receipt order.

<!-- id: session.deliverInbound.draftRevision -->
<!-- entities: recipient, receipt, transcript -->
<!-- enforced: src/session/deliverInbound.ts (sleep.draftRevision, receipt); src/agent/message.ts (out) -->
<!-- test: src/session/deliverInbound.unit.test.ts :: real inbound helper queues without transcript or wake, drains ordered once -->

### Requirement: Receipt identity and replay
An inbound delivery key SHALL identify one immutable serialized payload per recipient. Replay of a completed receipt SHALL return its original index without appending another message; reuse with different payload SHALL fail.

#### Scenario: Replay after transcript clearing
- **WHEN** the identical receipt is submitted after its delivered transcript row has been cleared
- **THEN** the original index is returned and the cleared message is not recreated. A fresh ordinary send generates a new key, even for identical text.

<!-- id: session.deliverInbound.prior -->
<!-- kind: invariant -->
<!-- entities: recipient, receipt, delivery key -->
<!-- enforced: src/session/deliverInbound.ts (prior, receipt); src/agent/message.ts (crypto.randomUUID) -->
<!-- test: src/session/deliverInbound.unit.test.ts :: parallel replays produce one delivery and durable receipt survives transcript clearing -->
<!-- test: src/session/deliverInbound.unit.test.ts :: same key with changed immutable payload rejects -->

### Requirement: Delivery without waking
Delivery SHALL request a recipient run by default without replacing an existing next-run time. Quiet sends, stopped recipients and recipients with paused todos SHALL retain delivered content without scheduling a new run for it.

#### Scenario: Quiet delivery
- **WHEN** an agent sends with `wake: false` and the receipt drains
- **THEN** the recipient gains the transcript message but its next-run time remains unchanged.

<!-- id: session.deliverInbound.next_run_at -->
<!-- entities: recipient, receipt -->
<!-- enforced: src/agent/message.ts (opts.wake); src/session/deliverInbound.ts (default export, next_run_at update) -->
<!-- test: src/session/deliverInbound.unit.test.ts :: stopped, paused and wake false persist without scheduling -->

### Requirement: Sender delivery evidence
Receipt completion SHALL atomically record the recipient message and event and a sender-side `agent_message_outgoing` event, not a sender transcript message. The sender event SHALL be deduplicated by sender, recipient and delivery key.

#### Scenario: Receipt completes
- **WHEN** a pending peer message drains successfully
- **THEN** the sender event records delivered status, recipient ID and title snapshot, body, hop, key, delivery time and recipient message index; no such event is created merely by queueing.

#### Scenario: Event write fails
- **WHEN** an event write fails and the drain transaction rolls back
- **THEN** no partial delivery commits and a previously queued receipt remains pending for replay.

<!-- id: session.projectOutgoingDelivery.prior -->
<!-- entities: sender, recipient, receipt, event -->
<!-- enforced: src/session/deliverInbound.ts (item.outgoing in transaction); src/session/projectOutgoingDelivery.ts (event, prior) -->
<!-- test: src/session/projectOutgoingDelivery.test.ts :: outgoing projection only writes events, with complete delivered metadata -->
<!-- test: src/session/projectOutgoingDelivery.test.ts :: outgoing projection lookup deduplicates per sender, recipient and delivery key -->
<!-- test: src/session/deliverInbound.unit.test.ts :: atomic rollback on event failure leaves replayable pending delivery -->

<!-- uncertainty: The cited provenance test checks agent attribution and reply routing, not owner-name fallback. Delivery status does not establish that the recipient read or answered the message. Tests were inspected, not run. -->
<!-- deferred: src/agent/ask.ts implements delegated follow-up rather than ordinary peer messaging; shared registry, human mentions and scheduling workflows are outside this baseline. -->
