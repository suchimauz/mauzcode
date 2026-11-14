## MODIFIED Requirements

### Requirement: Stable public model facade
The system SHALL expose a minimal public root model facade consisting of exactly `models.call`, `models.stream`, `models.compact`, `models.listModels`, `models.setModelEnabled`, `models.refreshAll`, `models.list`, `models.get`, `models.create`, `models.update`, `models.remove`, `models.test`, `models.usage`, `models.action`, `models.resolveRoute`, `models.tokenPrice` and `models.displayNames`, together with the existing non-forwarding root procedures `models.providers` and `models.api`. These entries SHALL preserve their typed options, return contract and observable behavior and SHALL delegate without duplicating business logic or wrapping errors into a different contract. Other root forwarding procedures SHALL NOT exist. The facade SHALL serve only consumers outside `src/models`; callers inside `src/models` SHALL use the full responsibility namespace names, including for the kept facade entries. Consumers outside `src/models` SHALL NOT call implementation namespaces. Public `types.models.*`, HTTP paths, provider ids and registration ownership SHALL remain unchanged.

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

