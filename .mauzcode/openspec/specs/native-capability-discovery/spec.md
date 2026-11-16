# native-capability-discovery Specification

## Purpose
Give agents typed native tools to find and inspect the runtime functions and plugin workflows they are allowed to use, without writing eval code, without activating new tool schemas and without revealing capabilities their preset denies.

## Requirements

### Requirement: Native capability search
The system SHALL provide a native tool `tool_search` that accepts a required non-empty `query`, an optional `limit` (default 10, maximum 30) and an optional namespace filter, and returns ranked entries over runtime functions and mounted plugin workflows. The tool MUST reject unknown arguments before any search.

#### Scenario: Find a function by intent
- **WHEN** an agent calls `tool_search` with query "read stored tool result"
- **THEN** the result includes `agent.readResult` with its summary and source, and no entry includes source code

#### Scenario: Compact entry shape
- **WHEN** `tool_search` returns entries
- **THEN** each entry has only `name`, `kind` (`function` or `workflow`), a one-line `summary` and `source` (core, official or user plugin), with no availability flag, source code or full schema

#### Scenario: Invalid arguments
- **WHEN** an agent calls `tool_search` with an empty query or an unknown argument
- **THEN** the call fails with a validation error and no search runs

### Requirement: Native capability description
The system SHALL provide a native tool `tool_describe` that accepts one exact `name`. For a function name it returns the documentation, input schema and return type for the currently loaded runtime image. It MUST NOT return implementation source, and MUST omit trusted internal parameters (such as context, session, agent authority, owner identity or permission predicates) from the described input schema.

#### Scenario: Describe an available function
- **WHEN** an agent calls `tool_describe` with `input.request`
- **THEN** the result contains the documented options, their types and the return type, and no internal authority parameter

#### Scenario: Unknown name
- **WHEN** an agent calls `tool_describe` with a name that does not exist
- **THEN** the call fails with a not-available error and no other function is described

### Requirement: Plugin description
`tool_describe` SHALL, for an exact mounted plugin name, return the plugin's workflow overview and the index of its functions allowed to the caller, without source code. When a name matches both a function and a plugin, the function SHALL be described.

#### Scenario: Describe a plugin
- **WHEN** an agent calls `tool_describe` with the name of a mounted plugin it may use
- **THEN** the result contains the plugin's workflow overview and only the functions of that plugin its preset allows, without source code

### Requirement: Discovery is limited by the caller's preset
Discovery tools SHALL be advertised and executed only when the invoking agent's preset allows both the adapter and every wrapped discovery function declared in the tool's `requires` list, and SHALL apply the trusted preset of the invoking agent, never a filter supplied in model arguments. Permission filtering MUST happen before ranking and truncation, so allowed matches are complete within the limit regardless of how many denied functions match.

#### Scenario: Denied hits do not displace allowed ones
- **GIVEN** a preset where more than 60 functions matching a query are denied and one matching function is allowed
- **WHEN** the agent calls `tool_search` with that query
- **THEN** the allowed function is returned and no denied function appears

#### Scenario: Wrapped capability denied
- **GIVEN** a preset that allows the `tool_search` adapter but denies `runtime.docs.search`
- **WHEN** the native tool list is built and the model calls `tool_search` anyway
- **THEN** `tool_search` is not in the tool list and the call fails with the unknown-tool error

#### Scenario: Model-supplied filter is ignored
- **WHEN** an agent passes an `allows` or preset argument to a discovery tool
- **THEN** the call is rejected as having an unknown argument

### Requirement: Negative paths do not leak denied capabilities
Errors and empty results from discovery tools, and dispatcher errors for unknown or preset-denied native tool names, SHALL be indistinguishable for denied and nonexistent functions and tools and MUST NOT list or hint at denied function, tool or preset names.

#### Scenario: Describe a denied function
- **GIVEN** a preset that denies `secrets.get`
- **WHEN** the agent calls `tool_describe` with `secrets.get`
- **THEN** the error is the same as for a nonexistent name

#### Scenario: Unknown tool name error
- **GIVEN** a restricted preset
- **WHEN** the model calls a native tool name that does not exist
- **THEN** the error lists at most the tools available to that agent and no denied tool names

#### Scenario: Denied tool name error
- **GIVEN** a restricted preset that denies an existing native tool
- **WHEN** the model calls that tool
- **THEN** the error is identical in form to the unknown-tool error and names neither the implementing function nor the preset

### Requirement: Discovery does not activate tools
Discovery results SHALL NOT add schemas to the agent's native tool list or create a way to invoke the found function. Found functions stay callable only through already declared native tools or the existing eval tool under the same permissions.

#### Scenario: Tool list unchanged after search
- **WHEN** an agent calls `tool_search` and the next model request is built
- **THEN** the native tool list is identical to the one before the search
