## ADDED Requirements

### Requirement: Additive OpenSpec opt-in for customized Standard
An explicit OpenSpec opt-in for a customized stored Standard preset SHALL preserve unrelated plugin grants and editable settings. New Standard agents SHALL receive access to every mounted OpenSpec function, subject to deny rules and inherited layers. Existing agent snapshots and action-specific approval requirements MUST remain unchanged.

#### Scenario: Preserve an existing plugin grant
- **GIVEN** the stored Standard preset grants only `nrepl` and has no denies
- **WHEN** the user explicitly requests full OpenSpec access
- **THEN** the stored plugin grants contain `nrepl` and `openspec`
- **AND** all other editable preset fields remain unchanged

#### Scenario: New snapshot receives the full plugin grant
- **WHEN** a new top-level Standard agent is created after the opt-in with no deny rules
- **THEN** every function declared by the mounted OpenSpec plugin is allowed
- **AND** unrelated ungranted plugins remain unavailable

#### Scenario: Existing snapshots stay frozen
- **GIVEN** a Standard agent was created before the opt-in without an OpenSpec grant
- **WHEN** the stored Standard preset gains the OpenSpec grant
- **THEN** the existing agent snapshot is unchanged and still denies OpenSpec
- **AND** no approval requirement is bypassed by the stored preset update
