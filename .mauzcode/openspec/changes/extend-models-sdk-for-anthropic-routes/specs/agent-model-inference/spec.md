## MODIFIED Requirements

### Requirement: Reasoning kept on tool-call turns
When an agent turn ends with tool calls and the stream returned non-empty reasoning, the agent SHALL store that reasoning as `reasoning_content` on the first tool call of the persisted assistant message, so it survives saves and forks and protocols that request replay can send it back. When the stream also returned native reasoning blocks, the agent SHALL store them on the same tool call together with the connection and model that produced them. Turns without tool calls or without reasoning SHALL be stored unchanged.

#### Scenario: Tool-call turn with reasoning
- **WHEN** a turn streams reasoning `inspect config` and calls two tools
- **THEN** the persisted assistant message's first tool call carries `reasoning_content: "inspect config"` and the second carries none

#### Scenario: Tool-call turn with signed blocks
- **WHEN** an `anthropic` route turn with replay on connection `c1` returns one signed thinking block and calls a tool
- **THEN** the first tool call also stores that block with origin connection `c1` and the model id

#### Scenario: Final answer with reasoning
- **WHEN** a turn streams reasoning and answers with text only
- **THEN** the persisted assistant message has no `reasoning_content` and no stored blocks

#### Scenario: Forked session
- **GIVEN** a parent session whose assistant tool-call turn stored reasoning
- **WHEN** a fork continues the conversation
- **THEN** the effective transcript keeps that stored reasoning and blocks

## ADDED Requirements

### Requirement: Exact context measurement
When no fresh provider-reported prompt usage exists for the agent's next request and its connection offers exact token counting, context measurement for compaction thresholds and context indicators SHALL use the provider count instead of the local estimate. A failed or unavailable count SHALL fall back to the calibrated local estimate without failing the turn, and the count SHALL be cached for the unchanged transcript.

#### Scenario: Measurement after compaction
- **GIVEN** an agent whose connection offers exact counting and whose last provider usage predates the active compaction checkpoint
- **WHEN** the context is measured
- **THEN** the provider token count is used and reported as provider-sourced

#### Scenario: Counting unavailable
- **WHEN** the count request fails
- **THEN** the calibrated local estimate is used and the turn continues
