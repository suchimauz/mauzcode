# Session history and lifecycle

## Purpose
Describe how callers store and read a conversation, inherit a prefix of its history, and archive, restore or delete it without breaking dependent forks.

<!-- last_verified: 2026-11-22 at d35de7c21ff42cdbfb2db0272d6874d4db0272d6874d4db17a4e0; inspected session sources and tests were clean; tests not executed -->

## Requirements

### Requirement: Append positions and retry identity
A new message SHALL receive the next session-local index, starting at zero. Reusing a nonblank client request ID in the same session SHALL return the stored index rather than append a second message.

#### Scenario: First two messages
- **WHEN** two new turns are appended successively to an empty transcript
- **THEN** the caller receives indices 0 and 1 in order

<!-- id: session.appendMessage.insert -->
<!-- entities: session, message, client request ID -->
<!-- enforced: src/session/appendMessage.ts#session.appendMessage -->
<!-- test: src/session/appendMessage.test.ts :: appends messages with incrementing idx -->

#### Scenario: Retry with surrounding whitespace
- **WHEN** a submission is retried for the same session with spaces around its original request ID
- **THEN** the result contains the original index and duplicate: true, and the original message is unchanged

### Requirement: Read a session's own messages
An own-history read SHALL return only the session's rows in index order, omitting LLM-excluded rows unless includeExcluded is true. Cursor exclusion alone SHALL NOT hide a row.

#### Scenario: Inspect excluded rows
- **WHEN** a session contains a cursor-only excluded row followed by an LLM-excluded row
- **THEN** the default read returns the first row, and a read with includeExcluded true returns both with their exclusion flags

<!-- id: session.getMessages.select -->
<!-- entities: session, message -->
<!-- enforced: src/session/getMessages.ts#session.getMessages -->
<!-- test: src/session/getFullMessages.test.ts :: getMessages returns only own messages -->

### Requirement: Select the fork boundary
Fork creation SHALL link the child to the parent with the supplied offset, defaulting to the length of the parent's full default history rather than its own row count.

#### Scenario: Fork a fork
- **WHEN** a parent has one inherited and one local visible message and is forked without an offset
- **THEN** the new child's parent is that session and its offset is two

<!-- id: session.fork.forkOffset -->
<!-- entities: parent session, child session, fork offset -->
<!-- enforced: src/session/fork.ts#session.fork -->
<!-- test: src/session/fork.test.ts :: nested fork uses full parent count, not own-only count -->

### Requirement: Assemble inherited history
A full-history read SHALL recursively read the parent with the same exclusion option, take its prefix at the stored offset (all if null), and append the child's own rows. A missing session SHALL yield an empty list.

#### Scenario: Parent grows beyond the boundary
- **WHEN** a child with offset two and one local message is read while the parent has three visible messages
- **THEN** the read returns the first two parent messages followed by the local message

<!-- id: session.getFullMessages.limited -->
<!-- entities: session, message, fork offset -->
<!-- enforced: src/session/getFullMessages.ts#session.getFullMessages -->
<!-- test: src/session/getFullMessages.test.ts :: chains parent messages for child -->

### Requirement: Archive or restore one conversation
Archive and restore SHALL change only the selected session's archive status without deleting its history or cascading the transition to children. An already satisfied request SHALL succeed without repeating the transition; a missing ID SHALL return ok: false.

#### Scenario: Archive a parent twice and restore it
- **WHEN** an eligible parent is archived twice and then restored
- **THEN** the second archive preserves the first timestamp, restore clears it, and the child keeps its archive status throughout

<!-- id: session.archive.archived_at -->
<!-- entities: session, child session, archive timestamp -->
<!-- enforced: src/session/archive.ts#session.archive; src/session/unarchive.ts#session.unarchive -->
<!-- test: src/session/archive.lifecycle.test.ts :: archive/restore preserves live state, fixture counts, parent-child boundaries and is idempotent -->

#### Scenario: Work prevents a transition
- **WHEN** a transition is needed but the session is running, has an active local run, has pending work or has a scheduled wake
- **THEN** the operation rejects the transition instead of cancelling work or changing the archive timestamp

### Requirement: Delete a leaf without removing inherited history
Deletion SHALL refuse a session with a detected direct child, including an archived child. For an existing leaf it SHALL remove the session, inputs, messages and events in one transaction; a missing session without children SHALL return ok: false.

#### Scenario: Delete a leaf
- **WHEN** a session with stored turns and events but no children is successfully deleted
- **THEN** the caller receives ok: true and the session row, turns and events no longer exist

<!-- id: session.delete.children -->
<!-- entities: session, child session, input, message, event -->
<!-- enforced: src/session/delete.ts#session.delete -->
<!-- test: src/session/delete.test.ts :: removes agent row + messages + events -->

#### Scenario: Archived fork still depends on its parent
- **WHEN** the child lookup finds an archived fork during parent deletion
- **THEN** deletion fails before removing the parent's transcript

<!-- uncertainty: The child lookup precedes the deletion transaction; no guarantee is made about racing fork creation. Named tests cover only the assertions they exercise, not every branch in each requirement. -->
<!-- deferred: src/session/scrubUnicode.ts; mention recording, hook implementations and attachment collection are outside this transcript lifecycle baseline. -->
