## ADDED Requirements

### Requirement: Connection client version display
For each connection whose provider reports a client version, the Models tab SHALL show the effective version and a human-readable source (override, environment variable, detected CLI, built-in fallback or default) next to the provider and transport line of the connection card. When the user agent is overridden, the card SHALL say so. Connections of providers without a report SHALL show no version.

#### Scenario: Claude connection with detected version
- **GIVEN** a claude connection without override on a host where `claude --version` prints `2.1.300`
- **WHEN** the owner opens the Models tab
- **THEN** the card shows `v2.1.300` with a source saying it was detected from `claude --version`

#### Scenario: Codex connection with detected version
- **GIVEN** a codex connection without override on a host where `codex --version` prints `codex-cli 0.160.0`
- **WHEN** the owner opens the Models tab
- **THEN** the card shows `v0.160.0` with a source saying it was detected from `codex --version`

#### Scenario: Codex connection with default version
- **GIVEN** a codex connection without override on a host without a usable Codex CLI
- **WHEN** the owner opens the Models tab
- **THEN** the card shows the SDK default version with the source "built-in default"

#### Scenario: Override changes the display
- **WHEN** the owner saves a client version override on a claude or codex connection
- **THEN** after the card reloads it shows the override version with the source "connection override"

#### Scenario: Provider without version report
- **WHEN** the Models tab shows a connection whose provider does not report a client version
- **THEN** its card shows no version and the client version is not requested for it

### Requirement: Lazy client version loading
The client version SHALL be loaded per connection after the Models overview is shown; the overview MUST NOT wait for it. While loading or after a failure the card SHALL show the provider and transport line without a version and without an error toast.

#### Scenario: Version lookup fails
- **WHEN** loading the client version fails for a connection
- **THEN** the card still shows provider and transport without a version and no error toast is raised

### Requirement: Client version API action
The owner-only Models API SHALL provide a client version action for one connection that requires a valid CSRF token and returns only the secret-free report, or no report when the provider has none.

#### Scenario: Unauthorized version request
- **WHEN** the client version action is called without owner access or without a valid CSRF token
- **THEN** it is refused and no provider code runs
