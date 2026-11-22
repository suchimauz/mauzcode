# Shared context registry

## Purpose
Let callers discover a published session, delegate a task using its current context, and retrieve the child's outcome without reading its transcript.

<!-- Last verified: 2026-11-22 at d35de7c21ff42cdbfb2db0272d6874d4db17a4e0 by source inspection. -->
<!-- uncertainty: Route tests mock registry operations; they do not verify database persistence or worker completion. -->
<!-- deferred: Child model selection is covered by native-todo-delegation. -->

## Requirements

### Requirement: Publish a discoverable card
Publication SHALL create or update one card per non-archived source session, preserving the original publication time on update.

#### Scenario: Revise an existing card
- **WHEN** a caller republishes a card with a new name, description and capability labels
- **THEN** the returned card retains its publication time, records the current update time, trims and limits the name and description to 120 and 1000 characters respectively, and keeps the first 20 distinct nonblank trimmed lowercase labels in input order.

#### Scenario: Reject an incomplete or unavailable source
- **WHEN** the ID, name, description or normalized label list is empty, or the source does not exist or is archived
- **THEN** publication fails without writing a card.

<!-- id: shared-agent-publish-card -->
<!-- entities: source session, registry card -->
<!-- enforced: src/sharedAgent/publish.ts sharedAgent.publish -->

### Requirement: Discover published contexts
Listing SHALL return cards for non-archived sources, ranking query matches by the number of matching terms and then by most recent update.

#### Scenario: Search by several words
- **WHEN** the query contains whitespace-separated terms
- **THEN** a card qualifies if any term occurs as a case-insensitive substring of its combined name, description and labels; more matching terms rank first.

#### Scenario: Browse without search terms
- **WHEN** the query is absent or blank
- **THEN** cards appear newest update first, excluding missing or archived sources and skipping card values that cannot be parsed as JSON.

<!-- id: shared-agent-list-scored -->
<!-- entities: query, registry card -->
<!-- enforced: src/sharedAgent/list.ts sharedAgent.list -->

### Requirement: Remove publication without removing sessions
Unpublication SHALL remove only the card for the trimmed nonblank source ID and succeed even if no such card exists.

#### Scenario: Withdraw a source after delegation
- **WHEN** a caller removes the publication and repeats the removal
- **THEN** both calls return success with the same source ID; neither removes the source or its existing children, and a new delegation fails while the card is absent.

<!-- id: shared-agent-unpublish-delete -->
<!-- entities: registry card, source session, delegated child -->
<!-- enforced: src/sharedAgent/unpublish.ts sharedAgent.unpublish; src/sharedAgent/delegate.ts sharedAgent.delegate -->

### Requirement: Delegate against current source context
Delegation SHALL fork the published source at delegation time, assign one task to the team-visible child and queue it before returning a working receipt.

#### Scenario: Source has advanced since publication
- **WHEN** a caller delegates a nonblank task after additional messages were added to the source
- **THEN** the fork inherits context through the current transcript boundary, receives a todo named `task` with the trimmed task text as its title, and the caller receives the child ID, source ID and `working` status rather than a finished result.

#### Scenario: Reject before forking
- **WHEN** the source ID or task is blank, the card is absent or invalid JSON, or the source cannot be loaded
- **THEN** delegation fails without creating a child.

<!-- id: shared-agent-delegate-fork -->
<!-- entities: registry card, source session, delegated child, todo -->
<!-- enforced: src/sharedAgent/delegate.ts sharedAgent.delegate; src/session/fork.ts session.fork -->

### Requirement: Read a shared task outcome
Result lookup SHALL return the marked child's stored status, summary, result payload and update time without returning its transcript.

#### Scenario: Poll before or after completion
- **WHEN** a caller supplies a shared task's child ID
- **THEN** the response includes the trimmed child ID and numeric update time; absent status defaults to `working`, and absent summary and result default to null. A stored result is returned as the payload, not its enclosing delegation record.

#### Scenario: Reject an unrelated session
- **WHEN** the ID is blank, the row does not exist, or its scratchpad lacks the shared task marker
- **THEN** lookup fails rather than reporting a working task.

<!-- id: shared-agent-result-shared-task -->
<!-- entities: delegated child, task result -->
<!-- enforced: src/sharedAgent/result.ts sharedAgent.result -->

### Requirement: Guard registry mutation routes
The publication, removal and delegation HTTP routes SHALL require an owner, valid CSRF token and explicitly confirmed request with valid fields before invoking the registry operation.

#### Scenario: Reject without mutation
- **WHEN** an owner or valid CSRF token is missing, or an authorized request lacks true confirmation or supplies an object instead of a source ID
- **THEN** the route does not invoke the operation and returns 403 for the authorization or CSRF failure, or 400 for the invalid body.

<!-- id: shared-agents-post-confirmed -->
<!-- kind: invariant -->
<!-- entities: owner, mutation request -->
<!-- enforced: src/$route_shared-agents_publish_POST.ts default export; src/$route_shared-agents_unpublish_POST.ts default export; src/$route_shared-agents_delegate_POST.ts default export -->
<!-- test: src/sharedAgent/reactApi.test.ts :: publish: owner, CSRF and explicit confirmation precede mocked mutation; unpublish: owner, CSRF and explicit confirmation precede mocked mutation; delegate: owner, CSRF and explicit confirmation precede mocked mutation -->
