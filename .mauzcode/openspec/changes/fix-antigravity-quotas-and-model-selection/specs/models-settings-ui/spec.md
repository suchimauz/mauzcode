## ADDED Requirements

### Requirement: Antigravity availability at model granularity
In Models settings an Antigravity catalogue group SHALL have exactly one enable switch, with the same draft/save interaction as a standalone model. Its levels and native member IDs MUST NOT be shown as nested availability controls, and the `No enabled levels` badge MUST NOT appear. Reasoning effort SHALL remain selectable in the chat and draft model pickers, not in the availability list.

#### Scenario: Disable or enable the whole group
- **WHEN** an owner opens a connection with a grouped and a standalone Antigravity model
- **THEN** each choice has one accessible switch; no level switch or empty-level badge is present, and an edit is not persisted before Save
- **AND** saving the group edit addresses its group ID only and leaves the standalone model unchanged

#### Scenario: Enable restores picker choices
- **WHEN** the owner enables and saves a previously disabled group
- **THEN** the group is offered with all its current provider-eligible levels; the chosen effort still selects the corresponding native model, not a separately enabled settings row

### Requirement: Refuse member availability edits for Antigravity groups
The model availability operation, including direct API and runtime calls, MUST refuse to disable or enable a known member of an Antigravity group with a validation error that names the group ID, leaving stored settings unchanged.

#### Scenario: Direct member disable is refused
- **WHEN** a client calls the model availability operation for a native member ID of a known group on an Antigravity connection
- **THEN** it fails with a validation error naming the group ID, the stored settings and updated time do not change, and the group keeps all its levels
- **AND** the same operation still disables a standalone Antigravity model or a model of another provider
