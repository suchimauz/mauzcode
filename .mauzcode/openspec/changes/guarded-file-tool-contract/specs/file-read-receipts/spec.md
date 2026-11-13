## Purpose

Provide authorized, scope-limited evidence of file versions actually delivered by existing read surfaces so later mutations can validate their target, version, and visible content without trusting caller-supplied identity.

## ADDED Requirements

### Requirement: Preserve reading capabilities while identifying editable evidence

The existing read tool SHALL preserve text, range, hashline, image, and host-aware reading. Editable text results SHALL identify the delivered content scope and carry an opaque readId only when that scope and its exact source version are verified. Image or unsupported text results MUST NOT confer text-edit authority.

#### Scenario: Editable text read
- **WHEN** an authorized caller reads supported text from a local or SSH file
- **THEN** the result contains the requested bounded content, its scope metadata, and a readId bound to that snapshot
- **AND** the result distinguishes complete-file evidence from partial evidence

#### Scenario: Image and unsupported file
- **WHEN** an authorized caller reads an image or content that cannot safely provide editable text evidence
- **THEN** the existing supported viewing behavior remains available
- **AND** the response does not issue authority to edit unseen or unsupported text

### Requirement: Bind receipts to server-established ownership and target

A receipt SHALL bind the authenticated owner, agent/session context, workspace identity, resolved host, canonical file identity, source version, and delivered scope. These bindings MUST originate from trusted server context. A receipt MUST NOT be transferable to another owner, agent/session, workspace, or host.

#### Scenario: Foreign or relocated receipt
- **WHEN** a receipt is submitted from a different owner, agent/session, workspace, or host context
- **THEN** it is rejected as unavailable without mutation or disclosure of its target content

#### Scenario: Target substitution
- **WHEN** a caller attempts to override the path or host bound to a receipt-backed mutation
- **THEN** validation rejects the request rather than resolving a second target

### Requirement: Reauthorize receipt use and evidence disclosure

Possession of a readId SHALL NOT replace current authorization. The service MUST recheck access before reading, committing, replaying a recorded result, or returning fresh conflict evidence. Unknown, foreign, and unauthorized receipts MUST NOT disclose target content or protected identity details.

#### Scenario: Access revoked after read
- **WHEN** access to the file or owning workspace is revoked after a receipt was issued
- **THEN** a subsequent edit, retry, or refresh cannot mutate the file or return its content

#### Scenario: Guessed receipt
- **WHEN** a caller submits an unknown token
- **THEN** the response reveals neither whether a particular protected file exists nor its content

### Requirement: Version exact bytes and file identity

Receipt versions SHALL reflect exact source bytes and stable file identity, independently of display normalization. A same-bytes replacement with a different identity MUST invalidate the receipt. Unsupported or unstable identity resolution MUST fail closed rather than silently weaken version checks.

#### Scenario: New file identity with identical text
- **WHEN** another writer replaces the file object with a new object containing the same text
- **THEN** a mutation using the previous readId is rejected as a conflict

#### Scenario: CRLF display normalization
- **WHEN** CRLF text is displayed with line annotations or normalized visual separators
- **THEN** the receipt retains the version of the original bytes and the mapping of visible text to those bytes
- **AND** normalization alone does not grant permission to rewrite line endings

### Requirement: Limit authority to delivered evidence

Receipts SHALL cover only content actually included in the final authorized read response. Partial, clipped, stored-result-preview, or transport-truncated output MUST NOT confer complete-file authority. Retrieving additional content SHALL require a validated read path that issues or expands evidence only for the newly delivered scope.

#### Scenario: Partial range
- **WHEN** only lines 20 through 40 are delivered from a larger file
- **THEN** the receipt is partial and cannot authorize edits outside that range or full replacement

#### Scenario: Tool output is truncated after formatting
- **WHEN** a transport clips a read result or shows a preview while storing the full result elsewhere
- **THEN** it does not expose an edit-capable receipt covering the hidden content
- **AND** it either narrows the receipt to verifiably delivered content or withholds edit authority and provides bounded reread guidance

#### Scenario: Additional stored output
- **WHEN** a caller retrieves more text through an output-history viewer that does not participate in receipt issuance
- **THEN** that retrieval alone does not upgrade the original receipt to full-file authority

### Requirement: Bound lifecycle and resource use

Receipts SHALL expire after five minutes by default and SHALL have bounded storage. Expiration, eviction, restart, or loss of the issuing service epoch MUST require a new read, never an unconditional-write fallback. A known expired receipt SHALL return expired; an unresolvable receipt SHALL return unavailable without content disclosure.

#### Scenario: Receipt expires
- **WHEN** a known receipt is used after its lifetime
- **THEN** no write occurs and the response requests a new read with expired status

#### Scenario: Restart or eviction
- **WHEN** the issuing receipt store no longer resolves the receipt after restart or eviction
- **THEN** the request fails as unavailable and cannot regenerate authority merely from a path or cached hash

### Requirement: Refresh conflicts within the original scope

After a version conflict, the old receipt SHALL be retired. Subject to current authorization, the response SHALL include a new receipt and bounded current content no broader than the original delivered coordinates. If those coordinates are unavailable or disclosure cannot be bounded safely, the response SHALL omit fresh evidence and request a new authorized read.

#### Scenario: Visible conflict with hidden neighboring data
- **WHEN** a partial receipt conflicts and the same coordinates remain readable
- **THEN** fresh evidence includes only that bounded scope and a new readId
- **AND** neighboring unshown data is not added to the response

#### Scenario: File shrank or authorization changed
- **WHEN** the original scope no longer exists or cannot be disclosed under current permissions
- **THEN** no out-of-range or unauthorized fresh content is returned

#### Scenario: Lines shifted
- **WHEN** inserted lines change which text occupies the original coordinates
- **THEN** the refreshed result identifies its current coordinates and version
- **AND** it does not claim that the previous semantic target or task precondition remains valid

### Requirement: Make read limits explicit without inventing authority

Production read limits SHALL be explicit and preserve supported read use cases rather than silently inheriting prototype caps. Large or minified lines, invalid UTF-8, and binary content MUST NOT cause hidden bytes to become editable. Unsupported editable views SHALL fail safely while retaining supported inspection behavior.

#### Scenario: Large minified line
- **WHEN** a supported long line can be delivered completely within configured read limits
- **THEN** its complete delivered scope can receive editable evidence without forced line-ending changes
- **AND** if it is clipped, hidden portions receive no edit authority

#### Scenario: Invalid UTF-8 or binary input
- **WHEN** a file cannot be represented as supported editable text without lossy decoding
- **THEN** no text-edit receipt is issued for the lossy representation

### Requirement: Keep editable snapshots stable across cooperating reads and writes

A receipt-bearing snapshot SHALL be captured consistently with participating writers so its version, identity, content, and visible scope refer to the same read. A detected concurrent replacement during snapshot capture MUST trigger retry within bounds or fail without issuing inconsistent evidence.

#### Scenario: Replacement during snapshot capture
- **WHEN** file identity or content changes while a receipt-bearing read is being assembled
- **THEN** the service does not issue a receipt pairing old content with a new version or identity
