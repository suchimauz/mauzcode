## Purpose

Define the existing edit tool's explicit, receipt-bound literal and anchor behaviors so supported file changes are based on visible current evidence, preserve unrelated bytes, and report recoverable failures without silently bypassing protection.

## ADDED Requirements

### Requirement: Require an explicit receipt-bound edit mode

The existing edit tool SHALL require readId, mode equal to literal or anchor, and a nonempty list of operations for one receipt-bound file. It MUST reject independent path or host fields, unknown fields, and operations incompatible with the selected mode before mutation. Caller-controlled ownership fields MUST NOT be accepted.

#### Scenario: Explicit literal operation
- **WHEN** an authorized caller submits a current readId, literal mode, and valid oldText/newText operations
- **THEN** only the receipt-bound target is eligible for the requested conditional edit

#### Scenario: Mixed or ambiguous input
- **WHEN** a request omits mode, supplies both literal and anchor fields, overrides path/host, or includes unknown fields
- **THEN** the response is invalid and no file is changed

### Requirement: Match literal operations within visible evidence

Literal edits SHALL use exact oldText and newText. oldText MUST be nonempty and match uniquely unless all is explicitly true. Every matched span MUST lie within the receipt's delivered scope. No-op and overlapping replacement spans MUST be rejected; the tool MUST NOT guess which occurrence the caller intended.

#### Scenario: Ambiguous repeated text
- **WHEN** oldText matches multiple occurrences and all is not true
- **THEN** the request fails without choosing the first or nearest occurrence

#### Scenario: All includes unseen text
- **WHEN** all is true but any matched span falls outside the delivered scope
- **THEN** the entire request is invalid and no occurrence is changed

#### Scenario: Identical replacement or overlap
- **WHEN** a replacement has identical oldText/newText or two replacement spans overlap
- **THEN** the entire edit is rejected without partial application

### Requirement: Address anchor operations only through current visible anchors

Anchor edits SHALL use anchors from the receipt's delivered snapshot for replaceLines, insertBefore, insertAfter, or delete. Addressed ranges MUST be ordered, visible, and nonoverlapping. Invalid, hidden, stale, or guessed anchors MUST NOT be relocated heuristically. Edge sentinels, if supported, SHALL require the corresponding file edge to have been delivered.

#### Scenario: Hidden or numeric-only anchor
- **WHEN** an operation references an unreturned anchor or a guessed line number instead of an accepted anchor
- **THEN** validation rejects the edit without reading additional content into its authority

#### Scenario: Overlapping anchored ranges
- **WHEN** two operations consume the same original line or an insertion conflicts with a replaced or deleted range
- **THEN** the tool rejects the request instead of silently choosing an application order

#### Scenario: File edge not shown
- **WHEN** a request uses an edge sentinel but the receipt does not include that file edge
- **THEN** the operation is invalid and the caller must read the relevant edge first

### Requirement: Evaluate an edit batch against one guarded snapshot

All operations in one edit call SHALL address the same original receipt snapshot. The complete request MUST be validated before publication and MUST NOT mix literal and anchor modes. Any invalid operation SHALL leave the whole target unchanged. Separate calls SHALL NOT imply an atomic multi-file transaction.

#### Scenario: Later operation is invalid
- **WHEN** the first operation is valid but a later operation has an invalid range or match
- **THEN** none of the operations are published

#### Scenario: Independent files require separate calls
- **WHEN** a caller needs changes in multiple files
- **THEN** each edit requires the respective target's receipt and result handling
- **AND** a successful earlier call is not claimed to roll back automatically if a later call fails

### Requirement: Refuse version or identity changes before publication

An edit SHALL compare the receipt's file version and identity under the participating writer protocol before publication. A mismatch MUST return conflict without mutation even if the requested substring or line hash still matches. The caller MUST re-evaluate target identity and task preconditions using fresh evidence.

#### Scenario: Same line content now belongs to another block
- **WHEN** blocks are reordered after the read while a target line still has the same text
- **THEN** the old receipt cannot authorize a positional edit in the changed file

#### Scenario: Task precondition changed
- **WHEN** enabled changes from true to false after a read and retries still matches the requested oldText
- **THEN** the edit is rejected as a version conflict rather than treating the substring match as evidence that enabled remains true

### Requirement: Preserve unrequested bytes and encoding details

Successful edits SHALL preserve all bytes outside their validated change spans, including unrelated concurrent data from the accepted snapshot. Supported text operations MUST preserve CRLF/LF policy, Unicode content, and final-newline presence unless the requested edit explicitly changes them. Unsupported transformations MUST fail without lossy rewriting.

