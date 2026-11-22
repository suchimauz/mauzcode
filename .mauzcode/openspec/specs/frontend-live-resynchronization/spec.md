# Recovering live state in the React chat

## Purpose
Describe when the agent list and open chat reread server state, and how the chat keeps a streamed answer visible while it moves into history.

Last verified: 2026-11-22 against `d35de7c21ff42cdbfb2db0272d6874d4db17a4e0` by inspection of clean source files.

## Requirements

### Requirement: Route invalidations to snapshot reads
The agent list and selected chat SHALL refresh from server snapshots on matching live notifications rather than applying the notification as chat content.

#### Scenario: Topic-specific invalidation
- **WHEN** a refresh targets the selected agent's stream topic
- **THEN** the chat schedules an event-page read but the agent list does not schedule a list read for that notification.

#### Scenario: Unscoped notification
- **WHEN** both subscribers receive a notification without a topic while visible
- **THEN** both request a refresh.

<!-- id: use-mauz-code-live-matches -->
<!-- entities: agent list, selected chat, live notification -->
<!-- enforced: frontend/src/hooks/useMauzCode.ts#useMauzCode -->

### Requirement: Bound concurrent snapshot reads
Each subscriber SHALL run at most one snapshot read at a time and coalesce matching notifications without waiting for a continuous stream to stop.

#### Scenario: Slow read during a burst
- **WHEN** several matching notifications arrive while a visible subscriber's read is still running
- **THEN** no overlapping read starts and one trailing read is scheduled on completion.

<!-- id: live-refresh-run-busy -->
<!-- kind: invariant -->
<!-- entities: subscriber, snapshot read -->
<!-- enforced: frontend/src/lib/liveRefresh.ts#liveRefresh -->
<!-- test: frontend/src/test/live-refresh.test.ts :: serializes slow reads and remembers one trailing invalidation -->

### Requirement: Recover snapshots without a matching event
A visible subscriber SHALL reread periodically even without notifications and request a refresh on reconnection, a transport resync callback, or a browser online event.

#### Scenario: Quiet transport
- **WHEN** a connected subscriber completes a read with no pending refresh and receives no further signal
- **THEN** its next read is scheduled for 60 seconds later.

#### Scenario: Connection loss and recovery
- **WHEN** the selected chat loses its connection
- **THEN** idle polling uses 2.5 seconds instead of one minute; a transition back to connected schedules a refresh without waiting for the next poll. The agent list uses a 10-second fallback instead.

<!-- id: live-refresh-delay-status -->
<!-- entities: transport status, snapshot read, subscriber -->
<!-- enforced: frontend/src/lib/liveRefresh.ts#liveRefresh; frontend/src/hooks/useMauzCode.ts#useMauzCode -->
<!-- test: frontend/src/test/live-refresh.test.ts :: does no frequent reads with healthy SSE; reconciles once a minute -->
<!-- test: frontend/src/test/live-refresh.test.ts :: uses temporary fallback after loss and promptly reconciles on reconnect -->

### Requirement: Suspend reads while hidden
Subscribers SHALL start no reads while the document is hidden, request reconciliation when it becomes visible, and stop scheduling reads after disposal.

#### Scenario: Hide before a scheduled refresh
- **WHEN** a refresh is pending and the tab becomes hidden before it starts
- **THEN** the scheduled read is cancelled; showing the tab schedules a fresh read.

<!-- id: live-refresh-visibility -->
<!-- entities: document, subscriber -->
<!-- enforced: frontend/src/lib/liveRefresh.ts#liveRefresh -->
<!-- test: frontend/src/test/live-refresh.test.ts :: does not fetch hidden tabs, resumes pending refresh and cleans up -->

### Requirement: Isolate selected chat snapshots
The selected chat SHALL ignore a successful live read if its request was aborted, its selection generation changed, or its agent is no longer selected.

#### Scenario: Switch chats before a response arrives
- **WHEN** a live read for the previous selection returns after the user switches chats
- **THEN** that response does not populate the newly selected transcript.

<!-- id: use-mauz-code-read-generation -->
<!-- entities: selected chat, event page -->
<!-- enforced: frontend/src/hooks/useMauzCode.ts#useMauzCode -->

### Requirement: Retain partial prose only during handoff
The chat SHALL prefer the new partial answer and carry an older partial across snapshots only for the same agent during an explicit handoff with no newly committed assistant answer.

#### Scenario: Repeated reads before storage catches up
- **WHEN** successive pages signal handoff but contain neither a new partial nor a newly committed assistant answer
- **THEN** the same agent's last visible partial remains visible.

#### Scenario: History takes over
- **WHEN** a handoff page without a partial contains an assistant event beyond the previous page's highest event index that is neither an incoming nor an outgoing agent message
- **THEN** the chat drops the retained partial in that update without requiring a text match.

#### Scenario: Handoff absent
- **WHEN** a page contains no partial and does not signal handoff
- **THEN** the previous partial is cleared.

<!-- id: reconcile-stream-committed -->
<!-- entities: partial answer, event page, assistant event -->
<!-- enforced: frontend/src/lib/streamHandoff.ts#reconcileStream -->
<!-- test: frontend/src/test/stream-handoff.test.ts :: retains visible prose across an explicit handoff gap and repeated refreshes -->
<!-- test: frontend/src/test/stream-handoff.test.ts :: replaces the draft atomically when the durable assistant event arrives -->
<!-- test: frontend/src/test/stream-handoff.test.ts :: does not preserve cancelled prose, cross-chat drafts or old drafts over a new stream -->

<!-- uncertainty: The scheduler tests simulate transport status and notification callbacks; they do not establish end-to-end delivery or replay guarantees. -->
<!-- deferred: Transport implementation behind frontend/src/lib/live.ts#loadLiveClient and server-rendered regions in src/ui/live.ts are outside the React snapshot boundary. -->
