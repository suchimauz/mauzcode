# Spec Delta

## MODIFIED Requirements

### Requirement: Function access resolution
Plugin functions require their plugin grant; `allow` patterns alone MUST NOT grant them. The promoted public `websearch` facade SHALL retain its `websearch` grant semantics regardless of source location. Other core functions require a matching `allow`; project-local functions are allowed by default. In each case an effective `deny` SHALL win; unlisted functions MUST be denied.

#### Scenario: Allow does not grant plugins
- **WHEN** a preset allows `*` and grants no plugins
- **THEN** `files.read` is allowed and `redmine.myIssues` is denied

#### Scenario: Project-local functions
- **WHEN** a Standard agent calls a function defined in the project's `.mauzcode/skill/` root
- **THEN** the call is allowed

#### Scenario: Deny wins
- **WHEN** a preset allows `*` and denies `procs.*`
- **THEN** `procs.repl.load` is denied and `files.read` is allowed

#### Scenario: Unlisted function
- **WHEN** a preset allows only `tools.read`
- **THEN** `tools.bash` is denied

#### Scenario: Deny narrows a granted plugin
- **WHEN** a preset grants plugin `redmine` and denies `redmine.prepare*`
- **THEN** `redmine.myIssues` is allowed and `redmine.prepareTimeEntry` is denied

#### Scenario: Existing search grants survive the move
- **WHEN** existing live or restored agents use an allowed websearch grant, a custom denial, or broad core `allow` patterns without the plugin grant
- **THEN** the first retains its allowed search surface; relocation to core does not turn either of the latter restrictions into access or modify a frozen snapshot

## ADDED Requirements

### Requirement: No alternate entry to native search
Agent-facing discovery, prompts and public search operations SHALL use the caller's effective preset. Searching through `answer` MUST require permission for its search stage as well as for `answer` itself. Direct handler calls, introspection, fabricated arguments, inherited grants and result identifiers MUST NOT confer native search authority. An adapter or transport helper MUST NOT become a separate public route to subscription search.

#### Scenario: Denied search nested in an allowed operation
- **WHEN** a preset allows `websearch.answer` but denies `websearch.search` and the agent asks for an answer
- **THEN** the operation fails before lookup, account access or network I/O; it does not evade the denial by calling an internal helper

#### Scenario: Discovery and inherited denials
- **WHEN** a child narrows away websearch, or a custom preset lacks it, including one with broad core allow patterns
- **THEN** the unavailable facade is neither callable nor advertised as usable through discovery or prompts; neither agent can invoke native search via a Models helper

#### Scenario: Upgrade with search unavailable
- **WHEN** an installation upgrades with the former websearch plugin disabled or without a usable grant
- **THEN** the upgrade does not by itself enable agent searches, change a preset or opt any account into an otherwise denied capability

### Requirement: Discovery of the granted search facade
While the `websearch` plugin is mounted, plugin search, descriptions and function lists SHALL attribute the allowed core-owned facade to that plugin by exact public name. They MUST apply the caller's effective grants and denials to the combined logical and physical names. Physical engine handlers are not required to make the facade discoverable; logical membership MUST NOT grant access to any denied handler.

#### Scenario: Only the facade is allowed
- **GIVEN** the mounted plugin is granted, `websearch.search` is allowed and all functions physically contributed by the plugin, including its engine handlers, are denied
- **WHEN** the agent searches the plugin catalogue for web search, then reads the `websearch` plugin description and function list
- **THEN** `plugins.search` finds the plugin and `plugins.read`, `plugins.docs` and `plugins.functions` list `websearch.search` once; denied handlers are neither returned as usable functions nor directly callable
