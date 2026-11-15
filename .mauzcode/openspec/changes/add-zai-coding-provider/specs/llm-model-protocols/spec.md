## ADDED Requirements

### Requirement: OpenAI Chat provider body fields
The `openai-chat` protocol SHALL merge provider body fields from its endpoint into the request body after building its own fields. It SHALL NOT let a provider field replace a protocol-owned field. Other shared protocols SHALL ignore provider body fields.

#### Scenario: Thinking field sent
- **WHEN** an `openai-chat` endpoint carries body `{ thinking: { type: "enabled" } }` and the request carries applied reasoning `xhigh` with wire `max`
- **THEN** the body contains both `thinking: {type: "enabled"}` and `reasoning_effort: "max"`

#### Scenario: Body fields on another protocol
- **WHEN** an `anthropic` endpoint carries provider body fields
- **THEN** the request body is the same as without them

### Requirement: OpenAI Chat reasoning replay
When its endpoint requests reasoning replay, the `openai-chat` protocol SHALL set `reasoning_content` on each assistant wire message with tool calls whose canonical message stored non-empty reasoning on its first tool call. Without replay, or with empty stored reasoning, no `reasoning_content` SHALL be sent.

#### Scenario: Stored reasoning replayed
- **GIVEN** an assistant message with a tool call storing `reasoning_content: "plan"`
- **WHEN** an `openai-chat` endpoint with replay converts the transcript
- **THEN** the assistant wire message carries `reasoning_content: "plan"` and its tool calls unchanged

#### Scenario: Assistant text without tool calls
- **WHEN** an assistant message has no tool calls
- **THEN** no `reasoning_content` is sent for it

### Requirement: Stored reasoning ignored by other protocols
The `openai-responses`, `anthropic` and `gemini` protocols SHALL ignore `reasoning_content` stored on canonical tool calls and SHALL NOT fail because of it. Gemini SHALL keep rejecting a foreign `thought_signature`.

#### Scenario: Gemini after a GLM turn
- **GIVEN** a transcript whose assistant tool call stores `reasoning_content`
- **WHEN** the conversation continues on a `gemini` model
- **THEN** the request is built without that reasoning and does not fail

#### Scenario: Foreign thought signature
- **WHEN** a canonical tool call carries `thought_signature`
- **THEN** the `gemini` conversion still fails as before
