## Purpose

Define owner-managed context limits for individual models on stored connections, including precedence, provenance, validation and persistence independent of provider discovery.

## ADDED Requirements

### Requirement: Effective model context limit
The system SHALL resolve the effective context limit in tokens using the exact model's owner override on its connection, then valid provider context metadata, then a fallback of 200,000. Public model-limit information SHALL distinguish provider value, nullable owner override, effective value and source (`override`, `provider`, or `fallback`). Resolving these values MUST NOT require provider network access and MUST preserve existing disabled or missing route failures.

#### Scenario: No metadata
- **WHEN** an enabled model has neither an override nor provider context metadata
- **THEN** its effective limit is 200,000 and its source is fallback

#### Scenario: Owner overrides provider
- **GIVEN** provider context metadata is 262144
- **WHEN** the owner saves 128000 for that model on that connection
- **THEN** the effective limit is 128000 with source override and the provider value remains 262144

#### Scenario: Reset follows current default
- **WHEN** the owner removes an override
- **THEN** resolution uses current provider metadata, or 200,000 if absent, rather than retaining a snapshot of the former default

### Requirement: Scoped persistent overrides
Overrides SHALL belong to a connection's stable identity and exact provider-native model ID. They MUST survive restart, connection rename, catalogue refresh failures and successful refreshes, including temporary model disappearance. Connection deletion SHALL remove its overrides. Overrides MUST NOT alter provider catalogue data or enable otherwise unavailable models.

#### Scenario: Same model on separate connections
- **WHEN** an owner overrides a model on connection A
- **THEN** the same model ID on connection B is unchanged

#### Scenario: Refresh and rename
- **WHEN** a connection with an override is renamed, its catalogue refreshed and the service restarted
- **THEN** the override remains associated with the same connection and model

#### Scenario: Temporarily absent model
- **WHEN** a model disappears from discovery and later returns
- **THEN** its saved override is retained without changing existing model availability rules

#### Scenario: Delete and recreate
- **WHEN** a connection is deleted and another is created with the same account name
- **THEN** the new connection does not inherit the deleted connection's overrides

### Requirement: Authorized validated updates
Only the authorized owner SHALL change overrides through the existing Models write security boundary, including cookie-bound CSRF for browser requests. An override MUST be a positive safe integer in tokens; null SHALL remove it. Invalid requests MUST fail without partial writes. An update SHALL modify only explicitly supplied model entries, preserving unrelated entries and availability settings. Reads and errors MUST NOT expose credentials.

#### Scenario: Invalid values
- **WHEN** an update contains zero, a negative value, a fraction, a string, or an integer beyond the safe integer range
- **THEN** it fails validation without modifying any override

#### Scenario: Patch isolation
- **WHEN** an owner updates one model while another model already has an override
- **THEN** the other model's override and all availability settings remain unchanged

#### Scenario: Unauthorized request
- **WHEN** a browser write lacks valid owner authorization or required CSRF proof
- **THEN** it is rejected and no override changes

### Requirement: Local budget semantics
Context-limit settings SHALL affect subsequent local context-budget calculations and displays consistently. Saving MUST NOT interrupt an in-flight inference, invoke inference or compaction itself, or add a context-window parameter to upstream requests. The setting MUST NOT claim to increase the upstream model's capacity.

#### Scenario: Save during inference
- **WHEN** an owner saves a new limit while an inference is in flight
- **THEN** that inference continues unchanged and the next local budget calculation uses the new limit
