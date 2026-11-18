## REMOVED Requirements

### Requirement: Claude Code request headers
**Reason**: The user agent is now always generated from the resolved client version; the `CLAUDE_CODE_USER_AGENT` environment override and its scenario are dropped.
**Migration**: Set the connection's client version override instead; the headers are restated in "Claude Code request headers from client version".

## ADDED Requirements

### Requirement: Claude Code request headers from client version
Every request SHALL carry bearer authorization and the user agent `claude-cli/<version> (external, sdk-cli)`, where the version is the connection's resolved client version. Messages and compaction requests SHALL also carry `anthropic-version: 2023-06-01`, `x-app: cli`, `anthropic-dangerous-direct-browser-access: true`, a new `x-client-request-id` and the Claude Code betas. `x-api-key` MUST NOT be sent. The user agent MUST NOT be taken from an environment variable.

#### Scenario: Default betas
- **WHEN** no override is set
- **THEN** the betas are `claude-code-20250219`, `oauth-2025-04-20`, `fine-grained-tool-streaming-2025-05-14` and `interleaved-thinking-2025-05-14`

#### Scenario: Streamed request headers
- **WHEN** a stream request is sent for a claude connection
- **THEN** it carries all the headers above, a request id different from the previous request, and no `x-api-key` header

#### Scenario: Beta override
- **WHEN** `CLAUDE_CODE_ANTHROPIC_BETA` is set
- **THEN** its value replaces the default beta list

### Requirement: Claude CLI version detection setting
A claude connection SHALL have a boolean setting "Detect CLI version" that defaults to enabled, including for stored connections without the setting. It MUST NOT be enabled together with a client version override: saving a connection with both an override and the setting explicitly enabled SHALL be rejected. A client version override that does not match `^[0-9A-Za-z.+-]{1,40}$` SHALL be rejected on save and MUST NOT be sent.

#### Scenario: Existing connection keeps detecting
- **GIVEN** a stored claude connection without override and without the setting
- **WHEN** a request is sent
- **THEN** the version is detected from the local `claude --version` as before

#### Scenario: Override with detection rejected
- **WHEN** the owner saves a claude connection with override `2.0.0` and detection enabled
- **THEN** the save fails with a validation error and the stored connection is unchanged

#### Scenario: Invalid override rejected
- **WHEN** the owner saves a claude connection with override `2.0 beta`
- **THEN** the save fails with a validation error

### Requirement: Claude client version source
The `claude` provider SHALL resolve its client version with this precedence and report the matching source: a valid connection override (`override`); else, when detection is enabled, the version detected from the local `claude --version` (`detected`); else the built-in fallback (`fallback`). `CLAUDE_CODE_CLI_VERSION` MUST NOT be read. Request headers and the report MUST use the same resolution.

#### Scenario: Connection override
- **GIVEN** a claude connection with client version override `2.0.0`
- **WHEN** its client version is reported
- **THEN** the version is `2.0.0` with source `override` and no local command is executed

#### Scenario: Detected CLI version
- **GIVEN** no override, detection enabled and a local `claude --version` that prints a version
- **WHEN** the client version is reported
- **THEN** the version is the detected one with source `detected`, and a request sent right after uses the same version in its user agent

#### Scenario: Detection disabled
- **GIVEN** no override and detection disabled
- **WHEN** the client version is reported
- **THEN** the version is the built-in fallback with source `fallback` and no local command is executed

#### Scenario: Detection fails
- **GIVEN** no override, detection enabled and no usable local Claude CLI
- **WHEN** the client version is reported
- **THEN** the version is the built-in fallback with source `fallback`

#### Scenario: Environment version ignored
- **GIVEN** no override, detection disabled and `CLAUDE_CODE_CLI_VERSION` set
- **WHEN** the client version is reported
- **THEN** the version is the built-in fallback with source `fallback`

### Requirement: Claude version detection cache
Claude CLI detection SHALL run only on the MauzCode host with the existing timeouts and cache (five minutes on success, thirty seconds on failure). Reporting MUST reuse the cache used by requests. A refresh request SHALL discard the local detection cache entry and detect again.

#### Scenario: Cached detection
- **GIVEN** a request detected the CLI version less than five minutes ago
- **WHEN** the client version is reported without refresh
- **THEN** the cached version is returned and `claude --version` is not executed again

#### Scenario: Refresh
- **GIVEN** a cached detected version
- **WHEN** the client version is reported with refresh
- **THEN** `claude --version` is executed again and the next request uses the new result
