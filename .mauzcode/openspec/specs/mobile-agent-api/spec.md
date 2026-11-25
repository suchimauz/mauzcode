# Mobile chat list and history API

## Purpose
Describe the chat summaries, history pages, prompt anchors, tool details and read receipts returned to clients without requiring them to interpret stored events.

<!-- last_verified: 2026-11-22 at d35de7c2; inspected sources and tests clean; static inspection only -->
<!-- callers: frontend/src/lib/mauzcode.ts; frontend/src/hooks/useChatOutline.ts -->

## Requirements

### Requirement: Navigation list
The list SHALL return version 1 and an agents array in session-list order, with per-agent pin state and unread mention count.

#### Scenario: Chat with no mentions
- **WHEN** a listed chat has no entry in the unread mention counts
- **THEN** its mentions count is zero; its row includes id, title, model, runState, unread, turns, updatedAt, workspaceDir, pinned, delegated and visibility.

<!-- id: api.v1-agents-get.agents-map -->
<!-- entities: agent, pin, mention -->
<!-- enforced: src/api/$route_v1_agents_GET.ts:6 -->
<!-- test: src/api/$route_v1_agents_GET.test.ts :: returns nav agents with visibility in a stable native-client envelope -->

### Requirement: Event page selection and cursors
The events endpoint SHALL open at the newest page by default, prefer before over after, and report nextAfter as the chat's maximum event index plus one, even if filtering hides the entire page.

#### Scenario: Open or page through a chat
- **WHEN** the client omits both cursors
- **THEN** the page ends at the current tail, with a default limit of 80; integer limits above 200 become 200, negative limits become 1, and zero uses the default.

#### Scenario: Read older events
- **WHEN** a request supplies both cursors and the selected raw page is nonempty
- **THEN** selection goes backwards from before; olderBefore is the first raw index and hasOlder indicates whether that index exceeds zero.

#### Scenario: Unknown chat
- **WHEN** the requested agent does not exist
- **THEN** the endpoint returns HTTP 404 with error `not_found`.

<!-- id: api.v1-agent-events-get.beforeRaw -->
<!-- entities: event page, cursor, agent -->
<!-- enforced: src/api/$route_v1_agents_$id_events_GET.ts:18,26,314 -->
<!-- test: src/api/$route_v1_agents_$id_events_GET.test.ts :: returns lifecycle and mobile fields and initially requests the newest page -->
<!-- test: src/api/$route_v1_agents_$id_events_GET.test.ts :: keeps absent retry failure status nullable and hides marker-only pages -->

### Requirement: Input history projection
The event page SHALL include input rows only for supported history kinds with string input IDs, without including form HTML or text in those rows.

#### Scenario: Public and private forms in one page
- **WHEN** a batch input with a string ID and a private plugin input without a history hook occur together
- **THEN** the batch row carries its ID and kind with null html and text, and the private row is absent.

<!-- id: api.v1-agent-events-get.historyKind -->
<!-- entities: input, event page -->
<!-- enforced: src/api/$route_v1_agents_$id_events_GET.ts#historyKind -->
<!-- test: src/api/$route_v1_agents_$id_events_GET.test.ts :: projects actual batch choice event identities but never private forms or input HTML -->

### Requirement: Active tool output preview
An event page SHALL include at most the last 4096 string units of each active tool's retained output alongside the offsets of the full retained output.

#### Scenario: Long output while stopping
- **WHEN** an aborted tool is still listed and its retained output exceeds 4096 units
- **THEN** its state is `stopping`, its tail contains the final 4096 units, and outputEnd equals outputStart plus the retained output length.

<!-- id: api.v1-agent-events-get.activeTools -->
<!-- entities: event page, active tool -->
<!-- enforced: src/api/$route_v1_agents_$id_events_GET.ts:322-329 -->

### Requirement: Expanded tool detail
The indexed event endpoint SHALL return details only for tool calls and results, using the redacted presentation of object arguments without a length cap and bounding the result separately.

#### Scenario: Large result
- **WHEN** the result text exceeds 120000 string units
- **THEN** the version 1 event contains the first 120000 units and resultTruncated is true.

#### Scenario: Invalid selection
- **WHEN** the index is negative or nonintegral, the indexed row is missing, or its payload is not a tool call or result
- **THEN** the respective responses are 400 `invalid_event`, 404 `not_found`, and 400 `not_a_tool`.

<!-- id: api.v1-agent-event-get.truncate -->
<!-- entities: tool call, tool result, event index -->
<!-- enforced: src/api/$route_v1_agents_$id_events_$idx_GET.ts:9-35 -->
<!-- test: src/api/$route_v1_agents_$id_events_$idx_GET.test.ts :: mobile tool detail bounds large results -->

### Requirement: Human prompt outline
The outline SHALL return up to 1000 linked human user-message anchors in ascending event-index order after an exclusive cursor, with prompts limited to 500 characters.

#### Scenario: Continue outline navigation
- **WHEN** more matching prompts remain after this page
- **THEN** nextAfter is the last returned index; on the final page it is null. Agent-authored messages and agent-message, team-update, input-result and canvas-ping envelope prefixes do not provide anchors.

#### Scenario: Outline request boundaries
- **WHEN** an existing chat is requested without a cursor
- **THEN** selection starts after -1 and the successful response specifies `Cache-Control: no-store`; a supplied cursor that does not convert to a safe integer at least -1 yields 400 `invalid_cursor`, and an unknown chat yields 404 `not_found` before cursor validation.

<!-- id: api.chatOutline.items -->
<!-- entities: prompt, outline, cursor -->
<!-- enforced: src/api/chatOutline.ts:23-27; src/api/$route_v1_agents_$id_outline_GET.ts:7-12 -->
<!-- test: src/api/chatOutline.test.ts :: outline bounds prompts and joins durable human provenance -->
<!-- test: src/api/chatOutline.test.ts :: outline route rejects invalid cursors and missing agents -->

### Requirement: Read receipt boundary
The read endpoint SHALL accept a blank body for read-through-latest or a JSON object with a finite nonnegative numeric throughTs for a bounded receipt, and return the recorded seenAt without moving it backwards.

#### Scenario: Receipt for a loaded page
- **WHEN** a chat has events and a valid receipt specifies a timestamp beyond its newest event
- **THEN** the proposed boundary is capped at the newest event timestamp; the response contains version 1, ok true, agentId and the resulting seenAt.

#### Scenario: Invalid receipt or missing chat
- **WHEN** a nonblank body is malformed or lacks a valid boundary
- **THEN** the response is 400 `invalid_request` before chat lookup; a valid request for a missing chat instead receives 404 `not_found`.

<!-- id: api.v1-agent-read-post.throughTs -->
<!-- entities: read receipt, agent, event timestamp -->
<!-- enforced: src/api/$route_v1_agents_$id_read_POST.ts:8-32; src/auth/markSeen.ts:28-42 -->
<!-- test: src/api/$route_v1_agents_$id_read_POST.test.ts :: native read endpoint marks the chat read through the newest event -->

<!-- uncertainty: The cited read-route test covers the legacy empty-body path, not malformed or bounded receipts. The detail test checks the result limit, not argument redaction. No active-tool tail boundary assertion was identified in the inspected tests. -->
<!-- deferred: src/session/getEvents.ts; src/tools/presentation.ts; storage semantics and tool-specific rendering are outside this projection baseline. -->