#### Scenario: CRLF and absent final newline
- **WHEN** a supported operation changes one value in a CRLF file without a final newline
- **THEN** unrelated lines retain CRLF and the file still lacks a final newline

#### Scenario: Escapes and Unicode
- **WHEN** a targeted change is made near quotes, backslashes, or Unicode text
- **THEN** untouched characters and their original bytes remain unchanged

### Requirement: Return actionable structured outcomes

Edit SHALL distinguish applied, conflict, invalid, expired, unavailable, and busy outcomes. Pre-commit failures MUST indicate that nothing was written. A known committed result with uncertain durability MUST remain distinguishable from a no-write failure; an indeterminate transport outcome MUST NOT be represented as confirmed nonapplication.

#### Scenario: Validation failure
- **WHEN** the request fails schema or operation validation before commit
- **THEN** invalid identifies the actionable input issue and reports no change

#### Scenario: Commit succeeded but durability is uncertain
- **WHEN** publication succeeded but a later durability step failed
- **THEN** the result reports applied with durability uncertainty rather than inviting a blind reapplication

#### Scenario: Transport loses the commit acknowledgment
- **WHEN** the service cannot determine from the transport result whether the commit completed
- **THEN** the result explicitly marks commit state as unknown and instructs safe reconciliation instead of claiming no change

### Requirement: Refresh a conflict without silently retrying its meaning

Conflict handling SHALL retire the old receipt and return only currently authorized bounded evidence as specified by file-read-receipts. The tool MUST NOT automatically rebase or replay an edit against the new content. If fresh evidence cannot be issued safely, the response SHALL request a new read.

#### Scenario: Fresh scope available
- **WHEN** an authorized receipt conflicts and its original coordinates remain readable
- **THEN** the response supplies a new readId and current bounded evidence with no file mutation
- **AND** applying a new edit requires an explicit subsequent request

#### Scenario: Old receipt resubmitted after conflict
- **WHEN** the caller retries an edit using the retired conflicting readId
- **THEN** the tool refuses it and directs the caller to the new evidence rather than treating it as current

### Requirement: Replay exact completed receipt-backed requests safely

Within the live unexpired receipt store, an identical authorized retry of a successful receipt-backed mutation SHALL return its recorded result without a second write. A different payload using that consumed receipt MUST be rejected. This guarantee MUST NOT be presented as exactly-once execution through crashes, restart, or receipt loss.

#### Scenario: Concurrent duplicate retry
- **WHEN** two identical edit requests use the same current readId concurrently
- **THEN** at most one mutation is published and the other returns the recorded success after authorization

#### Scenario: Consumed receipt with changed payload
- **WHEN** a caller changes operations while reusing a successfully consumed readId
- **THEN** the new request is invalid and the caller must read again

#### Scenario: Crash after publication before result recording
- **WHEN** a process restarts after publication but before retaining a replay record
- **THEN** the old receipt is not treated as permission to apply the edit again
- **AND** reconciliation requires a new authorized read or a recorded operation outcome

### Requirement: Migrate current tool callers without an unsafe legacy fallback

The existing tool names SHALL retain their identities while schemas, descriptions, guidelines, and live callers migrate to receipt-bound mutations. Legacy path-only edit requests MUST fail with actionable reread/new-schema guidance. Persisted conversation history MUST NOT be rewritten to fabricate receipts or successful migrations.

#### Scenario: Old session sends path-only edit
- **WHEN** a pre-change session submits the previous edit shape after the guarded contract is enabled
- **THEN** the request is rejected without writing and the caller is told to read and use the current schema

#### Scenario: Transport changes schema shape
- **WHEN** a native provider or compatibility transport presents the edit tool
- **THEN** its arguments preserve the same mode and receipt restrictions as the server validator
- **AND** lack of provider-side union enforcement cannot enable a server-side mixed-mode fallback

### Requirement: Treat successful edits as consumed evidence

A successful receipt-backed edit SHALL consume the receipt for new mutations. Subsequent edits MUST obtain a new authorized read unless an explicitly delivered post-edit snapshot issues new scoped evidence. A response containing only a success summary or byte count MUST NOT imply the entire resulting file was read.

#### Scenario: Follow-up edit after success
- **WHEN** a caller wants another different change after an applied edit
- **THEN** it obtains fresh scoped evidence rather than extending the authority of the consumed receipt
