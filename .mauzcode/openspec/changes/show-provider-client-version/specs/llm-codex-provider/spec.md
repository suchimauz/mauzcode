## MODIFIED Requirements

### Requirement: Independent Codex SDK execution
The Codex connection provider SHALL operate without legacy inference namespaces, legacy account routing or storage, agent-runtime types, or an installed Codex CLI. This independence MUST include its transitive protocol dependencies. Requests SHALL use only the resolved connection transport. An installed Codex CLI MAY be used only as an optional, best-effort source of the client version; its absence or failure MUST NOT affect any operation.

#### Scenario: Legacy runtime is unavailable
- **GIVEN** an authorized Codex SDK connection and no legacy inference namespaces or CLI
- **WHEN** the client lists models, reads usage, streams or compacts through the SDK
- **THEN** the operations use only SDK-owned behavior and independent infrastructure, with network requests through the connection transport

#### Scenario: Client version selection
- **WHEN** a connection has a valid client version override
- **THEN** requests use that override without executing local commands
- **AND** a connection without an override, without `CODEX_CLI_VERSION` and without a local Codex CLI uses the documented SDK version and succeeds as before

## ADDED Requirements

### Requirement: Codex client version source
The `codex` provider SHALL resolve its client version with this precedence and report the matching source: a valid connection override (`override`), else the `CODEX_CLI_VERSION` environment variable (`env`), else the version detected from the local `codex --version` (`detected`), else the documented SDK default (`default`). Requests and the report MUST use the same resolution.

#### Scenario: Override reported
- **GIVEN** a codex connection with a valid client version override
- **WHEN** its client version is reported
- **THEN** the version equals the override with source `override` and no local command is executed

#### Scenario: Environment version
- **GIVEN** no override and `CODEX_CLI_VERSION` set to a valid version
- **WHEN** the client version is reported
- **THEN** the version is the environment value with source `env`

#### Scenario: Detected CLI version
- **GIVEN** no override, no environment version and a local `codex --version` that prints `codex-cli 0.160.0`
- **WHEN** the client version is reported
- **THEN** the version is `0.160.0` with source `detected`, and the next models or responses request uses the same version

#### Scenario: Default reported
- **GIVEN** no override, no environment version and no usable local Codex CLI
- **WHEN** the client version is reported
- **THEN** the version is the documented SDK default with source `default`

### Requirement: Codex detected version floor
A detected Codex CLI version older than the documented SDK default SHALL NOT be used, because it would hide models from the catalogue; the SDK default SHALL be used with source `default` and a detail naming the ignored detected version.

#### Scenario: Old local CLI
- **GIVEN** no override, no environment version and a local `codex --version` that prints a version older than the SDK default
- **WHEN** the client version is reported
- **THEN** the version is the SDK default with source `default` and the detail mentions the older detected version

### Requirement: Codex version detection
Codex CLI detection SHALL run only on the MauzCode host, with a bounded timeout and output size, and its result SHALL be cached (successful results for five minutes, failures for thirty seconds). Reporting MUST reuse the cache used by requests.

#### Scenario: Cached detection
- **GIVEN** a request detected the Codex CLI version less than five minutes ago
- **WHEN** the client version is reported
- **THEN** the cached version is returned and `codex --version` is not executed again

#### Scenario: Hanging CLI
- **WHEN** `codex --version` does not finish within the timeout
- **THEN** the process is killed and the SDK default is used with source `default`
