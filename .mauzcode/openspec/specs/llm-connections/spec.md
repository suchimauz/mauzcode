# llm-connections Specification

## Purpose
Stores and manages LLM connections — configured accounts of a registered provider — with stable identity, display names, secret handling, testing, model discovery and usage reporting.

## Requirements

### Requirement: Connection identity and account name
Each connection SHALL have a system-generated unique identifier and a required, non-empty display account name of at most 100 characters; account names MUST NOT be required to be unique.

#### Scenario: Two connections with the same name
- **WHEN** the owner creates two connections of the same provider both named `work`
- **THEN** both are stored with different identifiers and both are listed

#### Scenario: Empty account name
- **WHEN** the owner creates a connection with a blank account name
- **THEN** creation fails with a validation error and nothing is stored

### Requirement: Connection creation and validation
The system SHALL create a connection only for a registered provider, after validating fields against the provider schema and the provider's own validation, and only with a transport the provider allows. Creation MUST be rejected while the provider is globally disabled; listing, updating, removing and re-enabling existing connections of a disabled provider SHALL remain available.

#### Scenario: Unknown provider
- **WHEN** the owner creates a connection for a provider id that is not registered
- **THEN** creation fails with an unknown-provider error

#### Scenario: Missing required field
- **WHEN** a required field of the provider schema is missing
- **THEN** creation fails with an error naming that field

#### Scenario: Unknown field
- **WHEN** the submitted configuration contains a key not in the provider schema
- **THEN** creation fails with a validation error

#### Scenario: Disabled provider
- **WHEN** the owner creates a connection for a globally disabled provider
- **THEN** creation fails with code `PROVIDER_DISABLED` (409) and nothing is stored

#### Scenario: Managing existing connections of a disabled provider
- **WHEN** the owner lists, edits, removes or toggles a stored connection of a disabled provider
- **THEN** the operation works exactly as for an enabled provider

### Requirement: Secret storage
Secret field values SHALL be stored in the encrypted secret store and referenced from the connection; connection reads MUST expose only whether each secret is set, never its value.

#### Scenario: Reading a connection with an API key
- **WHEN** a client lists connections
- **THEN** each secret field is reported as set or not set and no secret value appears in the response

#### Scenario: Keeping an existing secret on update
- **WHEN** the owner updates a connection without supplying a secret field
- **THEN** the stored secret is kept unchanged

#### Scenario: Clearing a secret
- **WHEN** the owner updates a connection explicitly clearing an optional secret field
- **THEN** the stored secret is deleted and the field reports not set

### Requirement: Connection removal
Removing a connection SHALL delete its record and all secrets it owns.

#### Scenario: Remove connection
- **WHEN** the owner removes a connection
- **THEN** it disappears from the list and its secrets no longer exist in the secret store

### Requirement: Enable and disable
A connection SHALL have an enabled flag; disabled connections MUST stay listed but MUST NOT perform network requests for tests, model listing or usage.

#### Scenario: Testing a disabled connection
- **WHEN** the owner tests a disabled connection
- **THEN** the result is status `disabled` and no network request is made

### Requirement: Connection test
The system SHALL test a connection by calling its provider's test operation and return a status of `available`, `unavailable` or `configured` with a machine-readable reason, a short safe message and the check time. A disabled connection or a connection of a globally disabled provider MUST return status `disabled` without any network request.

#### Scenario: Provider test fails
- **WHEN** the provider test throws or reports failure
- **THEN** the result is `unavailable` with a reason and a message that contains no secret values

#### Scenario: Disabled provider test
- **WHEN** the owner tests a connection whose provider is globally disabled
- **THEN** the result is status `disabled` with a provider-disabled message and no network request is made

### Requirement: Model listing
The system SHALL return a connection's models from the provider's model listing when it is implemented, and otherwise the models stored in the connection's configuration.

#### Scenario: Provider without model listing
- **WHEN** the provider does not implement model listing
- **THEN** the models configured manually on the connection are returned

### Requirement: Usage report with status fallback
The system SHALL return a standard usage report per connection: status, optional quota windows (label, used percent, remaining, reset time), optional balance and check time. When the provider does not implement usage, the report MUST contain only the connection status from a cached test. A connection of a globally disabled provider MUST report status `disabled` without any network request.

#### Scenario: Provider implements usage
- **WHEN** the provider returns quota windows
- **THEN** the usage report contains those windows in the standard shape

#### Scenario: Provider without usage
- **WHEN** the provider does not implement usage
- **THEN** the usage report contains only status, reason and check time

