## ADDED Requirements

### Requirement: Draft effort belongs to the selected route
A new-session draft SHALL set requested effort to `auto` when the owner selects a different model (provider or provider-native model slug) or the picker replaces an unavailable draft route. Opening a picker, reselecting the same route or restoring a draft for the same available route SHALL preserve a still-supported explicit choice. Draft changes MUST remain local until submission; submission SHALL use the final route and requested effort together.

#### Scenario: Switch and optionally choose a new level
- **WHEN** a draft set to `high` switches to another model that also supports `high`
- **THEN** the draft displays Default and submitting it creates a session with requested effort `auto`, without first writing to an agent
- **AND** selecting a supported explicit effort after the switch replaces `auto` and submission preserves that selection

#### Scenario: Replace a removed model
- **WHEN** a restored draft's selected model is unavailable and a different available route is substituted
- **THEN** the draft uses `auto` even when the replacement supports the old effort, and reloading that draft does not resurrect the old preference

#### Scenario: Restore or reselect the same canonical model
- **WHEN** a draft or explicit launch link identifies an available route and a supported explicit effort, including a route alias resolving to the same choice
- **THEN** restoring, opening or reselecting that choice keeps the effort; a later unrelated draft edit does not reset it

### Requirement: Draft account-only switch keeps supported effort
Selecting the same model slug on another connection of the same provider in a draft SHALL keep a requested effort that the target's catalogue lists as supported and SHALL set `auto` otherwise, including when the target lists no reasoning levels.

#### Scenario: Same model on another account
- **WHEN** a draft set to `high` switches to the same model slug on another connection of the same provider
- **THEN** the draft keeps `high` when that connection's model supports it and shows Default otherwise
- **AND** when that connection's model lists no reasoning levels the draft shows Default
