## ADDED Requirements

### Requirement: Reasoning kept on tool-call turns
When an agent turn ends with tool calls and the stream returned non-empty reasoning, the agent SHALL store that reasoning as `reasoning_content` on the first tool call of the persisted assistant message, so it survives saves and forks and protocols that request replay can send it back. Turns without tool calls or without reasoning SHALL be stored unchanged.

#### Scenario: Tool-call turn with reasoning
- **WHEN** a turn streams reasoning `inspect config` and calls two tools
- **THEN** the persisted assistant message's first tool call carries `reasoning_content: "inspect config"` and the second carries none

#### Scenario: Final answer with reasoning
- **WHEN** a turn streams reasoning and answers with text only
- **THEN** the persisted assistant message has no `reasoning_content`

#### Scenario: Forked session
- **GIVEN** a parent session whose assistant tool-call turn stored reasoning
- **WHEN** a fork continues the conversation
- **THEN** the effective transcript keeps that stored reasoning
