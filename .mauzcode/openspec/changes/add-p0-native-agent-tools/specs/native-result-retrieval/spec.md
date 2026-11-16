## Purpose

Let agents read bounded ranges of large stored tool and trigger results through a typed native tool, with the same ownership checks and limits as the eval route, so a cut preview can be recovered without rerunning the tool.

## ADDED Requirements

### Requirement: Native bounded result read
The system SHALL provide a native tool `read_result` that accepts a required result `id`, an optional `offset` (default 0, minimum 0) and an optional `limit` (default 4000, minimum 1, maximum 16000, counted in JavaScript UTF-16 code units), and returns either `{ ok: true, text, totalChars, offset, truncated }` or `{ ok: false, error }`. Out-of-range numbers MUST be clamped exactly as the existing eval API does, and unknown arguments MUST be rejected.

#### Scenario: Read the next range
- **GIVEN** a stored result of 10000 characters visible to the agent
- **WHEN** the agent calls `read_result` with offset 4000 and limit 4000
- **THEN** it receives characters 4000–7999, `totalChars` 10000 and `truncated` true

#### Scenario: Limit above maximum
- **WHEN** the agent calls `read_result` with limit 50000
- **THEN** at most 16000 units are returned

### Requirement: Result ownership on every read
`read_result` SHALL authorize the id against the invoking agent's visible message history, including fork boundaries, or its own trigger run history, on every call including cache hits. The agent identity MUST come from the trusted invocation, never from arguments. Foreign and unknown ids MUST return `not_found`; legacy `rN` aliases MUST return `legacy_unavailable`.

#### Scenario: Foreign result id
- **GIVEN** a result UUID that belongs to another agent's history
- **WHEN** the agent calls `read_result` with that id
- **THEN** it receives `{ ok: false, error: "not_found" }` and no text

#### Scenario: Legacy alias
- **WHEN** the agent calls `read_result` with id `r12`
- **THEN** it receives `{ ok: false, error: "legacy_unavailable" }`

### Requirement: Parity with the eval route
For the same agent, id, offset and limit, `read_result` SHALL return the same result as the existing eval API, and reading a result through `read_result` MUST NOT itself be truncated to a new stored result that requires another read.

#### Scenario: Maximum range is returned inline
- **GIVEN** a stored result of 50000 characters visible to the agent
- **WHEN** the agent calls `read_result` with limit 16000
- **THEN** the tool result in the transcript contains all 16000 units inline and no new result id is created

#### Scenario: Preview hint names the native tool
- **GIVEN** an agent whose tool list includes `read_result`
- **WHEN** another tool's output is too large and is stored
- **THEN** the preview hint tells the agent to call `read_result` with the new id, and agents without that tool still get the eval hint

#### Scenario: Same output as eval
- **WHEN** the agent reads one range through `read_result` and through eval
- **THEN** both results are identical

### Requirement: Availability follows the wrapped capability
`read_result` SHALL be advertised and executed only when the invoking agent's preset allows both the adapter and `agent.readResult`, declared in the tool's `requires` list.

#### Scenario: readResult denied
- **GIVEN** a preset that denies `agent.readResult`
- **WHEN** the native tool list is built
- **THEN** `read_result` is absent and calling it returns the unknown-tool error
