# models-module-boundaries Specification

## Purpose
Organize model implementations by provider, transport, catalogue, connections and inference while preserving public procedure contracts, shared state ownership and runtime discovery and hot-reload compatibility. Existing core and plugin consumers can continue using the stable models facade without storage, credential or API migration.

## Requirements

### Requirement: Stable public model facade
The system SHALL expose a minimal public root model facade consisting of exactly `models.call`, `models.stream`, `models.compact`, `models.listModels`, `models.setModelEnabled`, `models.refreshAll`, `models.list`, `models.get`, `models.create`, `models.update`, `models.remove`, `models.test`, `models.usage`, `models.action`, `models.resolveRoute`, `models.tokenPrice` and `models.displayNames`, plus the non-forwarding root procedures `models.providers` and `models.api`.

#### Scenario: Existing consumer calls a moved procedure
- **WHEN** a core or plugin consumer calls one of the minimal facade entries
- **THEN** the call reaches the implementation with the same options, callbacks, cancellation signal and return/error semantics
- **AND** the consumer requires no migration

#### Scenario: Removed forwarding procedure
- **WHEN** the runtime function catalogue is inspected after the change
- **THEN** no root model procedure other than the minimal facade, `models.providers` and `models.api` is present
- **AND** no project caller references a removed root name

#### Scenario: Live runtime after facade removal
- **WHEN** the change is applied without restarting a runtime that previously loaded the removed procedures and its in-flight model operations have drained
- **THEN** the removed root forwarding procedures and the replaced provider-local custom protocol procedure are absent from the live runtime registry
- **AND** custom discovery and testing reach the new shared protocol implementations
- **AND** the remaining model procedure names match those discovered on a fresh boot

### Requirement: Facade entries delegate unchanged
Root forwarding procedures other than the facade SHALL NOT exist. Facade entries SHALL preserve their typed options, return contract and observable behavior and SHALL delegate without duplicating business logic or wrapping errors into a different contract.

#### Scenario: Facade error passes through
- **WHEN** the implementation procedure behind a facade entry fails
- **THEN** the caller receives the same error contract as from the implementation

### Requirement: Facade consumers and stable public contracts
The facade SHALL serve only consumers outside `src/models`; callers inside `src/models` SHALL use the full responsibility namespace names, including for the kept facade entries. Consumers outside `src/models` SHALL NOT call implementation namespaces. Public `types.models.*`, HTTP paths, provider ids and registration ownership SHALL remain unchanged.

#### Scenario: Existing provider compiles against the SDK
- **WHEN** a provider declaration references existing `types.models.*` contracts
- **THEN** those names remain available with compatible structure after type generation

#### Scenario: One-shot call through the facade
- **WHEN** a consumer outside `src/models` calls `models.call`
- **THEN** the call reaches `models.inference.call` with the same options, cancellation signal and return/error semantics

#### Scenario: Route facade entries
- **WHEN** a consumer outside `src/models` calls `models.resolveRoute` or `models.tokenPrice`
- **THEN** the call reaches its single implementation namespace procedure with unchanged options and return/error semantics

#### Scenario: Consumer reaches into an implementation namespace
- **WHEN** code outside `src/models` calls a `models.inference.*`, `models.connections.*`, `models.catalog.*`, `models.transport.*`, `models.protocol.*` or `models.provider.*` procedure
- **THEN** the architecture check fails and names the caller

### Requirement: Responsibility-focused implementation namespaces
Model implementation procedures SHALL be organized by connection management, transport, inference, catalogue, shared wire protocols and provider-specific responsibilities. Shared protocols SHALL live in `models.protocol`. Provider implementations SHALL use `models.provider.claude`, `models.provider.codex` and `models.provider.custom`, without colliding with the existing `models.providers` function.

#### Scenario: Complete file disposition
- **WHEN** the refactoring is reviewed
- **THEN** the file disposition inventory accounts for every original model file and names its destination, explicit retention or removal
- **AND** new files have one documented responsibility and associated verification

#### Scenario: Existing provider catalogue remains callable
- **WHEN** runtime discovery registers the implementation namespaces, including `models.protocol`
- **THEN** `models.providers` remains the existing callable catalogue operation
- **AND** no namespace shadows a callable root entry

### Requirement: One procedure per file through ctx.fns
Each model runtime procedure SHALL retain one function per file and invoke other project procedures through `ctx.fns` rather than project-file imports.

#### Scenario: Procedure calls another model procedure
- **WHEN** a model procedure needs another project procedure
- **THEN** it calls it through `ctx.fns` and its file defines only that one procedure

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

### Requirement: Models owns only model data
Model procedures SHALL read and write only model-owned storage (connections, model caches, model settings and model secrets). Changes that affect other modules' data, such as a connection rename that invalidates stored model routes, MUST be announced through a published event, and the owning module MUST apply its own update.

#### Scenario: Connection rename
- **WHEN** a connection's account name changes
- **THEN** models publishes a rename event carrying provider, old and new account names, and performs no write to agent storage
