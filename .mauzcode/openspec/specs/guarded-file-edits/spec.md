# guarded-file-edits Specification

## Purpose
Apply literal or anchor edits only against the file version and range named by a readId, in one explicit unmixed mode, refusing stale edits without writing and returning fresh content and a new readId so the agent can retry without a separate read.

## Requirements

### Requirement: Edit against a readId in one explicit mode

`edit` SHALL accept `readId`, `mode` (`literal` or `anchor`) and `edits`. Literal edits carry `oldText`, `newText` and optional `all`; anchor edits carry `op`, `anchor`, optional `endAnchor` and `text`. The target file and host SHALL come from the receipt. A call SHALL use one mode only; fields of the other mode SHALL be rejected.

#### Scenario: Literal edit
- **WHEN** an agent sends mode literal with a unique oldText inside the delivered range
- **THEN** the replacement is applied and the result reports `applied` with a new readId

#### Scenario: Anchor edit
- **WHEN** an agent sends mode anchor with anchors from the receipt's delivered lines
- **THEN** the line operations are applied and the result reports `applied` with a new readId

#### Scenario: Mixed fields
- **WHEN** an anchor-mode call contains oldText
- **THEN** the call is rejected as `invalid` and nothing is written

### Requirement: Validate edits against the read version

Anchors SHALL be checked against the receipt's version and delivered range, and literal matches SHALL be counted only inside the delivered range. The edit SHALL be rejected as `invalid` when an anchor lies outside the range, a literal has zero or (without `all`) several matches, a literal is a no-op, or operations overlap.

#### Scenario: Anchor outside the delivered range
- **WHEN** an anchor refers to a line that was not part of the read
- **THEN** the call is rejected as `invalid`

#### Scenario: Ambiguous literal
- **WHEN** oldText matches twice in the delivered range and `all` is not set
- **THEN** the call is rejected as `invalid` with the match count

#### Scenario: Overlapping operations
- **WHEN** two operations touch the same lines or bytes
- **THEN** the call is rejected as `invalid` and nothing is written

### Requirement: Refuse stale edits without a separate read

The version SHALL be compared with the current file inside the commit lock. If it differs, nothing SHALL be written and the result SHALL report `conflict` with fresh evidence as defined by the read-receipts capability. The system SHALL NOT rebase edits onto the new version automatically.

#### Scenario: Concurrent change to the file
- **WHEN** another participating writer changed the file after the read
- **THEN** the edit is refused with `conflict`, the other writer's change is preserved, and fresh content is returned

### Requirement: Match literals regardless of line endings

Literal `oldText` SHALL match the text as it was shown by `read`, with LF line breaks, even when the file uses CRLF. The replacement SHALL be written with the file's line endings.

#### Scenario: Multi-line literal in a CRLF file
- **WHEN** an agent replaces the two-line text `a\nb` in a CRLF file
- **THEN** the match succeeds and the file keeps CRLF line endings

### Requirement: Report clear outcomes

Results SHALL start with a status: `applied`, `conflict`, `invalid`, `expired` or `busy`. Every status except `applied` SHALL state that nothing was written. Results SHALL stay compact text: a status line, the readId, a short change summary and, on conflict, the fresh content.

#### Scenario: Lock timeout
- **WHEN** the file lock cannot be acquired within the bounded wait
- **THEN** the result reports `busy` and nothing is written
