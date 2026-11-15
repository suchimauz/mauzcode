## MODIFIED Requirements

### Requirement: Model pickers use model connections
Every model picker (new session, chat header, agent model switch) SHALL group selectable models by connection, with both provider and connection/account name in each group label. Distinct connections MUST remain distinct even when account names match; SSH host context MUST be preserved. Each model retains its catalogue label and reasoning levels, and selecting a model stores its unchanged model route.

#### Scenario: New session picker
- **GIVEN** enabled claude, codex and custom connections
- **WHEN** the owner opens the new-session model picker
- **THEN** available models are grouped under provider-and-account labels, and choosing one creates the agent with its route

#### Scenario: Matching account names across providers
- **GIVEN** claude and codex connections both named `personal`
- **WHEN** the owner opens any model picker
- **THEN** separate groups identify `claude · personal` and `codex · personal` rather than two account-only headings or a merged group

#### Scenario: Remote connections
- **GIVEN** local and SSH connections with the same provider and account name
- **WHEN** their selectable models are displayed
- **THEN** the groups remain separate and remote headings retain their SSH host context alongside provider and account

#### Scenario: Connection catalogue unavailable
- **WHEN** an enabled connection's model list cannot be loaded
- **THEN** the picker still lists the other enabled connections and shows that connection as unavailable with its provider and account name
