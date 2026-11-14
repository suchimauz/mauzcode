## MODIFIED Requirements

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
