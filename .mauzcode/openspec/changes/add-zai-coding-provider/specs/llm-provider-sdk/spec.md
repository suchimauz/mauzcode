## MODIFIED Requirements

### Requirement: Protocol-route providers
A provider definition MAY declare a protocol route instead of a streaming operation, returning a shared protocol id, base URL and headers for a connection, model, cached model metadata and session id. The route MAY also return provider body fields and a reasoning-replay flag. Registration MUST reject a definition declaring both. The core SHALL run all existing inference checks first, then stream through that shared protocol on the connection's transport, merging headers as: JSON accept, protocol headers, provider headers.

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
- **THEN** the request body is unchanged from the behavior before body fields and replay existed

## ADDED Requirements

### Requirement: Protocol route body fields
A protocol route MAY return `body`, a JSON object of provider fields the core passes to the shared protocol with the endpoint. A key the protocol owns (`model`, `messages`, `stream`, `stream_options`, `tools`, `max_tokens`, `temperature`, `response_format`, `reasoning_effort` for `openai-chat`) MUST fail with `INVALID_INPUT` before any request. Protocols that do not support body fields SHALL ignore them.

#### Scenario: Extra field accepted
- **WHEN** a route for `openai-chat` returns body `{ thinking: { type: "enabled" } }`
- **THEN** the request body contains that field alongside the protocol's own fields

#### Scenario: Protocol-owned key
- **WHEN** a route returns body `{ model: "other" }`
- **THEN** inference fails with code `INVALID_INPUT` and no request is sent

### Requirement: Protocol route reasoning replay
A protocol route MAY return `replayReasoning: true`, which the core passes to the shared protocol with the endpoint, asking it to replay reasoning stored on earlier assistant tool-call turns in its native form. Without the flag no stored reasoning SHALL be sent.

#### Scenario: Replay not requested
- **GIVEN** a transcript with stored reasoning on an assistant tool-call turn
- **WHEN** a route without `replayReasoning` streams through `openai-chat`
- **THEN** no wire message carries `reasoning_content`
