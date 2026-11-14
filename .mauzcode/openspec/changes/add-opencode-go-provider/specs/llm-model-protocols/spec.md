## ADDED Requirements

### Requirement: Reasoning on the wire
When a request carries SDK-resolved reasoning with an applied level other than `auto`, each shared protocol SHALL send the level's declared native wire value (or the SDK level name) in its native field: `reasoning_effort` (openai-chat), `reasoning.effort` (openai-responses), `output_config.effort` or, for `off` with thinking-disable, `thinking: {type: "disabled"}` (anthropic), `thinkingConfig.thinkingLevel` for low/medium/high only (gemini). Otherwise no reasoning field SHALL be sent.

#### Scenario: Effort with a native wire value
- **WHEN** an `openai-chat` request carries applied `xhigh` whose native wire value is `max`
- **THEN** the body contains `reasoning_effort: "max"`

#### Scenario: Thinking disabled on Anthropic Messages
- **WHEN** an `anthropic` request carries applied `off` and the capabilities declare thinking-disable
- **THEN** the body contains `thinking: {type: "disabled"}` and no `output_config`

#### Scenario: Off without a native representation
- **WHEN** an `anthropic` request carries applied `off` without thinking-disable and no wire value for `off`
- **THEN** no reasoning field is sent

#### Scenario: Request without SDK reasoning
- **WHEN** a custom connection streams through a shared protocol
- **THEN** the request body is unchanged from the behavior before this change
