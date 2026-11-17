## MODIFIED Requirements

### Requirement: Agent preset definition
An agent preset SHALL have an identifier, name, description, sort order, built-in flag, allow and deny patterns, plugin grants, excluded prompt sections and a prompt addition. Built-in definitions SHALL come exclusively from shipped code; custom definitions SHALL persist exclusively in PostgreSQL. Identifiers MUST be unique non-empty kebab-case strings across both sources.

#### Scenario: Duplicate identifier
- **WHEN** a custom preset is created with the identifier of an existing custom or built-in preset
- **THEN** the operation fails and the existing definition is unchanged

#### Scenario: Custom definitions are not source files
- **WHEN** an authorized caller creates or edits a custom preset
- **THEN** its definition is persisted in PostgreSQL and no source file is generated or modified

### Requirement: Built-in presets
The system SHALL provide `standard`, `creator` and `minimal` from current shipped code, including the reviewed core catalogue used to generate Standard. Their definitions MUST NOT depend on stored preset rows. Startup and ordinary reads MUST NOT seed, repair or upgrade database copies of built-ins.

#### Scenario: Fresh installation
- **WHEN** the system starts with an empty preset table
- **THEN** all three built-ins are available with their code-generated definitions
- **AND** startup and subsequent reads leave the preset table empty

#### Scenario: Stale database copy cannot override code
- **WHEN** a legacy database row for `standard` has different description, allow rules or plugin grants
- **THEN** every effective read of `standard` returns the current code definition, not the stored row

#### Scenario: Shipped definition changes
- **WHEN** an updated built-in definition is loaded and a new agent is created using its identifier
- **THEN** the new snapshot uses the updated code definition without a preset-row update or reset
- **AND** existing agent snapshots remain unchanged

### Requirement: Preset management
The runtime SHALL list, read, create, update, delete, reset and resolve presets. Create, update and delete SHALL operate only on custom definitions; reset SHALL return a built-in's current code definition without writes and reject custom identifiers. Existing snapshot-based write permissions SHALL remain: Creator allows management, Standard and Minimal deny writes. Invalid definitions MUST be rejected; allowed non-destructive custom writes SHALL need no extra confirmation.

#### Scenario: Creator grants a plugin to Standard
- **WHEN** a Creator agent attempts to update Standard to grant `openspec`
- **THEN** the operation rejects the built-in update without writing data
- **AND** it directs the caller to create or edit a custom preset instead

#### Scenario: Creator grants a plugin to a custom preset
- **WHEN** a Creator agent updates a custom preset to grant `openspec`
- **THEN** the update succeeds without an extra confirmation prompt
- **AND** only subsequently created agents using that custom preset receive the changed rules

#### Scenario: Standard tries to edit a preset
- **WHEN** a Standard agent calls the preset update operation
- **THEN** the call fails as denied by Standard

#### Scenario: Reset compatibility
- **WHEN** an authorized caller resets `standard`
- **THEN** the operation returns the current code definition without database writes or snapshot changes

### Requirement: Owner read-only preset view
Full effective built-in and custom definitions SHALL be readable by the authenticated owner through the read-only Settings view and owner endpoint. Both SHALL use the same catalogue as snapshot resolution. New-session defaults SHALL expose only identifier, name, description and sort order, never rules or prompt content.

#### Scenario: Menu stays minimal
- **WHEN** the new-session defaults are requested
- **THEN** preset entries contain only `id`, `name`, `description` and `sortOrder`
- **AND** built-in entries come from code and custom entries come from PostgreSQL

#### Scenario: Viewing does not change snapshots
- **WHEN** the owner opens the Agent presets settings tab
- **THEN** no preset, setting or existing agent snapshot is modified

## ADDED Requirements

### Requirement: Unified effective preset catalogue
List, get, resolve, default validation, owner Settings and new-session consumers SHALL use one effective catalogue combining generated built-ins with stored custom presets, ordered by sort order then identifier. Reserved identifiers SHALL resolve to code definitions only. Unknown identifiers and missing configured defaults MUST retain their explicit errors without silent fallback.

