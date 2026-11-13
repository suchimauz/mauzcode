# models-module-boundaries Specification

## Purpose
Organize model implementations by provider, transport, catalogue, connections and inference while preserving public procedure contracts, shared state ownership and runtime discovery and hot-reload compatibility. Existing core and plugin consumers can continue using the stable models facade without storage, credential or API migration.

## Requirements

### Requirement: Stable public model facade
The system SHALL preserve every existing root model procedure name and its typed options, return contract and observable behavior when relocating its implementation. Public `types.models.*`, HTTP paths, provider ids and registration ownership SHALL remain unchanged. Compatibility facades SHALL delegate without duplicating business logic or wrapping errors into a different contract.

#### Scenario: Existing consumer calls a moved procedure
- **WHEN** an existing core or plugin consumer calls its original `ctx.fns.models.*` entry point
- **THEN** the call reaches the reorganized implementation with the same options, callbacks, cancellation signal and return/error semantics
- **AND** the consumer requires no migration

#### Scenario: Existing provider compiles against the SDK
- **WHEN** a provider declaration references existing `types.models.*` contracts
- **THEN** those names remain available with compatible structure after type generation

### Requirement: Responsibility-focused implementation namespaces
Model implementation procedures SHALL be organized by connection management, transport, inference, catalogue and provider-specific protocol responsibilities. Provider implementations SHALL use `models.provider.claude`, `models.provider.codex` and `models.provider.custom`, without colliding with the existing `models.providers` function. Each runtime procedure SHALL retain one function per file and invoke other project procedures through `ctx.fns` rather than project-file imports.

#### Scenario: Complete file disposition
- **WHEN** the refactoring is reviewed
- **THEN** the file disposition inventory accounts for every original model file and names its destination or explicit retention
- **AND** new files have one documented responsibility and associated verification

#### Scenario: Existing provider catalogue remains callable
- **WHEN** runtime discovery registers the new provider implementation namespaces
- **THEN** `models.providers` remains the existing callable catalogue operation
- **AND** no namespace shadows a callable root entry

### Requirement: Stable registration and persistence boundaries
The system SHALL retain root routes, migrations, lifecycle files, provider declarations, state ownership and public model types at their existing identities. The reorganization SHALL NOT change database schema, stored connection values, secret references, transport selection, approval or authorization behavior.

#### Scenario: Saved connection survives deployment
- **WHEN** a connection created before the refactoring is loaded afterward
- **THEN** its provider, transport, enabled state and credential references remain valid without data migration
- **AND** its public projection still excludes secret values

#### Scenario: Provider declaration reload
- **WHEN** the existing owner module reloads its provider declarations
- **THEN** the same provider ids and ownership rules remain in force
- **AND** provider operation dispatch reaches the current internal procedures

### Requirement: Explicit nested runtime loading
The system SHALL discover all reorganized model procedures on cold boot and SHALL support reloading an individual internal procedure without restarting. Deployment instructions SHALL explicitly reload affected procedures or exact slash-delimited module directories and SHALL NOT assume that reloading `models` recursively reloads nested implementations or removes stale entries.

#### Scenario: Cold boot without stale registry entries
- **WHEN** a fresh runtime starts from the reorganized source tree
- **THEN** all facade targets resolve and provider operations work without depending on earlier loaded entries

#### Scenario: Nested implementation changes
- **WHEN** an internal procedure is hot-reloaded by its full dotted procedure name
- **THEN** subsequent calls through the original public facade and provider declaration use the updated implementation

### Requirement: Preserved inference and transport safeguards
The reorganization SHALL preserve existing provider protocol, stream event ordering, input validation, checkpoint and continuation identity, reasoning normalization, token and quota observations, cancellation, timeout and error behavior. Disabled connections/models and unsupported capabilities SHALL retain their pre-network rejection behavior. Transport failures SHALL NOT trigger a direct fallback.

#### Scenario: Disabled model remains guarded
- **WHEN** a stream request targets a disabled connection or model
- **THEN** it fails with its existing disabled-state error before contacting a provider

#### Scenario: Saved transport fails
- **WHEN** the selected proxy or SSH tunnel cannot execute a provider request
- **THEN** the request returns the established transport failure
- **AND** no direct retry is made

#### Scenario: Continuation belongs to another request identity
- **WHEN** a continuation state fails existing provider, connection, session or run binding checks
- **THEN** the existing input failure occurs without a provider request

### Requirement: Verifiable module boundaries
The refactoring SHALL include a complete source-to-destination map, external consumer inventory and regression test matrix. Architecture checks SHALL reject missing runtime targets, new project-file cross-imports and namespace collisions. Compatibility tests SHALL cover both original public entry points and the new internal targets. Existing behavior specifications SHALL remain regression constraints rather than being weakened to accommodate restructuring.

#### Scenario: Validation catches a missed move
- **WHEN** a migrated caller refers to a target absent from fresh discovery
- **THEN** architecture or cold-boot validation fails before the change is accepted

#### Scenario: Incremental migration stays compatible
- **WHEN** a responsibility group is migrated independently
- **THEN** its tests and public facade compatibility checks pass before the next group moves
- **AND** unrelated pre-existing quality failures are recorded separately from new regressions
