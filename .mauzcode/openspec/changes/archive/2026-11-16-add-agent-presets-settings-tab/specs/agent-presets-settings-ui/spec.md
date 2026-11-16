## Purpose

Read-only owner view of stored agent presets and the default preset in the React Settings dialog, backed by an owner-only uncached endpoint.

## ADDED Requirements

### Requirement: Agent presets settings tab
The Settings dialog SHALL include a core tab titled "Agent presets" alongside the existing core tabs. Opening the tab SHALL load presets from the owner preset endpoint.

#### Scenario: Tab is listed
- **WHEN** the owner opens Settings
- **THEN** an "Agent presets" tab is available among the core tabs
- **AND** selecting it shows the agent presets panel

### Requirement: Owner preset endpoint
The runtime SHALL provide `GET /ui-lab-api/agent-presets` that returns, for an authenticated owner, every stored preset in `sort_order`, then identifier order with all stored definition fields (identifier, name, description, sort order, built-in flag, allow, deny, plugins, excluded sections, prompt, update time), plus the configured default preset identifier and whether that preset is missing. Responses MUST NOT be cached.

#### Scenario: Owner reads presets
- **WHEN** an authenticated owner requests the endpoint and Standard, Creator and Minimal exist with default `standard`
- **THEN** the response lists the three presets in stored order with their full rules
- **AND** `defaultPresetId` is `standard` and `defaultPresetMissing` is false

### Requirement: Endpoint rejects unauthorized and write requests
The preset endpoint MUST reject unauthenticated requests with 401, non-owner users with 403 and any non-GET method with 405, without changing any state.

#### Scenario: Unauthorized and write attempts
- **WHEN** the endpoint is requested without a session, by a non-owner, or with POST
- **THEN** the responses are 401, 403 and 405 respectively
- **AND** no preset or setting changes

### Requirement: Preset details presentation
For each preset the panel SHALL show its name as a heading, identifier, description, a Built-in or Custom badge, and the allow, deny, plugins, excluded sections, additional prompt and last update time. Empty lists and an empty prompt SHALL be shown as "none". A `*` entry SHALL be labelled as matching everything while still showing the literal pattern. The preset used by default for new sessions SHALL carry a "Default for new sessions" marker.

#### Scenario: Built-in default preset
- **WHEN** Standard is built-in and is the configured default
- **THEN** its card shows the Built-in badge and the default marker
- **AND** each of its allow patterns and plugin grants is listed

#### Scenario: Creator wildcard and empty lists
- **WHEN** Creator allows `*`, grants `*` and has no deny rules
- **THEN** allow and plugins show `*` labelled as everything
- **AND** deny shows "none"

### Requirement: Missing default warning
When the configured default preset does not exist, the panel SHALL show a warning naming the configured identifier and stating that new sessions without an explicit preset cannot be created. All existing presets SHALL still be listed, none marked as default.

#### Scenario: Default points to a deleted preset
- **WHEN** the default setting is `team` and no `team` preset exists
- **THEN** the panel warns about the missing `team` preset
- **AND** no card carries the default marker

### Requirement: Read-only view
The panel MUST NOT offer controls to create, edit, reset or delete presets or to change the default preset, and MUST NOT send write requests. It SHALL state that preset changes apply only to new agents and that presets are a guardrail, not a sandbox.

#### Scenario: No write controls
- **WHEN** the panel is rendered with presets
- **THEN** the only button is Retry when an error occurs
- **AND** the explanatory note is visible

### Requirement: Loading, error and empty states
The panel SHALL show a loading status while fetching, an error message with a Retry action when loading fails, and an empty-state message when no presets exist.

#### Scenario: Retry after failure
- **WHEN** loading fails and the owner activates Retry
- **THEN** the panel requests the endpoint again and shows presets on success

### Requirement: Accessible presentation
The panel SHALL use semantic headings and lists, announce loading and errors through status/alert roles, remain keyboard operable, preserve visible focus, respect reduced motion and use existing light and dark theme tokens.

#### Scenario: Screen reader structure
- **WHEN** the panel is inspected with an accessibility tree
- **THEN** each preset is a named section with its rules as lists
