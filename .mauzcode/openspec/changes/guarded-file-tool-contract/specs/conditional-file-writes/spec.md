## Purpose

Make supported file creation, replacement, and edit publication conditional on explicit evidence through a shared local and SSH writer protocol, with clear guarantees for cooperating writers and honest limits for external writes and failures.

## ADDED Requirements

### Requirement: Separate create and replace in the existing write tool

The existing write tool SHALL require an explicit create or replace mode. Create SHALL accept an authorized path and optional host but require absence at commit. Replace SHALL accept a full current readId and content without independent path or host. Unknown or conflicting write forms MUST be rejected before publication.

#### Scenario: Create a new file
- **WHEN** an authorized create request targets an absent file and its parent target can be resolved safely
- **THEN** the file is created only if it remains absent within the conditional commit protocol

#### Scenario: Existing target on create
- **WHEN** create targets a file that already exists, including a directory or unsupported link entry
- **THEN** no existing entry is overwritten and the response reports conflict or unavailable as appropriate without disclosing unauthorized content

#### Scenario: Replace with partial evidence
- **WHEN** replace carries a partial, expired, or foreign receipt
- **THEN** it cannot perform a full rewrite and returns the corresponding invalid, expired, or unavailable outcome

### Requirement: Handle legacy path-and-content writes by rollout mode

The former path-and-content write form SHALL follow the `files.guard` setting. In `warn` mode it is accepted as an unverified overwrite that still goes through writer coordination and atomic publication, and its result carries a warning plus a new readId. In `enforce` mode it is rejected.

#### Scenario: Legacy unconditional write in warn mode
- **WHEN** `files.guard` is `warn` and a caller submits the former path-and-content form
- **THEN** the write is published under writer coordination with atomic publication, reported as unverified, and returns a warning with guidance to use create or replace

#### Scenario: Legacy unconditional write in enforce mode
- **WHEN** `files.guard` is `enforce` and a caller submits the former path-and-content form
- **THEN** validation rejects it with guidance to use create-if-absent or read then replace

### Requirement: Keep the internal file service compatible and coordinated

The `files.write` runtime function SHALL keep its current signature and accept new optional preconditions: `readId` or `expectedVersion` for replacement and `ifAbsent` for creation. Every call, with or without preconditions, SHALL go through the shared writer coordination and atomic single-file publication. A call without preconditions SHALL be reported as unverified: interleaving cannot lose updates, but a change made after the caller's own read can still be overwritten.

#### Scenario: Existing internal caller without preconditions
- **WHEN** an existing runtime function calls `files.write({ path, content })`
- **THEN** the call succeeds as before and is serialized with guarded tool writes to the same target
- **AND** readers never observe partially written bytes

#### Scenario: Internal caller with a precondition
- **WHEN** a runtime function calls `files.write` with `expectedVersion`, `readId`, or `ifAbsent` and the target no longer matches
- **THEN** nothing is written and a structured conflict is returned

### Requirement: Steer generated content to guarded writes

The `expectedContent` option of `files.write` SHALL remain supported as a compatibility precondition checked inside the commit path. The agent system prompt SHALL recommend the guarded `write` tool for saving generated content instead of unconditional `files.write`.

#### Scenario: Prompt guidance for generated content
- **WHEN** the agent system prompt explains how to save content generated in eval
- **THEN** it recommends `write` in create or replace mode rather than unconditional `files.write`

### Requirement: Apply full replacement only to current complete evidence

Full replacement SHALL require complete evidence for the current receipt-bound file: a complete-file read, combined range reads covering the whole unchanged version, or a version-only read. Version or identity changes MUST prevent the replacement even if its submitted content resembles the current file. Receipt-backed replacements SHALL obey the same authorization, conflict, retirement, and exact-success replay rules as guarded edits.

#### Scenario: Stale overwrite
- **WHEN** another writer changes the target after the complete read and before replacement
- **THEN** replacement returns conflict without overwriting the other writer's change

#### Scenario: Exact replacement retry
- **WHEN** an identical successful replace request is retried with its unexpired consumed receipt
- **THEN** it returns the recorded authorized outcome without writing twice

### Requirement: Disclose version-only replacement semantics

A replacement backed by a version-only readId SHALL report that the overwritten version was identified but its content was not delivered.

#### Scenario: Replace via version-only receipt
- **WHEN** a caller replaces a large file using a version-only readId whose version is still current
- **THEN** the replacement publishes and its result marks the evidence as version-only

### Requirement: Coordinate all participating writers by target identity

Participating local and SSH writers SHALL serialize conditional mutations of the same canonical target across processes, validate current state inside that critical section, and publish only validated results. Lock identity MUST not depend on an unnormalized caller alias. Internal unconditional writes MUST NOT be a fallback for failed guarded operations.

#### Scenario: Concurrent edits from the same read version
- **WHEN** two participating processes attempt different edits based on the same target version
- **THEN** at most one publishes against that version and the other receives a conflict before mutation

