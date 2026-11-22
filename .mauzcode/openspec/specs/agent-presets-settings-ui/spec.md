# agent-presets-settings-ui Specification

## Purpose
Read-only owner view of stored agent presets and the default preset in the React Settings dialog, backed by an owner-only uncached endpoint.

## Requirements

### Requirement: Agent presets settings tab
The Settings dialog SHALL include a core tab titled "Agent presets" alongside the existing core tabs. Opening the tab SHALL load presets from the owner preset endpoint.

#### Scenario: Tab is listed
- **WHEN** the owner opens Settings
- **THEN** an "Agent presets" tab is available among the core tabs
- **AND** selecting it shows the agent presets panel

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

### Requirement: Endpoint rejects unauthorized and write requests
The preset endpoint MUST reject unauthenticated requests with 401, non-owner users with 403 and any non-GET method with 405, without changing any state.

#### Scenario: Unauthorized and write attempts
- **WHEN** the endpoint is requested without a session, by a non-owner, or with POST
- **THEN** the responses are 401, 403 and 405 respectively
- **AND** no preset or setting changes

### Requirement: Preset details presentation
For each preset the panel SHALL show name, identifier, Built-in or Custom badge in its row, and SHALL show description, allow, deny, plugins, excluded sections and additional prompt when that row is expanded. Custom presets SHALL show their stored last update time; built-ins SHALL show that they are managed by code instead of formatting the zero timestamp as a date. Empty fields SHALL show "none"; `*` SHALL retain its literal value and an everything label. The default SHALL carry a "Default for new sessions" marker in its row.

#### Scenario: Built-in default preset
- **WHEN** Standard is built-in and is the configured default
- **THEN** its row shows the Built-in badge and default marker
- **AND** after expanding the row all code-defined allow patterns and plugin grants are listed
- **AND** the update field says it is managed by code, not a database date

#### Scenario: Creator wildcard and empty lists
- **WHEN** Creator allows `*`, grants `*`, has no deny rules and its row is expanded
- **THEN** allow and plugins show `*` labelled as everything
- **AND** deny shows "none"

#### Scenario: Preserved customization is discoverable
- **WHEN** migration preserves a customized built-in as a distinct custom record
- **THEN** the panel shows a row with its new identifier, distinguishable name and Custom badge, and expanding it shows its stored rules and update time
- **AND** the original built-in remains separately visible with code-defined rules

### Requirement: Missing default warning
When the configured default preset does not exist, the panel SHALL show a warning naming the configured identifier and stating that new sessions without an explicit preset cannot be created. All existing presets SHALL still be listed, none marked as default.

#### Scenario: Default points to a deleted preset
- **WHEN** the default setting is `team` and no `team` preset exists
- **THEN** the panel warns about the missing `team` preset
- **AND** no preset row carries the default marker

### Requirement: Read-only view
The panel MUST NOT offer controls to create, edit, reset or delete presets or to change the default preset, and MUST NOT send write requests. Besides Retry, the only interactive controls SHALL be the disclosure buttons that expand and collapse preset rows; they change local view state only. It SHALL state that preset changes apply only to new agents and that presets are a guardrail, not a sandbox.

#### Scenario: No write controls
- **WHEN** the panel is rendered with presets
- **THEN** the only buttons are the preset row disclosures, plus Retry when an error occurs
- **AND** expanding or collapsing a row sends no request
- **AND** the explanatory note is visible

### Requirement: Loading, error and empty states
The panel SHALL show a loading status while fetching, an error message with a Retry action when loading fails, and an empty-state message when no presets exist. When the endpoint answers 403 the panel SHALL instead state that only owners can view agent presets, without a Retry action. Every load, including Retry, SHALL abort the previous in-flight request, and closing the panel SHALL abort the current one. While a reload is in flight, already loaded presets SHALL stay visible instead of being replaced by the loading status.

#### Scenario: Retry after failure
- **WHEN** loading fails with a non-403 error and the owner activates Retry
- **THEN** the panel requests the endpoint again and shows presets on success

#### Scenario: Non-owner opens the tab
- **WHEN** the endpoint answers 403
- **THEN** the panel says that only owners can view agent presets
- **AND** no Retry button is offered

#### Scenario: Panel closed during Retry
- **WHEN** Retry is in flight and the panel unmounts
- **THEN** the request is aborted and no state update follows

### Requirement: Accessible presentation
The panel SHALL use semantic headings and lists, announce loading and errors through status/alert roles, remain keyboard operable, preserve visible focus, respect reduced motion and use existing light and dark theme tokens. Every focusable element SHALL have an accessible name; the focusable prompt block of an expanded preset SHALL be named "Prompt for <preset name>". Collapsed rows SHALL expose the preset name through their disclosure button; details SHALL be present in the accessibility tree only while expanded.

#### Scenario: Screen reader structure
- **WHEN** the panel is inspected with an accessibility tree
- **THEN** each preset is a named section whose disclosure button carries the preset name and expanded state
- **AND** an expanded preset shows its rules as lists and its focusable prompt block is announced as "Prompt for <preset name>"
