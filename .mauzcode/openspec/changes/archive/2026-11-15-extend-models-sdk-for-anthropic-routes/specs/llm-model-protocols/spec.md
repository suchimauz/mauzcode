## MODIFIED Requirements

### Requirement: Reasoning on the wire
When a request carries SDK-resolved reasoning with an applied level other than `auto`, each shared protocol SHALL send the level's declared native wire value (or the SDK level name) in its native field: `reasoning_effort` (openai-chat), `reasoning.effort` (openai-responses), `output_config.effort` or, for `off` with thinking-disable, `thinking: {type: "disabled"}` (anthropic), `thinkingConfig.thinkingLevel` for low/medium/high only (gemini). When the resolution declares adaptive thinking and the applied level is not `off`, `anthropic` SHALL also send `thinking: {type: "adaptive"}`. When it declares no effort, no effort field SHALL be sent. Other protocols SHALL ignore the adaptive flag.

#### Scenario: Effort with a native wire value
- **WHEN** an `openai-chat` request carries applied `xhigh` whose native wire value is `max`
- **THEN** the body contains `reasoning_effort: "max"`

#### Scenario: Thinking disabled on Anthropic Messages
- **WHEN** an `anthropic` request carries applied `off` and the capabilities declare thinking-disable
- **THEN** the body contains `thinking: {type: "disabled"}` and no `output_config`

#### Scenario: Off without a native representation
- **WHEN** an `anthropic` request carries applied `off` without thinking-disable and no wire value for `off`
- **THEN** no reasoning field is sent

#### Scenario: Adaptive thinking with effort
- **WHEN** an `anthropic` request carries applied `xhigh` with the adaptive flag
- **THEN** the body contains `thinking: {type: "adaptive"}` and `output_config: {effort: "xhigh"}`

#### Scenario: Adaptive thinking without effort
- **WHEN** an `anthropic` request carries applied `high` with the adaptive flag and effort `false`
- **THEN** the body contains `thinking: {type: "adaptive"}` and no `output_config`

#### Scenario: Request without SDK reasoning
- **WHEN** a custom connection streams through a shared protocol
- **THEN** the request body is unchanged from the behavior before this change

### Requirement: OpenAI Chat provider body fields
The `openai-chat` and `anthropic` protocols SHALL merge provider body fields from their endpoint into the request body after building their own fields, never replacing a protocol-owned field. The `openai-responses` and `gemini` protocols SHALL ignore provider body fields.

#### Scenario: Thinking field sent
- **WHEN** an `openai-chat` endpoint carries body `{ thinking: { type: "enabled" } }` and the request carries applied reasoning `xhigh` with wire `max`
- **THEN** the body contains both `thinking: {type: "enabled"}` and `reasoning_effort: "max"`

#### Scenario: Service tier on Anthropic Messages
- **WHEN** an `anthropic` endpoint carries body `{ service_tier: "standard" }`
- **THEN** the body contains `service_tier: "standard"` alongside the protocol's own fields

#### Scenario: Body fields on another protocol
- **WHEN** a `gemini` endpoint carries provider body fields
- **THEN** the request body is the same as without them

### Requirement: Stored reasoning ignored by other protocols
Protocols SHALL ignore stored reasoning they cannot replay and SHALL NOT fail because of it: `openai-responses`, `anthropic` and `gemini` ignore `reasoning_content`; `openai-chat`, `openai-responses` and `gemini` ignore stored signed reasoning blocks; `anthropic` ignores blocks without replay or from another connection or model. Gemini SHALL keep rejecting a foreign `thought_signature`.

#### Scenario: Gemini after a GLM turn
- **GIVEN** a transcript whose assistant tool call stores `reasoning_content`
- **WHEN** the conversation continues on a `gemini` model
- **THEN** the request is built without that reasoning and does not fail

#### Scenario: OpenAI Chat after an Anthropic route turn
- **GIVEN** a transcript whose assistant tool call stores signed reasoning blocks
- **WHEN** the conversation continues on an `openai-chat` model
- **THEN** the request is built without those blocks and does not fail

#### Scenario: Foreign thought signature
- **WHEN** a canonical tool call carries `thought_signature`
- **THEN** the `gemini` conversion still fails as before

## ADDED Requirements

### Requirement: Anthropic server-chosen output budget
The `anthropic` protocol SHALL send `max_tokens` from the request, or its default of 4096, unless its endpoint declares a server-chosen budget; then it SHALL send no `max_tokens`.

#### Scenario: Default budget
- **WHEN** an `anthropic` request has no `maxTokens` and the endpoint declares nothing
- **THEN** the body contains `max_tokens: 4096`

#### Scenario: Server-chosen budget
- **WHEN** an `anthropic` request carries `maxTokens` 300 and the endpoint declares a server-chosen budget
- **THEN** the body contains no `max_tokens`

### Requirement: Anthropic reasoning block capture
The `anthropic` protocol SHALL return the complete `thinking` and `redacted_thinking` content blocks of a response, in order, with their text, signature and data accumulated from `thinking_delta` and `signature_delta` events, in addition to the joined reasoning text. Token usage SHALL come from the latest event that reports it.

#### Scenario: Signed thinking block
- **WHEN** a stream sends a thinking block with two `thinking_delta` events and one `signature_delta`
- **THEN** the result carries one block `{type: "thinking", thinking: <joined text>, signature: <signature>}`

#### Scenario: Usage from the final delta
- **WHEN** `message_start` reports input tokens 0 and the final `message_delta` reports input tokens 1200
- **THEN** the returned prompt usage is 1200

### Requirement: Anthropic reasoning block replay
With replay requested, the `anthropic` protocol SHALL put the signed reasoning blocks stored on an assistant tool-call turn, unchanged, at the start of that assistant message, but only when they were captured from the same connection and model as the current request. Blocks without a signature or data SHALL NOT be sent.

#### Scenario: Same model
- **GIVEN** stored blocks captured on connection `c1` model `model-a`
- **WHEN** a request with replay on `c1` and `model-a` converts the transcript
- **THEN** the assistant message content is the blocks followed by its text and `tool_use` blocks

#### Scenario: Different connection
- **WHEN** the same transcript is sent with replay on connection `c2`
- **THEN** no stored block is sent