#### Scenario: Concurrent creates
- **WHEN** two participating processes create the same initially absent target
- **THEN** only one creation succeeds and the other cannot overwrite its content

#### Scenario: Alias identifies the same target
- **WHEN** two supported path or host aliases resolve to one canonical file
- **THEN** both mutations participate in the same writer coordination domain or unsupported alias resolution is rejected

### Requirement: Include existing save entry points without weakening security

Tools, file services, Files save routes, and Canvas saves SHALL use the participating conditional commit path. Browser preconditions MUST be validated again inside that path, not only before calling it. Existing authentication, ownership, authorization, and CSRF checks MUST remain enforced on every applicable entry point.

#### Scenario: Canvas save races with agent edit
- **WHEN** an authorized Canvas save and agent edit compete using the same old file version
- **THEN** the winner's update is preserved and the stale participant receives a conflict

#### Scenario: Files save passes an early check
- **WHEN** Files validates expected content and another participant writes before its commit
- **THEN** the commit path rechecks and rejects the stale save

#### Scenario: Missing browser authorization or CSRF
- **WHEN** a browser save lacks required ownership, authorization, or CSRF evidence
- **THEN** writer coordination does not allow the request to bypass those checks

### Requirement: Bind browser replacement to read-time identity and version

Browser reads SHALL issue an opaque server-established revision binding viewer and target context, canonical file identity, and exact-byte version captured together at read time. Replacement saves MUST present that revision and revalidate authorization, identity, and version inside commit. expectedContent MAY be an additional check but MUST NOT substitute for the revision or establish read-time identity from save-time state.

#### Scenario: Same bytes in a replaced file after browser read
- **WHEN** Files or Canvas reads a file and the target is then replaced by a different inode containing identical bytes before saving
- **THEN** the commit path detects the read-time identity mismatch and returns conflict without overwriting the replacement
- **AND** matching expectedContent does not bypass the identity check

#### Scenario: Legacy browser replacement lacks a revision
- **WHEN** a browser replacement request supplies expectedContent but no server-established read-time revision
- **THEN** the save is rejected without publication with guidance to read again through the current contract
- **AND** the server does not manufacture a read-time revision from the target's save-time state

### Requirement: Resolve identity safely or refuse the operation

Canonical identity checks SHALL cover host aliases, path resolution, replacement, and supported link behavior. Symlink, hardlink, parent-directory, or unsupported filesystem identity ambiguities MUST be rejected unless the implementation proves consistent target binding and coordination. An unsafe path-resolution fallback MUST NOT be used to preserve apparent compatibility.

#### Scenario: Link target or parent changes
- **WHEN** a link or path component changes while the protected target is resolved or validated
- **THEN** the service refuses publication unless its supported identity protocol proves the originally authorized target is still used

#### Scenario: Unsupported hardlink or SSH identity
- **WHEN** shared identity cannot be maintained for a hardlink or remote target
- **THEN** the operation fails safely rather than claiming full guarded support

### Requirement: Publish a single file without exposing partial bytes

For supported targets, a successful mutation SHALL publish the complete validated file without exposing intermediate partial file contents. Pre-publication failure MUST preserve the previous target. Required checks and temporary resources MUST be cleaned up safely. This guarantee MUST NOT be described as an atomic multi-file transaction.

#### Scenario: Failure before publication
- **WHEN** validation, preparation, writing temporary data, or the final current-version check fails before publication
- **THEN** the target remains unchanged and temporary resources are safely cleaned up

#### Scenario: Reader during publication
- **WHEN** a reader observes a supported target during a completed single-file publication
- **THEN** it does not observe a partially written new file

#### Scenario: Second independent file fails
- **WHEN** one file mutation succeeds and a separate later file mutation fails
- **THEN** the result does not claim that the first mutation was automatically rolled back

### Requirement: Preserve metadata under an explicit supported policy

Conditional publication SHALL preserve required permission bits and other metadata covered by the supported platform policy. Ownership, ACLs, extended attributes, and special metadata MUST NOT be silently discarded. If safe preservation cannot be provided, the operation SHALL fail before publication with an actionable unsupported result rather than misreport ordinary success.

#### Scenario: Executable mode
- **WHEN** supported source editing replaces the contents of an executable file
- **THEN** its existing executable permission bits remain intact

#### Scenario: Unsupported ACL or attribute preservation
- **WHEN** publication cannot preserve protected metadata required by the file's supported policy
- **THEN** it fails before changing the target and explains the limitation without silently stripping metadata

### Requirement: Report lock and crash conditions conservatively

Lock acquisition SHALL have bounded waiting and return busy without changing the target on timeout. The system MUST NOT steal a lock solely because it appears old. Crash recovery MUST establish safe ownership before releasing coordination state; otherwise it SHALL remain unavailable or busy and expose operator recovery guidance.

#### Scenario: Live writer holds the lock
- **WHEN** another process cannot acquire the target lock before timeout
- **THEN** it returns busy, writes nothing, and does not remove the active writer's lock

#### Scenario: Owner crash leaves coordination state
- **WHEN** a crash leaves a lock whose ownership cannot be safely resolved
- **THEN** a later request does not assume elapsed time proves the lock can be stolen

