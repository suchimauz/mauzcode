## ADDED Requirements

### Requirement: Global provider disabling
The owner SHALL be able to disable and re-enable a registered model provider for the whole instance. The disabled set SHALL be stored durably as the declared global setting `models.disabledProviders`, a JSON array of provider id strings; writes MUST reject any other shape. Validation SHALL check shape only: ids of providers that are not currently registered SHALL be kept and ignored, so an unloaded plugin provider returns disabled. Concurrent toggles SHALL be serialized so no toggle is lost. A failed write MUST NOT prevent subsequent toggles from executing. Disablement is an admission check: operations admitted before the successful write may finish; checks reading the setting after it MUST block provider invocation. Existing streams are not cancelled. When the value is fixed by an instance settings file, toggles MUST be refused with code `SETTING_FIXED` and the value left unchanged. Disabling MUST be idempotent per provider and MUST NOT delete or modify the provider's connections, their enabled flags, their disabled-model sets or their secrets. Re-enabling SHALL fully restore selection and inference without any connection change.

#### Scenario: Disable a provider
- **WHEN** the owner disables provider `codex`
- **THEN** `codex` is recorded in `models.disabledProviders` and every `codex` connection stays stored unchanged

#### Scenario: Disable twice
- **WHEN** the owner disables the same provider twice
- **THEN** the provider appears once in the disabled set and no error is raised

#### Scenario: Re-enable a provider
- **WHEN** the owner re-enables a disabled provider
- **THEN** its id is removed from the set and its enabled connections' models are selectable and callable again

#### Scenario: Invalid stored value
- **WHEN** a write sets `models.disabledProviders` to a non-array or an array containing a non-string or blank entry
- **THEN** the write is rejected with a validation error

#### Scenario: Unregistered provider id in the stored set
- **GIVEN** `models.disabledProviders` contains `old-plugin`, which is not registered
- **WHEN** the setting is read, validated or written with another provider toggle
- **THEN** no error is raised, `old-plugin` is kept, and it has no effect until a provider with that id is registered, which then starts disabled

#### Scenario: In-flight operation during disablement
- **GIVEN** an operation has passed its provider availability check before the disable write succeeds
- **WHEN** the owner disables that provider
- **THEN** the admitted operation may finish, even if provider invocation starts later; existing streams are not cancelled
- **AND** any availability check reading the setting after the successful write blocks provider invocation; the next inference request performs a fresh check

#### Scenario: Failed toggle does not poison the queue
- **GIVEN** a toggle write fails and reports that failure to its caller
- **WHEN** a later valid toggle is submitted after the failure condition is removed
- **THEN** it completes and persists normally

#### Scenario: Concurrent toggles
- **WHEN** the owner disables `codex` and `qwen` in two simultaneous requests
- **THEN** both ids are in the stored set afterwards

#### Scenario: Setting fixed by an instance file
- **GIVEN** `models.disabledProviders` is fixed by an instance settings file
- **WHEN** the owner toggles a provider
- **THEN** the toggle fails with `SETTING_FIXED` naming the file and the effective set is unchanged

## MODIFIED Requirements

### Requirement: Enforcement on every inference request
Every streaming or compaction request through the models inference entry point SHALL read the current stored state before contacting the provider. A disabled model MUST fail with the message `Model <model> is disabled by user`, code `MODEL_DISABLED_BY_USER`, marked not retryable. A disabled connection MUST fail with code `CONNECTION_DISABLED`. A model of a globally disabled provider MUST fail with the message `Provider <provider> is disabled`, code `PROVIDER_DISABLED`, marked not retryable, and the provider check SHALL precede the connection and model checks. In all cases no provider request MUST be sent, including connection resolution that could refresh credentials. One-shot calls and exact token counting SHALL apply the same checks; token counting returns no count for a refused request. `PROVIDER_DISABLED` SHALL be a never-retryable failure code: no retry policy configuration can make it retryable.

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