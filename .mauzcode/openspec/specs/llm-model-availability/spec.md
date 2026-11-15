# llm-model-availability Specification

## Purpose
Let the owner disable individual models of a model connection and guarantee that every inference request through the models module refuses disabled models and connections.

## Requirements

### Requirement: Per-connection model disabling
The owner SHALL be able to disable and re-enable an individual model id of a connection. The disabled set MUST be stored durably with the connection, MUST be idempotent per model, and MUST NOT remove the model from the connection's model list. Model ids MUST be non-empty, at most 200 characters and contain no whitespace.

#### Scenario: Disable a model
- **WHEN** the owner disables model `gpt-5` of a connection
- **THEN** the connection reports `gpt-5` among its disabled models and the model list still contains `gpt-5` marked as disabled

#### Scenario: Disable twice
- **WHEN** the owner disables the same model twice
- **THEN** the model appears once in the disabled set and no error is raised

#### Scenario: Re-enable a model
- **WHEN** the owner re-enables a disabled model
- **THEN** the model is no longer in the disabled set and is no longer marked as disabled

#### Scenario: Invalid model id
- **WHEN** the model id is empty, contains whitespace or is longer than 200 characters
- **THEN** the request fails with a validation error and nothing is stored

### Requirement: Enforcement on every inference request
Every streaming or compaction request through the models inference entry point SHALL read the current stored state before contacting the provider. A disabled model MUST fail with the message `Model <model> is disabled by user`, code `MODEL_DISABLED_BY_USER`, marked not retryable. A disabled connection MUST fail with code `CONNECTION_DISABLED`. In both cases no provider request MUST be sent.

#### Scenario: Session already using the model
- **GIVEN** a session that has already made requests with a model
- **WHEN** the owner disables that model and the session makes its next request
- **THEN** the request fails with `Model <model> is disabled by user` and no provider request is sent

#### Scenario: Disabled connection
- **WHEN** a request targets a model of a disabled connection
- **THEN** it fails with code `CONNECTION_DISABLED` and no provider request is sent

#### Scenario: Re-enabled model
- **WHEN** the model is re-enabled and the session makes another request
- **THEN** the request is passed to the provider

### Requirement: Sole model availability policy
Per-connection disabled models and connection enablement SHALL be the only policy that decides whether a model may be selected or called. Model pickers MUST hide disabled models and models of disabled connections, and every agent turn, model change, compaction and one-shot call MUST refuse them before any provider request. Models settings MUST retain disabled entries for management.

#### Scenario: Disabled model in a picker
- **WHEN** the owner opens any model picker after disabling `gpt-6-sol` on a codex connection
- **THEN** that connection's `gpt-6-sol` is absent from both the unfiltered list and search results

#### Scenario: Disabled connection
- **WHEN** the owner opens a picker with a disabled connection
- **THEN** neither its models nor its group heading or unavailable-catalogue placeholder are shown

#### Scenario: Empty groups and catalogue
- **WHEN** filtering disabled choices leaves a connection with no models
- **THEN** its empty group is omitted, and if no selectable models or enabled unavailable-catalogue notices remain the picker shows an empty-state message

#### Scenario: Re-enabled model
- **WHEN** the owner re-enables a model on an enabled connection and reloads the picker catalogue
- **THEN** that model is available for selection again

#### Scenario: Settings management remains available
- **WHEN** the owner opens the Models settings list containing disabled models
- **THEN** those models remain visible, marked disabled, and can be re-enabled

#### Scenario: One-shot call to a disabled model
- **WHEN** a one-shot call targets a disabled model
- **THEN** it fails with `MODEL_DISABLED_BY_USER` and no provider request is sent
