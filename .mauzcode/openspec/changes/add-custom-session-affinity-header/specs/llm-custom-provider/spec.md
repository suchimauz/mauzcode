## ADDED Requirements

### Requirement: Custom session affinity header
When the custom connection field `sessionAffinity` is enabled or absent, every streaming inference request of the connection SHALL carry an `x-session-affinity` header derived from the request's prompt cache identity, or from its session id when no prompt cache identity is given. Model discovery and connection test requests SHALL NOT carry the header.

#### Scenario: Header on streaming inference
- **WHEN** a stream request with prompt cache identity `ab` targets a custom connection with `sessionAffinity` enabled
- **THEN** the request carries an `x-session-affinity` header of 32 lowercase hex characters that does not contain `ab`

#### Scenario: Not sent on discovery or test
- **WHEN** models are listed or the connection is tested for a custom connection with `sessionAffinity` enabled
- **THEN** those requests carry no `x-session-affinity` header

### Requirement: Opaque session affinity value
The `x-session-affinity` value SHALL be 32 lowercase hexadecimal characters, computed as a keyed digest of the connection id and the identity with a secret salt that is generated once per installation, stored in the local encrypted secret store (Postgres `local_secrets`, encryption key held outside the database) and reused across restarts. The value SHALL NOT contain or reveal the raw identity. The same connection and identity SHALL give the same value; different connections or identities SHALL give different values.

#### Scenario: Stable across requests and restarts
- **WHEN** two stream requests, separated by a server restart, use the same connection and the same prompt cache identity
- **THEN** both carry the same `x-session-affinity` value

#### Scenario: Fork shares the parent's value
- **WHEN** a fork that inherits its parent's transcript and a request of the parent agent stream through the same custom connection
- **THEN** both carry the same `x-session-affinity` value

#### Scenario: Fresh delegated child gets its own value
- **WHEN** a delegated child agent without inherited history and its parent stream through the same custom connection
- **THEN** their `x-session-affinity` values differ

#### Scenario: Value scoped to the connection
- **WHEN** the same prompt cache identity streams through two different custom connections
- **THEN** the two `x-session-affinity` values differ

#### Scenario: Fallback to session id
- **WHEN** a stream request has a session id and no prompt cache identity
- **THEN** the header value is derived from the session id

### Requirement: Session affinity connection field
The `custom` provider SHALL offer a boolean connection field `sessionAffinity`, enabled by default, and SHALL treat a missing value as enabled. When the field is disabled, no `x-session-affinity` header SHALL be sent.

#### Scenario: Existing connection without the field
- **WHEN** a custom connection saved before this change, without a `sessionAffinity` value, serves a stream request
- **THEN** the request carries the `x-session-affinity` header

#### Scenario: Disabled by the owner
- **WHEN** the owner disables `sessionAffinity` on a custom connection and a stream request is sent
- **THEN** the request carries no `x-session-affinity` header
