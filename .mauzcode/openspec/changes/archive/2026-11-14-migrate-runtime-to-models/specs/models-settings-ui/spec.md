## MODIFIED Requirements

### Requirement: Models settings tab
The settings dialog SHALL show a "Models" tab as the only model connection settings surface. The legacy "LLM Connections", LLMs and model-policy settings surfaces MUST NOT be shown.

#### Scenario: Owner opens settings
- **WHEN** the owner opens settings
- **THEN** the "Models" tab is listed and opens its panel, and no "LLM Connections" or legacy model-policy tab is listed

## ADDED Requirements

### Requirement: Legacy settings links lead to Models
UI links that pointed at legacy LLM pages or the LLM Connections tab SHALL open the Models tab instead. The Codex account reset and MauzCode node settings controls MUST be removed.

#### Scenario: Open connections from SSH instances
- **WHEN** the owner follows the connections link in the SSH instances panel
- **THEN** the Models tab opens

#### Scenario: Applications list
- **WHEN** the owner opens Applications
- **THEN** no `/llms` page is listed or linked

#### Scenario: No legacy account controls
- **WHEN** the owner opens settings
- **THEN** no Codex account reset or node URL control is shown

### Requirement: Model pickers use model connections
Every model picker (new session, chat header, agent model switch) SHALL list models grouped by model connection, with the connection's account name as the group label. It shows each model's label and reasoning levels from the connection's model catalogue, and selecting a model stores its model route.

#### Scenario: New session picker
- **GIVEN** enabled claude, codex and custom connections
- **WHEN** the owner opens the new-session model picker
- **THEN** models of all three connections are listed in groups named by account, and choosing one creates the agent with its route

#### Scenario: Connection catalogue unavailable
- **WHEN** one connection's model list cannot be loaded
- **THEN** the picker still lists the other connections and shows that connection as unavailable
