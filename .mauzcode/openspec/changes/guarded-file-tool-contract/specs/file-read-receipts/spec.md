## ADDED Requirements

### Requirement: Issue a readId for delivered text

The `read` tool SHALL keep text, range, hashline, image and host-aware reading. For supported text it SHALL also return a short opaque `readId` identifying the exact file version (hash of raw bytes), host, resolved path and the delivered line range, plus whether the read covered the whole file. Images, binary files and invalid UTF-8 SHALL NOT receive a readId.

#### Scenario: Plain text read
- **WHEN** an agent reads a text file, with or without hashline
- **THEN** the result contains the usual content and a readId with its line range and completeness

#### Scenario: Image read
- **WHEN** an agent reads a PNG file
- **THEN** the image is returned as before and no readId is issued

#### Scenario: Range read
- **WHEN** an agent reads lines 40–80 of a 200-line file
- **THEN** the readId covers lines 40–80 and is marked as not complete

### Requirement: Keep receipts per session with a bounded lifetime

Receipts SHALL be stored in memory per session with a sliding lifetime of 30 minutes by default, extended on each use, and a bounded per-session count with least-recently-used eviction. A readId SHALL resolve only within the session that received it. A call without a session SHALL receive no readId. Only `read` SHALL issue receipts; `grep` SHALL NOT. Receipts are version references, not permissions; normal path and host resolution still applies.

#### Scenario: Unknown or expired readId
- **WHEN** an edit uses a readId that expired, was evicted, was lost on restart, or belongs to another session
- **THEN** nothing is written and the result reports `expired` with guidance to read the file again

#### Scenario: Session-less read
- **WHEN** `read` runs without a session, for example from eval
- **THEN** the content is returned as before and no readId is issued

#### Scenario: readId stays visible in a stored preview
- **WHEN** a large read result is stored and shown as a tail preview
- **THEN** the preview still shows the readId line

#### Scenario: Use extends lifetime
- **WHEN** a live readId is used
- **THEN** its expiry moves forward by the configured lifetime

### Requirement: Refresh evidence on conflict and after success

After a version conflict the old readId SHALL be retired and the result SHALL include a new readId plus fresh content for the same line range, within the normal read limits. After a successful edit the result SHALL include a new readId for the edited range, so consecutive edits do not require another read.

#### Scenario: Conflict returns a fresh snapshot
- **WHEN** the file changed after the read and an edit is attempted
- **THEN** the result reports `conflict`, contains the current content of the same range and a new readId, and nothing is written

#### Scenario: Chained edits
- **WHEN** an edit succeeds
- **THEN** the returned readId can be used directly for the next edit of that file
