## ADDED Requirements

### Requirement: Claude client version source
The `claude` provider SHALL resolve its client version with this precedence and report the matching source: a valid connection override (`override`), else `CLAUDE_CODE_CLI_VERSION` (`env`), else the version detected from the local `claude --version` (`detected`), else the built-in fallback (`fallback`). Request headers and the report MUST use the same resolution, so the reported version equals the one in the user agent.

#### Scenario: Connection override
- **GIVEN** a claude connection with client version override `2.0.0`
- **WHEN** its client version is reported
- **THEN** the version is `2.0.0` with source `override` and no local command is executed

#### Scenario: Environment version
- **GIVEN** a claude connection without override and `CLAUDE_CODE_CLI_VERSION` set
- **WHEN** its client version is reported
- **THEN** the version is the environment value with source `env`

#### Scenario: Detected CLI version
- **GIVEN** no override, no environment version and a local `claude --version` that prints a version
- **WHEN** the client version is reported
- **THEN** the version is the detected one with source `detected`, and a request sent right after uses the same version in its user agent

#### Scenario: Detection fails
- **GIVEN** no override, no environment version and no usable local Claude CLI
- **WHEN** the client version is reported
- **THEN** the version is the built-in fallback with source `fallback`

### Requirement: Claude user agent override in the report
When `CLAUDE_CODE_USER_AGENT` is set, the Claude client version report SHALL state that the user agent is overridden and the resolved version is therefore not sent.

#### Scenario: User agent overridden
- **WHEN** `CLAUDE_CODE_USER_AGENT` is set and the client version is reported
- **THEN** the report marks the user agent as overridden in addition to the resolved version and source

### Requirement: Claude version detection reuse
Reporting the Claude client version MUST reuse the detection cache and timeouts used by requests and MUST NOT start a CLI detection that a request at the same moment would not start.

#### Scenario: Cached detection
- **GIVEN** a request detected the CLI version less than five minutes ago
- **WHEN** the client version is reported
- **THEN** the cached version is returned and `claude --version` is not executed again
