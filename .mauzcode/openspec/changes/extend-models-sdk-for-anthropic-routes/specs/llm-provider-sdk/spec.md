## MODIFIED Requirements

### Requirement: SDK-owned reasoning capabilities
The SDK SHALL define provider-owned supported reasoning levels, an optional supported default, optional native wire values per level, an optional thinking-disable flag, an optional adaptive-thinking flag, an optional effort flag and requested/applied preference diagnostics. Adaptive thinking asks protocols that support it to send their native adaptive-thinking switch for every applied level other than `off` and `auto`. Effort `false` means the model only switches thinking on or off and no effort value is sent. Providers not opting in MUST retain their existing behavior.

#### Scenario: Invalid metadata or preference
- **WHEN** supported levels are empty, a declared default is unsupported, a wire value is empty or for an unsupported level, the adaptive or effort flag is not boolean, or the preference is outside the SDK enumeration
- **THEN** the SDK reports a validation failure rather than sending an invalid effort downstream

#### Scenario: Provider not opted in
- **WHEN** an existing provider without SDK capability normalization receives its existing reasoning input
- **THEN** its established behavior is preserved and no new capability lookup is forced on it

#### Scenario: Adaptive flag carried to the protocol
- **WHEN** a model's capabilities declare adaptive thinking and the applied level is `high`
- **THEN** the resolved reasoning passed to the protocol carries the adaptive flag with effort `high`

#### Scenario: Thinking switch without effort
- **WHEN** capabilities declare adaptive thinking with effort `false` and the applied level is `high`
- **THEN** the resolved reasoning carries the adaptive flag and no effort

### Requirement: Protocol route body fields
A protocol route MAY return `body`, a JSON object of provider fields the core passes to the shared protocol with the endpoint. The core SHALL reject with `INVALID_INPUT`, before any request, a key the selected protocol owns: `model`, `messages`, `stream`, `stream_options`, `tools`, `max_tokens`, `temperature`, `response_format`, `reasoning_effort` for `openai-chat`; `model`, `messages`, `system`, `stream`, `tools`, `max_tokens`, `temperature`, `thinking`, `output_config` for `anthropic`. Protocols that do not support body fields SHALL ignore them.

#### Scenario: Extra field accepted
- **WHEN** a route for `openai-chat` returns body `{ thinking: { type: "enabled" } }`
- **THEN** the request body contains that field alongside the protocol's own fields

#### Scenario: Extra field on Anthropic Messages
- **WHEN** a route for `anthropic` returns body `{ service_tier: "priority" }`
- **THEN** the request body contains that field alongside the protocol's own fields

#### Scenario: Protocol-owned key
- **WHEN** a route returns body `{ model: "other" }`
- **THEN** inference fails with code `INVALID_INPUT` and no request is sent

#### Scenario: Anthropic-owned thinking key
- **WHEN** a route for `anthropic` returns body `{ thinking: { type: "adaptive" } }`
- **THEN** inference fails with code `INVALID_INPUT` and no request is sent

### Requirement: Protocol route reasoning replay
A protocol route MAY return `replayReasoning: true`, which the core passes to the shared protocol with the endpoint, asking it to replay reasoning stored on earlier assistant tool-call turns in its native form. For `openai-chat` that is the stored reasoning text; for `anthropic` it is the stored signed reasoning blocks captured from the same connection and model. Without the flag no stored reasoning SHALL be sent.

#### Scenario: Replay not requested
- **GIVEN** a transcript with stored reasoning on an assistant tool-call turn
- **WHEN** a route without `replayReasoning` streams through `openai-chat`
- **THEN** no wire message carries `reasoning_content`

#### Scenario: Anthropic replay requested
- **GIVEN** a transcript with signed reasoning blocks stored from the same connection and model
- **WHEN** a route with `replayReasoning` streams through `anthropic`
- **THEN** the blocks are sent unchanged at the start of their assistant message

### Requirement: Protocol-route providers
A provider definition MAY declare a protocol route instead of a streaming operation. For a connection, model, cached model metadata and session id it returns a shared protocol id, base URL and headers, and optionally body fields, reasoning replay and a server-chosen output budget. Declaring both MUST fail registration. After all inference checks the core SHALL stream through that protocol on the connection's transport, merging headers: JSON accept, protocol headers, provider headers.

#### Scenario: Provider streams through a route
- **WHEN** a stream request targets an enabled model of a provider declaring a protocol route that returns `anthropic`
- **THEN** the request is sent in Anthropic Messages format to the returned base through the connection's transport
- **AND** the normalized result is returned as for any streaming provider

#### Scenario: Route returns an unknown protocol
- **WHEN** a protocol route returns an id outside the shared protocol set
- **THEN** inference fails with code `INVALID_INPUT` and no request is sent

#### Scenario: Route and stream both declared
- **WHEN** a provider declaration contains both a streaming operation and a protocol route
- **THEN** registration of that provider fails with an error

#### Scenario: Route model without reasoning controls
- **GIVEN** a protocol-route provider opted into reasoning
- **WHEN** the requested model was discovered without reasoning metadata and no profile applies
- **THEN** the request streams without any reasoning field instead of failing capability-unavailable

#### Scenario: Disabled model with a route provider
- **WHEN** the requested model or connection is disabled
- **THEN** the existing disabled-state error is returned and the protocol route is not called

#### Scenario: Route without body fields or replay
- **WHEN** a protocol route returns only protocol, base URL and headers
- **THEN** the request body is unchanged from the behavior before body fields, replay and the server-chosen budget existed

## ADDED Requirements

### Requirement: Protocol route server-chosen output budget
A protocol route MAY return `serverMaxTokens: true`, which the core passes to the shared protocol with the endpoint. When set, the protocol SHALL send no output budget field, neither its default nor the request's `maxTokens`, and let the upstream choose. Without the flag the protocol's existing behavior applies.

#### Scenario: Default budget omitted
- **WHEN** a route for `anthropic` returns `serverMaxTokens: true` and the request has no `maxTokens`
- **THEN** the request body contains no `max_tokens`

#### Scenario: Flag absent
- **WHEN** a route for `anthropic` returns no `serverMaxTokens` and the request has no `maxTokens`
- **THEN** the request body contains `max_tokens: 4096`

### Requirement: Provider failure classification
A protocol-route provider MAY declare a failure classifier that receives the upstream status and a bounded, already-parsed error body of a failed request and returns a stable code, classification, retryability and optional reset time. The core SHALL use its answer instead of the status-based classification when it returns one, SHALL keep the message credential-safe, and SHALL fall back to the status-based classification when it returns none or throws.

#### Scenario: Provider recognizes a quota error
- **WHEN** a request fails with HTTP 429 and the provider classifier returns `QUOTA_EXHAUSTED` with a reset time
- **THEN** the thrown failure has classification `quota`, that code and reset time, and no upstream body text

#### Scenario: Classifier returns nothing
- **WHEN** the classifier returns no result for a 429
- **THEN** the failure is the status-based `THROTTLED`

### Requirement: Optional exact token counting
A provider definition MAY declare a token-counting operation that receives the same request shape as streaming (messages, instructions, tools, model) and returns the provider-reported input token count without generating output, through the connection's transport. A public counting entry point SHALL return that count, or `null` when the provider declares no counting or the count fails, without failing the caller.

#### Scenario: Provider counts tokens
- **WHEN** a count is requested for a model whose provider declares counting
- **THEN** the provider's count is returned and no generation request is sent

#### Scenario: Provider without counting
- **WHEN** a count is requested for a provider without counting
- **THEN** `null` is returned without any network request