#### Scenario: Cached status
- **WHEN** usage is requested twice within the cache period for an unchanged connection
- **THEN** the second request reuses the cached result without a new network request

#### Scenario: Disabled provider usage
- **WHEN** usage is requested for a connection whose provider is globally disabled
- **THEN** the report is status `disabled` and no network request is made

#### Scenario: Usage overview omits disabled providers
- **WHEN** the aggregated usage overview is built while a provider is disabled
- **THEN** that provider's connections are omitted like disabled connections and no usage request is sent for them

### Requirement: Owner-only management API
Connection management over HTTP SHALL be available only to the authenticated owner; mutating requests MUST require same-origin, a valid CSRF token, a JSON content type and a bounded body size.

#### Scenario: Non-owner request
- **WHEN** an authenticated non-owner user calls the management API
- **THEN** the request is rejected with 403 and nothing changes

#### Scenario: Missing CSRF token
- **WHEN** a mutating request lacks a valid CSRF token
- **THEN** the request is rejected and nothing changes

### Requirement: Provider enablement management API
The API SHALL accept `setProviderEnabled` with a registered provider id and boolean enabled flag, durably update the global disabled set and return the updated state. Concurrent toggles MUST be serialized. Invalid ids or flags MUST be rejected without changing state. File-fixed settings MUST return 409 `SETTING_FIXED` and change nothing.

#### Scenario: Concurrent provider toggles
- **WHEN** the owner submits concurrent `setProviderEnabled` requests for different providers
- **THEN** the updates are serialized and both changes are retained

#### Scenario: Toggle a provider through the API
- **WHEN** the owner posts `setProviderEnabled` with provider `codex` and `enabled: false`
- **THEN** `codex` is added to the durable disabled set and the response reports the updated state

#### Scenario: Invalid provider toggle
- **WHEN** `setProviderEnabled` names an unregistered provider or a non-boolean enabled flag
- **THEN** the request is rejected with a validation error and the disabled set is unchanged

#### Scenario: Toggle a file-fixed setting
- **GIVEN** `models.disabledProviders` is fixed by an instance settings file
- **WHEN** the owner posts `setProviderEnabled`
- **THEN** the response is 409 `SETTING_FIXED` and the GET response reports `enabledLocked: true` for every provider

### Requirement: Provider enablement API projection
GET responses and the `providers` action SHALL report each provider's effective `enabled` state and `enabledLocked`, indicating that the setting is fixed by an instance file.

#### Scenario: Read provider state
- **WHEN** the owner reads GET or the `providers` action after a provider toggle
- **THEN** the catalogue reports the effective enabled state and whether the setting is file-fixed

### Requirement: Isolation from existing LLM routing
Creating, changing or removing connections SHALL NOT change existing model routes, accounts, agents or the existing LLM Connections settings.

#### Scenario: Existing agents keep working
- **WHEN** connections are created or removed
- **THEN** existing agents keep their models and their requests are routed exactly as before

### Requirement: Provider-paced usage cache
The usage report of a connection whose provider implements usage SHALL be cached for the provider's usage refresh interval, for both available and unavailable results. An explicit refresh request MUST bypass the cache.

#### Scenario: Within the provider interval
- **WHEN** usage is requested again before the provider's interval has elapsed for an unchanged connection
- **THEN** the cached report is returned without calling the provider

#### Scenario: Failed usage is not retried early
- **WHEN** the provider usage call failed and usage is requested again within the interval
- **THEN** the cached `unavailable` report is returned without calling the provider

#### Scenario: Explicit refresh
- **WHEN** usage is requested with refresh within the interval
- **THEN** the provider is called again

### Requirement: Provider actions and discovery of a disabled provider
Provider-declared actions (such as login or logout) on a connection of a globally disabled provider MUST fail with code `PROVIDER_DISABLED` (409) before the connection is resolved and without any network request. Model discovery for such a connection MUST return only cached or manual models, including when a refresh is requested, without calling the provider. These checks SHALL be enforced in the backend regardless of what the UI allows.

#### Scenario: Direct login request
- **WHEN** the owner posts the `action` request with `login` for a connection of a disabled provider directly to the API
- **THEN** it fails with `PROVIDER_DISABLED`, the action handler is not called and no network request is made

#### Scenario: Refresh models of a disabled provider
- **WHEN** the `models` request with refresh is sent for a connection of a disabled provider
- **THEN** the cached or manual models are returned unchanged and the provider's discovery is not called
