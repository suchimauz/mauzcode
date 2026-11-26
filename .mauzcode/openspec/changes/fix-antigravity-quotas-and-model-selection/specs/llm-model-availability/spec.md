## MODIFIED Requirements

### Requirement: Per-connection model disabling
The owner SHALL be able to disable and re-enable an individual model id of a connection. The disabled set MUST be stored durably with the connection, MUST be idempotent per model, and MUST NOT remove the model from the connection's model list. Model ids MUST be non-empty, at most 200 characters and contain no whitespace. A native member ID of a known Antigravity group on that connection is not an individually configurable model: disabling or enabling it MUST fail with a validation error naming the group ID and MUST NOT change stored settings; the group ID itself and standalone models remain configurable.

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

#### Scenario: Member of an Antigravity group
- **WHEN** the owner disables or enables a native member ID that the connection's current catalogue assigns to an Antigravity group
- **THEN** the request fails with a validation error naming that group ID, and the disabled set and updated time stay unchanged
- **AND** disabling the group ID, a standalone Antigravity model or a model of another provider still succeeds as before

### Requirement: Sole model availability policy
Per-connection disabled models, connection enablement and global provider enablement SHALL be the only policy that decides whether a model may be selected or called. Model pickers MUST hide disabled models, models of disabled connections and models of disabled providers, and every agent turn, model change, compaction and one-shot call MUST refuse them before any provider request. Models settings MUST retain disabled entries for management; an Antigravity group SHALL be managed as one entry, not as its member efforts.

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
- **AND** a disabled Antigravity group appears as one disabled entry with a single switch, without separate entries for its member efforts

#### Scenario: One-shot call to a disabled model
- **WHEN** a one-shot call targets a disabled model
- **THEN** it fails with `MODEL_DISABLED_BY_USER` and no provider request is sent