#### Scenario: Consistent consumers
- **WHEN** a code-defined Standard and a stored custom preset are listed, selected and resolved
- **THEN** all consumers use the same definitions and ordering
- **AND** each identifier appears exactly once

#### Scenario: Missing custom default
- **WHEN** the configured default names a missing custom preset
- **THEN** Settings reports that identifier as missing and creation without an explicit preset fails
- **AND** the system does not silently select Standard

### Requirement: Built-in identity and immutability
Built-in identifiers SHALL be reserved independently of database contents. Creating, updating or deleting them MUST fail without writes and explain that customization requires a distinct custom preset. Custom presets SHALL retain existing editing and deletion behavior, including protection of the configured default. Copying built-in fields into a custom definition MUST create an independent record, not a live override.

#### Scenario: Write attempts without stored built-ins
- **WHEN** an authorized caller attempts to create, update or delete `standard` with no corresponding database row
- **THEN** the operation fails with a built-in identity error and changes no data

#### Scenario: Independent custom copy
- **WHEN** a custom preset is created from Standard fields under a new identifier and Standard later changes in code
- **THEN** the custom preset keeps its stored fields and Standard uses the updated code fields

#### Scenario: Protected custom default
- **WHEN** deletion is requested for the configured custom default
- **THEN** deletion fails and the default remains available

### Requirement: Lossless legacy preset transition
The transition SHALL remove obsolete built-in database rows only after preserving every differing definition as a distinct custom record. Comparison SHALL cover all editable fields and ignore timestamps and rule ordering. Existing custom records MUST remain intact. Migration SHALL be atomic, collision-safe and idempotent; it MUST NOT rewrite existing agent snapshots or configured default identifiers.

#### Scenario: Customized Standard is preserved
- **GIVEN** a legacy Standard grants `nrepl` and `openspec` instead of the shipped plugin list
- **WHEN** the transition runs
- **THEN** a discoverable custom preset preserves its description, sort order, allow, deny, plugins, excluded sections and prompt under a new identifier and clearly identified name
- **AND** `standard` resolves to shipped code and its obsolete database row is removed

#### Scenario: Factory-equivalent row
- **WHEN** a legacy built-in row matches current code in every editable field apart from rule ordering
- **THEN** it is removed without creating a redundant custom preset

#### Scenario: Collision and retry
- **GIVEN** the proposed preservation identifier is already occupied by a custom preset
- **WHEN** migration runs and is then repeated
- **THEN** it preserves the legacy definition under a different available identifier without overwriting the existing custom record
- **AND** the repeated run creates no further copies

#### Scenario: Atomic failure
- **WHEN** preservation or removal fails during migration
- **THEN** the transition rolls back without losing the original definitions or leaving partial copies

#### Scenario: Defaults and old agents keep their identity
- **WHEN** a customized built-in row is preserved as a custom preset
- **THEN** existing agents keep their original identifiers and snapshots
- **AND** a default of `standard` remains `standard`, meaning code-defined Standard for future agents
- **AND** documentation identifies the preserved custom preset as an explicit opt-in for future agents that need the old settings

## REMOVED Requirements

### Requirement: Built-in presets are editable and resettable
**Reason**: Editing built-ins in PostgreSQL creates a second authoritative definition and drift from shipped code.
**Migration**: Built-ins become immutable; preserve differing legacy definitions as custom records. Customize a distinct custom preset. Reset remains a read-only compatibility operation returning the shipped definition.

### Requirement: Conservative Standard default upgrade
**Reason**: Built-ins are no longer stored, so matching and upgrading historical factory rows is no longer the ongoing update mechanism.
**Migration**: Run the lossless legacy transition once. Future built-in updates come directly from code; existing custom presets and agent snapshots remain unchanged.

### Requirement: Additive OpenSpec opt-in for customized Standard
**Reason**: A mutable stored Standard no longer exists; plugin customization belongs to custom presets.
**Migration**: Preserve the legacy customized Standard, including `nrepl` and `openspec` grants, as a custom record. Apply further additive plugin changes there, preserving unrelated fields, snapshots, denies, inherited access restrictions and approval requirements.
