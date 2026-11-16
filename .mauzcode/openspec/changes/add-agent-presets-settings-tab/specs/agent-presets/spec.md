## ADDED Requirements

### Requirement: Owner read-only preset view
Full stored preset definitions SHALL be readable by the authenticated owner through a read-only Settings view and its owner endpoint. The new-session defaults response SHALL continue to expose only preset identifier, name, description and sort order, never allow, deny, plugins, excluded sections or prompt.

#### Scenario: Menu stays minimal
- **WHEN** the new-session defaults are requested after this change
- **THEN** preset entries contain only `id`, `name`, `description` and `sortOrder`

#### Scenario: Viewing does not change snapshots
- **WHEN** the owner opens the Agent presets settings tab
- **THEN** no preset, setting or existing agent snapshot is modified
