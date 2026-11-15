## ADDED Requirements

### Requirement: Additional Claude quota windows
The provider SHALL retain valid additional quota-window records returned by the usage endpoint, including model-specific limits, without a fixed allowlist of model names. It MUST preserve a stable source identity, a readable label and available utilization/reset data. Null, disabled or malformed entries and unrelated billing/profile objects MUST NOT become quota windows.

#### Scenario: Model-specific weekly limit
- **WHEN** the endpoint reports general five-hour and seven-day quotas plus a valid model-specific seven-day quota
- **THEN** all three windows are retained with distinct identities
- **AND** the model-specific window is not classified as the general weekly quota

#### Scenario: Previously unseen model
- **WHEN** the endpoint adds a quota-window record for a model not known to the client
- **THEN** the valid window is retained and identified using its provider name or readable source key without requiring a client model-name update

#### Scenario: Unrelated or invalid fields
- **WHEN** the payload includes null entries, explicitly disabled records, non-finite utilization or billing objects without quota-window semantics
- **THEN** those entries do not create phantom quota windows and valid windows remain available

#### Scenario: Additional-only response
- **WHEN** the endpoint returns at least one valid additional quota window and no general five-hour or seven-day window
- **THEN** usage remains available with the additional window and no general window is invented

### Requirement: Claude quota scope
The provider SHALL identify the documented general `five_hour` and `seven_day` windows as account-wide five-hour and weekly limits. Model-specific and other unrecognized windows MUST remain additional limits, even if their duration or name resembles a standard period. Missing reset data MUST NOT imply a fabricated reset time.

#### Scenario: Weekly model limit cannot replace account limit
- **WHEN** a model-specific weekly window exists without the general `seven_day` window
- **THEN** it remains an additional limit and the account-wide weekly period is absent

#### Scenario: Missing reset
- **WHEN** an otherwise valid additional window lacks a valid reset timestamp
- **THEN** its usage is retained without an invented reset time

## MODIFIED Requirements

### Requirement: Usage from response headers
After every successful inference response the provider SHALL record the `anthropic-ratelimit-unified-5h-*` and `anthropic-ratelimit-unified-7d-*` utilization and reset headers as the connection's current usage, without an extra request. A missing header MUST NOT be read as 0% used. Header-only updates MUST update only corresponding general windows, preserving cached additional windows and their original freshness without claiming those windows were refreshed.

#### Scenario: Headers update usage
- **WHEN** a stream completes with unified rate-limit headers
- **THEN** the connection usage shows those windows without calling the usage endpoint

#### Scenario: Header missing
- **WHEN** a response lacks the 7-day utilization header
- **THEN** the 7-day window is not overwritten with 0%

#### Scenario: Additional windows survive partial updates
- **GIVEN** usage contains a model-specific limit from the last successful usage-endpoint snapshot
- **WHEN** an inference response updates only general five-hour or seven-day headers
- **THEN** the additional limit remains available with its original observation time
- **AND** the header update does not claim to refresh or reset that additional limit

#### Scenario: Full snapshot replaces removed limits
- **GIVEN** a previous successful usage-endpoint snapshot contained an additional limit
- **WHEN** a newer successful complete usage-endpoint snapshot omits that limit
- **THEN** the removed limit is no longer reported
