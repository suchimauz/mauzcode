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
Every streaming, compaction, one-shot and exact token-count request SHALL read current availability before contacting the provider, including credential-refreshing connection resolution. The provider check MUST precede connection and model checks. Refused requests MUST send no provider request; refused token counting MUST return no count.

#### Scenario: Session already using the model
- **GIVEN** a session that has already made requests with a model
- **WHEN** the owner disables that model and the session makes its next request
- **THEN** the request fails with `Model <model> is disabled by user` and no provider request is sent

#### Scenario: Disabled connection
- **WHEN** a request targets a model of a disabled connection
- **THEN** it fails with code `CONNECTION_DISABLED` and no provider request is sent

#### Scenario: Session already using a disabled provider's model
- **GIVEN** a session that has already made requests with a model of provider `codex`
- **WHEN** the owner disables provider `codex` and the session makes its next request
- **THEN** the request fails with `Provider codex is disabled`, code `PROVIDER_DISABLED`, not retryable, and no provider request is sent

#### Scenario: No retry can revive the request
- **WHEN** any retry policy evaluates a `PROVIDER_DISABLED` failure
- **THEN** the failure is never retried and the turn stops with the error

#### Scenario: Re-enabled model
- **WHEN** the model is re-enabled and the session makes another request
- **THEN** the request is passed to the provider

#### Scenario: Re-enabled provider
- **WHEN** the provider is re-enabled and a session using its model makes another request
- **THEN** the request is passed to the provider without any change to the session's stored model

### Requirement: Disabled inference error contract
A disabled model MUST fail with `Model <model> is disabled by user`, code `MODEL_DISABLED_BY_USER`, not retryable. A disabled connection MUST fail with `CONNECTION_DISABLED`. A globally disabled provider MUST fail with `Provider <provider> is disabled`, code `PROVIDER_DISABLED`, not retryable. No retry policy configuration SHALL make `PROVIDER_DISABLED` retryable.

#### Scenario: Disabled model error
- **WHEN** an inference request targets a disabled model
- **THEN** it fails with `Model <model> is disabled by user`, code `MODEL_DISABLED_BY_USER`, marked not retryable

#### Scenario: Disabled provider error cannot be retried
- **WHEN** an inference request targets a globally disabled provider under any retry policy
- **THEN** it fails with `Provider <provider> is disabled`, code `PROVIDER_DISABLED`, and is never retried

### Requirement: Sole model availability policy
Per-connection disabled models, connection enablement and global provider enablement SHALL be the only policy that decides whether a model may be selected or called. Model pickers MUST hide disabled models, models of disabled connections and models of disabled providers, and every agent turn, model change, compaction and one-shot call MUST refuse them before any provider request. Models settings MUST retain disabled entries for management.

#### Scenario: Disabled model in a picker
- **WHEN** the owner opens any model picker after disabling `gpt-6-sol` on a codex connection
- **THEN** that connection's `gpt-6-sol` is absent from both the unfiltered list and search results

#### Scenario: Disabled connection
- **WHEN** the owner opens a picker with a disabled connection
- **THEN** neither its models nor its group heading or unavailable-catalogue placeholder are shown

#### Scenario: Disabled provider in a picker
- **WHEN** the owner opens any model picker after disabling provider `codex`
- **THEN** no `codex` model, group heading or unavailable-catalogue placeholder is shown, in the unfiltered list or search results, while other providers stay listed

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

### Requirement: Global provider disabling
The owner SHALL be able to disable and re-enable a registered model provider for the whole instance. Disabling MUST be idempotent per provider and MUST NOT delete or modify the provider's connections, their enabled flags, their disabled-model sets or their secrets. Re-enabling SHALL fully restore selection and inference without any connection change.

#### Scenario: Disable a provider
- **WHEN** the owner disables provider `codex`
- **THEN** `codex` is recorded in `models.disabledProviders` and every `codex` connection stays stored unchanged

#### Scenario: Disable twice
- **WHEN** the owner disables the same provider twice
- **THEN** the provider appears once in the disabled set and no error is raised

#### Scenario: Re-enable a provider
- **WHEN** the owner re-enables a disabled provider
- **THEN** its id is removed from the set and its enabled connections' models are selectable and callable again

### Requirement: Disabled provider set storage
The disabled set SHALL be stored durably as the declared global setting `models.disabledProviders`, a JSON array of provider id strings; writes MUST reject any other shape. Validation SHALL check shape only: ids of providers that are not currently registered SHALL be kept and ignored, so an unloaded plugin provider returns disabled.

#### Scenario: Invalid stored value
- **WHEN** a write sets `models.disabledProviders` to a non-array or an array containing a non-string or blank entry
- **THEN** the write is rejected with a validation error

#### Scenario: Unregistered provider id in the stored set
- **GIVEN** `models.disabledProviders` contains `old-plugin`, which is not registered
- **WHEN** the setting is read, validated or written with another provider toggle
- **THEN** no error is raised, `old-plugin` is kept, and it has no effect until a provider with that id is registered, which then starts disabled

### Requirement: Provider disablement admission
Disablement is an admission check: operations admitted before the successful write may finish; checks reading the setting after it MUST block provider invocation. Existing streams are not cancelled.

#### Scenario: In-flight operation during disablement
- **GIVEN** an operation has passed its provider availability check before the disable write succeeds
- **WHEN** the owner disables that provider
- **THEN** the admitted operation may finish, even if provider invocation starts later; existing streams are not cancelled
- **AND** any availability check reading the setting after the successful write blocks provider invocation; the next inference request performs a fresh check

### Requirement: Provider toggle serialization
Concurrent toggles SHALL be serialized so no toggle is lost. A failed write MUST NOT prevent subsequent toggles from executing.

#### Scenario: Failed toggle does not poison the queue
- **GIVEN** a toggle write fails and reports that failure to its caller
- **WHEN** a later valid toggle is submitted after the failure condition is removed
- **THEN** it completes and persists normally

#### Scenario: Concurrent toggles
- **WHEN** the owner disables `codex` and `qwen` in two simultaneous requests
- **THEN** both ids are in the stored set afterwards

### Requirement: Provider toggle fixed by instance file
When `models.disabledProviders` is fixed by an instance settings file, toggles MUST be refused with code `SETTING_FIXED` and the value left unchanged.

#### Scenario: Setting fixed by an instance file
- **GIVEN** `models.disabledProviders` is fixed by an instance settings file
- **WHEN** the owner toggles a provider
- **THEN** the toggle fails with `SETTING_FIXED` naming the file and the effective set is unchanged

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
