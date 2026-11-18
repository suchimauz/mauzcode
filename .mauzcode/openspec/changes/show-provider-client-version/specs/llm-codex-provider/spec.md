## MODIFIED Requirements

### Requirement: Independent Codex SDK execution
The Codex connection provider SHALL operate without legacy inference namespaces, legacy account routing or storage, agent-runtime types, or an installed Codex CLI. This independence MUST include its transitive protocol dependencies. Requests SHALL use only the resolved connection transport. An installed Codex CLI MAY be used only as the client version source of connections that enabled CLI detection; its absence or failure MUST NOT affect any operation.

#### Scenario: Legacy runtime is unavailable
- **GIVEN** an authorized Codex SDK connection and no legacy inference namespaces or CLI
- **WHEN** the client lists models, reads usage, streams or compacts through the SDK
- **THEN** the operations use only SDK-owned behavior and independent infrastructure, with network requests through the connection transport

#### Scenario: Client version selection
- **WHEN** a connection has a valid client version override
- **THEN** requests use that override without executing local commands
- **AND** a connection without an override and with CLI detection disabled uses the documented SDK version without executing local commands

## ADDED Requirements

### Requirement: Codex CLI version detection setting
A codex connection SHALL have a boolean setting "Detect CLI version" that defaults to disabled, including for stored connections without the setting. It MUST NOT be enabled together with a client version override: saving a connection with both SHALL be rejected.

#### Scenario: Existing connection unchanged
- **GIVEN** a stored codex connection without the setting
- **WHEN** a request is sent
- **THEN** it uses the override or the documented SDK version and no local command is executed

#### Scenario: Override with detection rejected
- **WHEN** the owner saves a codex connection with an override and detection enabled
- **THEN** the save fails with a validation error

### Requirement: Codex client version source
The `codex` provider SHALL resolve its client version with this precedence and report the matching source: a valid connection override (`override`); else, when detection is enabled, the version detected from the local `codex --version` (`detected`); else the documented SDK default (`default`). A detected version SHALL be used even when it is older than the SDK default, with a detail stating that it is older. Requests and the report MUST use the same resolution.

#### Scenario: Override reported
- **GIVEN** a codex connection with a valid client version override
- **WHEN** its client version is reported
- **THEN** the version equals the override with source `override` and no local command is executed

#### Scenario: Detected CLI version
- **GIVEN** no override, detection enabled and a local `codex --version` that prints `codex-cli 0.160.0`
- **WHEN** the client version is reported
- **THEN** the version is `0.160.0` with source `detected`, and the next models or responses request uses the same version

#### Scenario: Older detected version
- **GIVEN** no override, detection enabled and a local `codex --version` that prints a version older than the SDK default
- **WHEN** the client version is reported
- **THEN** the version is the detected one with source `detected` and the detail says it is older than the SDK default

#### Scenario: Default reported
- **GIVEN** no override and either detection disabled or no usable local Codex CLI
- **WHEN** the client version is reported
- **THEN** the version is the documented SDK default with source `default`

### Requirement: Codex version detection
Codex CLI detection SHALL run only on the MauzCode host and only for connections with detection enabled, with a bounded timeout and output size, and its result SHALL be cached (successful results for five minutes, failures for thirty seconds). Reporting MUST reuse the cache used by requests. A refresh request SHALL discard the cache entry and detect again.

#### Scenario: Cached detection
- **GIVEN** a request detected the Codex CLI version less than five minutes ago
- **WHEN** the client version is reported without refresh
- **THEN** the cached version is returned and `codex --version` is not executed again

#### Scenario: Refresh
- **GIVEN** a cached detected version
- **WHEN** the client version is reported with refresh
- **THEN** `codex --version` is executed again and the next request uses the new result

#### Scenario: Hanging CLI
- **WHEN** `codex --version` does not finish within the timeout
- **THEN** the process is killed and the SDK default is used with source `default`
