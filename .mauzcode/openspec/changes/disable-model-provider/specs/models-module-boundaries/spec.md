## MODIFIED Requirements

### Requirement: Stable public model facade
The system SHALL expose a minimal public root model facade consisting of exactly `models.call`, `models.stream`, `models.compact`, `models.listModels`, `models.setModelEnabled`, `models.refreshAll`, `models.list`, `models.get`, `models.create`, `models.update`, `models.remove`, `models.test`, `models.usage`, `models.action`, `models.resolveRoute`, `models.tokenPrice` and `models.displayNames`, plus the non-forwarding root procedures `models.providers`, `models.disabledProviders` and `models.api`. `models.providers` SHALL keep its synchronous declaration-catalogue contract unchanged; `models.disabledProviders` SHALL be an asynchronous read-through reader returning the normalized disabled set.

#### Scenario: Existing consumer calls a moved procedure
- **WHEN** a core or plugin consumer calls one of the minimal facade entries
- **THEN** the call reaches the implementation with the same options, callbacks, cancellation signal and return/error semantics
- **AND** the consumer requires no migration

#### Scenario: Removed forwarding procedure
- **WHEN** the runtime function catalogue is inspected after the change
- **THEN** no root model procedure other than the minimal facade, `models.providers`, `models.disabledProviders` and `models.api` is present
- **AND** no project caller references a removed root name

#### Scenario: Live runtime after facade removal
- **WHEN** the change is applied without restarting a runtime that previously loaded the removed procedures and its in-flight model operations have drained
- **THEN** the removed root forwarding procedures and the replaced provider-local custom protocol procedure are absent from the live runtime registry
- **AND** custom discovery and testing reach the new shared protocol implementations
- **AND** the remaining model procedure names match those discovered on a fresh boot

#### Scenario: Provider catalogue contract unchanged
- **WHEN** the runtime function catalogue and project callers are inspected after the change
- **THEN** `models.providers` is still synchronous with no call-site changes, and enablement is read only through `models.disabledProviders`
