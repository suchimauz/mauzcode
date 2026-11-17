## MODIFIED Requirements

### Requirement: Owner preset endpoint
The runtime SHALL provide `GET /ui-lab-api/agent-presets` for the authenticated owner, returning the effective catalogue in sort-order then identifier order with full definition fields, the configured default identifier and its missing status. Built-in definitions SHALL come from code and custom definitions from PostgreSQL. Built-ins SHALL use `updated_at: 0` to mean code-managed, not a database modification time. Responses MUST NOT be cached.

#### Scenario: Owner reads presets
- **WHEN** an authenticated owner requests the endpoint with default `standard`
- **THEN** the response lists code-defined Standard, Creator and Minimal alongside stored custom presets in catalogue order with full rules
- **AND** `defaultPresetId` is `standard` and `defaultPresetMissing` is false even when there are no built-in database rows

#### Scenario: Stored Standard cannot shadow code
- **WHEN** a stale stored Standard differs from its current code definition
- **THEN** the endpoint returns the code definition exactly once
- **AND** it agrees with the definition used for new Standard snapshots

### Requirement: Preset details presentation
For each preset the panel SHALL show name, identifier, description, Built-in or Custom badge, allow, deny, plugins, excluded sections and additional prompt. Custom presets SHALL show their stored last update time; built-ins SHALL show that they are managed by code instead of formatting the zero timestamp as a date. Empty fields SHALL show "none"; `*` SHALL retain its literal value and an everything label. The default SHALL carry a "Default for new sessions" marker.

#### Scenario: Built-in default preset
- **WHEN** Standard is built-in and is the configured default
- **THEN** its card shows the Built-in badge and default marker
- **AND** all code-defined allow patterns and plugin grants are listed
- **AND** the update field says it is managed by code, not a database date

#### Scenario: Creator wildcard and empty lists
- **WHEN** Creator allows `*`, grants `*` and has no deny rules
- **THEN** allow and plugins show `*` labelled as everything
- **AND** deny shows "none"

#### Scenario: Preserved customization is discoverable
- **WHEN** migration preserves a customized built-in as a distinct custom record
- **THEN** the panel shows its new identifier, distinguishable name, Custom badge, stored rules and update time
- **AND** the original built-in remains separately visible with code-defined rules