### Requirement: Distinguish publication from durability and acknowledgment

Results SHALL distinguish confirmed nonpublication, confirmed publication, and an unknown commit outcome. If publication succeeds but durability confirmation fails, the result MUST report committed state with uncertainty. Loss of an acknowledgment MUST NOT trigger automatic blind retries or unconditional overwrites.

#### Scenario: Directory synchronization fails after publication
- **WHEN** the new file is already published but subsequent durability confirmation fails
- **THEN** the response indicates an applied mutation with uncertain durability rather than claiming no change

#### Scenario: Remote connection drops near commit
- **WHEN** an SSH connection fails without establishing whether publication happened
- **THEN** the client reports an unknown commit outcome and requires reconciliation before any new mutation

### Requirement: Preserve local and SSH parity for supported operations

Guarded support SHALL be declared separately for each supported platform and host path only after equivalent identity, authorization, version, coordination, publication, and conflict tests pass. Existing supported host-aware inspection SHALL remain usable.

#### Scenario: SSH parity gate fails
- **WHEN** the remote backend cannot enforce a required guarded mutation guarantee and `files.guard` is `enforce`
- **THEN** it rejects that mutation with explicit support guidance while preserving authorized read-only inspection

#### Scenario: Supported remote conflict
- **WHEN** a participating remote writer changes a file after a receipt-bearing read
- **THEN** a stale remote mutation receives the same no-write conflict semantics and scoped authorized refresh as a supported local mutation

### Requirement: Stage SSH support behind the rollout mode

SSH guarded support SHALL be delivered in a later stage built on the existing `remote.writeFile` lock and temporary-file rename. Until that stage passes its gates, SSH mutations SHALL keep current behavior under `warn` with an unverified-write warning and SHALL fail closed under `enforce` rather than reduce to an unconditional remote write.

#### Scenario: SSH before its stage in warn mode
- **WHEN** SSH guarded support is not yet declared and `files.guard` is `warn`
- **THEN** the remote mutation behaves as today and its result is marked unverified

### Requirement: State the limits of nonparticipating writers

The system SHALL document that cooperative coordination and atomic publication are not universal compare-and-swap against arbitrary shell, editor, direct filesystem, rename, or delete operations. Declared nonparticipants include the `bash` tool, direct `Bun.write`/`node:fs` calls in eval or runtime code, and external editors. Detected external changes before publication MUST cause refusal; an uncoordinated write after the final check remains outside the stated guarantee.

#### Scenario: External change detected before publication
- **WHEN** a nonparticipating writer changes the target before a guarded final check
- **THEN** the operation refuses to publish its stale result

#### Scenario: Demonstrated external check-to-publication race
- **WHEN** an uncoordinated writer changes the file after the final check but before publication
- **THEN** acceptance evidence records the possible lost update as a known negative guarantee
- **AND** the implementation does not advertise that test as proof of protection from arbitrary writers

### Requirement: Gate rollout on complete participating-path coverage

Rollout SHALL be controlled by a declared `files.guard` setting with values `warn` (default during rollout) and `enforce`. `enforce` SHALL NOT become the default until all declared participating local write entry points use the same conditional commit semantics. Native schemas, caller behavior, and discovered compatibility transports MUST migrate together.

#### Scenario: A declared save route still bypasses coordination
- **WHEN** an acceptance audit finds a declared participating route that can write without the common guard
- **THEN** guarded rollout is blocked until the route participates or is explicitly unavailable

#### Scenario: Historical transport documentation has no live consumer
- **WHEN** legacy marker syntax is documented but no runtime consumer exists
- **THEN** migration does not claim that syntax was implemented or preserved without verifying its current call path

### Requirement: Keep legacy forms working in warn mode

In `warn` mode, receipts, conditional create/replace, writer coordination, and atomic publication SHALL be active, while legacy path-only edits and path-and-content writes keep working with an unverified-write warning.

#### Scenario: Warn mode keeps legacy callers working
- **WHEN** `files.guard` is `warn` and an old session sends a path-only edit or path-and-content write
- **THEN** it is applied under writer coordination with a warning and a new readId

### Requirement: Roll back without uncoordinated overwrites

Rollback SHALL switch `files.guard` to `warn`, which keeps coordination and atomic publication; it MUST NOT restore uncoordinated overwrites.

#### Scenario: Rollback from enforce
- **WHEN** an operator switches `files.guard` from `enforce` back to `warn`
- **THEN** legacy forms are accepted again but still serialized and atomically published

### Requirement: Deliver in stages

Delivery SHALL proceed in stages: stage 1 covers local read/edit/write tools, the `files.write` service, and Files/Canvas saves in `warn` mode; stage 2 brings SSH writers to the same contract; stage 3 runs representative measurements and switches the default to `enforce`.

#### Scenario: Enforce before stage 3
- **WHEN** stages 1 and 2 are complete but stage 3 measurements are not
- **THEN** the default `files.guard` remains `warn`

