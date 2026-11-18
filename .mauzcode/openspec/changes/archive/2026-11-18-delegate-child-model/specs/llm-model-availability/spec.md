## ADDED Requirements

### Requirement: Selectable model listing
The system SHALL provide a read-only listing of selectable models, available to agents as the native tool `list_models`. It MUST include only non-disabled models of enabled connections of enabled providers, each with its canonical route, label and supported reasoning levels. It MUST use cached or manual model lists only, send no provider request and expose no secret values.

#### Scenario: Disabled model hidden
- **WHEN** the owner disabled one model of an enabled connection
- **THEN** the listing contains the connection's other models and not the disabled one

#### Scenario: Disabled provider hidden
- **WHEN** a provider is globally disabled
- **THEN** the listing contains no route of that provider

#### Scenario: No network
- **WHEN** an agent calls `list_models`
- **THEN** the result is built without any provider request
