## MODIFIED Requirements

### Requirement: Hourly background refresh
The models module SHALL refresh the cached lists of all enabled connections whose provider supports discovery and is not globally disabled every hour while the server runs, and SHALL allow disabling this with `MODELS_REFRESH=off`. Connections of disabled providers MUST be skipped without any provider request. Failures MUST be reported without secrets and MUST keep the previous cache.

#### Scenario: Hourly refresh
- **WHEN** an hour passes after start
- **THEN** every enabled discoverable connection of an enabled provider has its cache refreshed and failures are logged

#### Scenario: Disabled provider skipped
- **WHEN** the hourly refresh runs while a provider is globally disabled
- **THEN** its connections' caches are left untouched and no request is sent to that provider