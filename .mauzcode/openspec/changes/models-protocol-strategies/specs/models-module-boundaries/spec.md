## MODIFIED Requirements

### Requirement: Stable public model facade
The system SHALL expose a minimal public root model facade consisting of exactly `models.stream`, `models.compact`, `models.listModels`, `models.setModelEnabled`, `models.refreshAll`, `models.list`, `models.get`, `models.create`, `models.update`, `models.remove`, `models.test`, `models.usage` and `models.action`, together with the existing non-forwarding root procedures `models.providers` and `models.api`. These entries SHALL preserve their typed options, return contract and observable behavior and SHALL delegate without duplicating business logic or wrapping errors into a different contract. Other root forwarding procedures SHALL NOT exist; internal callers SHALL use the full responsibility namespace names. Public `types.models.*`, HTTP paths, provider ids and registration ownership SHALL remain unchanged.

#### Scenario: Existing consumer calls a moved procedure
- **WHEN** a core or plugin consumer calls one of the minimal facade entries
- **THEN** the call reaches the implementation with the same options, callbacks, cancellation signal and return/error semantics
- **AND** the consumer requires no migration

#### Scenario: Removed forwarding procedure
- **WHEN** the runtime function catalogue is inspected after the change
- **THEN** no root model procedure other than the minimal facade, `models.providers` and `models.api` is present
- **AND** no project caller references a removed root name

#### Scenario: Existing provider compiles against the SDK
- **WHEN** a provider declaration references existing `types.models.*` contracts
- **THEN** those names remain available with compatible structure after type generation

### Requirement: Responsibility-focused implementation namespaces
Model implementation procedures SHALL be organized by connection management, transport, inference, catalogue, shared wire protocols and provider-specific responsibilities. Shared protocols SHALL live in `models.protocol`. Provider implementations SHALL use `models.provider.claude`, `models.provider.codex` and `models.provider.custom`, without colliding with the existing `models.providers` function. Each runtime procedure SHALL retain one function per file and invoke other project procedures through `ctx.fns` rather than project-file imports.

#### Scenario: Complete file disposition
- **WHEN** the refactoring is reviewed
- **THEN** the file disposition inventory accounts for every original model file and names its destination, explicit retention or removal
- **AND** new files have one documented responsibility and associated verification

#### Scenario: Existing provider catalogue remains callable
- **WHEN** runtime discovery registers the implementation namespaces, including `models.protocol`
- **THEN** `models.providers` remains the existing callable catalogue operation
- **AND** no namespace shadows a callable root entry
