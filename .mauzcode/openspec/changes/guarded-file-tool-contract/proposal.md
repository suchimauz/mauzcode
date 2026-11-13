# Proposal

## Why

The current file tools do not reliably bind an edit to the file version actually read by the agent: local read/transform/write can lose concurrent updates, while matching text or line anchors does not establish surrounding identity or preconditions. Explicit receipt-bound operations and a shared conditional commit path address these gaps without replacing the existing editing engines with a patch-only tool.

## What Changes

- **BREAKING**: evolve the current `read`, `edit`, and `write` tools in place; do not introduce a competing permanent tool set. Preserve ordinary text/range, image, and host-aware reading.
- Text reads return opaque, expiring `readId` receipts bound to the authenticated owner, agent/session, workspace, host, canonical file identity, exact version, and delivered content scope. Receipts never replace authorization.
- **BREAKING**: `edit` requires `readId` and an explicit homogeneous `literal` or `anchor` mode, without independent `path`/`host`. Reject blind edits, mixed/no-op/overlapping operations, and incompatible fields.
- **BREAKING**: `write` distinguishes create-if-absent from full replacement using a current full-file receipt. Existing-file unconditional overwrite is not a guard bypass.
- Return structured outcomes, bounded authorized fresh evidence on conflicts, and idempotent receipt-backed success replay within the live receipt lifetime.
- Serialize participating local and SSH writers under one target identity; validate the version inside the commit path and publish a single file atomically. Include Files and Canvas save paths without weakening their authentication, ownership, or CSRF checks.
- Migrate schemas, guidelines, callers, and verified live transports together. Reject stale path-only edits rather than silently accepting the old unsafe contract.

## Capabilities

### New Capabilities

- `file-read-receipts`: owner- and target-bound evidence of exact file versions and delivered editable ranges, including lifecycle and authorized refresh.
- `guarded-file-edits`: explicit receipt-bound literal/anchor operations, validation, structured edit outcomes, and retry behavior.
- `conditional-file-writes`: absence-checked creation, receipt-backed replacement, shared local/SSH commit coordination, writer participation, and publication guarantees.

### Modified Capabilities

None. Existing published capabilities do not specify these file-tool behaviors.

## Impact

Affected surfaces include tool definitions and validation, file read/edit/write services, SSH writing, Files/Canvas save contracts, and native tool transports/callers. No dependency addition is mandated. Existing persisted conversations are not rewritten; old mutation requests must fail safely with migration guidance.

This change currently contains specifications only. Implementation requires separate authorization. No runtime changes, settings changes, commits, pushes, or archive operations are part of preparing these artifacts.

Out of scope: adopting Codex or a patch-only engine, multi-file transactions, arbitrary shell/editor serialization, universal filesystem compare-and-swap, crash-proof exactly-once semantics, and treating benchmark fixtures as production evidence. Unsupported identity/metadata/transport guarantees must fail closed; local or SSH support cannot be claimed before its acceptance gates pass.
