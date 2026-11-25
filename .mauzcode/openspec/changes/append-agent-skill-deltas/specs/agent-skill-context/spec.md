# Spec Delta

## Purpose

Keep authorized skill discovery bounded and current enough to advertise additions without rewriting the conversation prefix or loading package contents.

## ADDED Requirements

### Requirement: Stable guidance and initial catalogue
The system SHALL keep mutable inventory out of the bootstrap and advertise only scoped skill IDs, source labels and descriptions in a deterministic, bounded conversation-tail baseline. Guidance SHALL offer authorized list/search for overflow and read for on-demand content. Effective grants, workspace, source policy and section exclusions SHALL gate disclosure.

#### Scenario: Empty catalogue or excluded section
- **WHEN** an eligible agent starts with no skills and one later appears
- **THEN** the addition can appear without changing the bootstrap; an ineligible or section-excluded agent receives no skill discovery section.

### Requirement: Cumulative window budget
The baseline and subsequent catalogue lines SHALL share a maximum of 40 distinct shown entries and 6,000 rendered catalogue-line characters per window. Edits to an already shown entry SHALL consume characters but not another entry slot. Only successfully advertised metadata counts as shown. Ordinary disappearance SHALL NOT produce output or refund budget.

#### Scenario: Reappearance and rename
- **WHEN** a shown skill disappears and returns in the same scope
- **THEN** identical advertised fields produce no update; changed fields qualify for one edit relative to the last shown version. A new ID after a rename qualifies as an addition only if it fits.

#### Scenario: Bounds across turns
- **WHEN** the baseline uses all 40 slots or subsequent updates exhaust the character budget
- **THEN** no new ID can exceed either bound, edits may use remaining characters in existing slots, and explicit list/search remains available without repeated overflow notices.

### Requirement: Catalogue-only reconciliation and live access
At safe inference boundaries the system SHALL append only confirmed additions and edits to advertised metadata. Package content changes alone SHALL be silent. Publication SHALL NOT wake idle agents or change tool schemas or cache keys. Access SHALL always be checked live, including explicit commands and continuation reads; a confirmed explicit revocation may warrant a generic access warning, not a list of withdrawn IDs.

#### Scenario: Partial discovery and policy revocation
- **WHEN** one source times out or is truncated while another yields a new authorized descriptor
- **THEN** the healthy addition can appear; uncertainty causes no withdrawal. Explicitly revoked access is denied immediately without revealing denied metadata.

#### Scenario: Body-only edit
- **WHEN** instructions or resources change without changing the advertised fields
- **THEN** no discovery row is appended, regardless of earlier interactions with the package.

### Requirement: Effective-window delivery
Updates SHALL preserve the serialized prefix under otherwise fixed inputs, never split tool pairs or rewrite history, and be idempotent across retry and restart. Previews SHALL NOT consume updates. A fork SHALL respect inherited context and current grants; identities from another scope SHALL NOT be substituted. Compaction SHALL start a fresh budget and rebuild the authorized baseline.

#### Scenario: Preview, retry and compaction
- **WHEN** discovery changes during a tool batch, a preview occurs, and the next safe request is retried
- **THEN** the update follows all results exactly once; after compaction the new window starts with its own bounded baseline rather than a delta against the old window.
