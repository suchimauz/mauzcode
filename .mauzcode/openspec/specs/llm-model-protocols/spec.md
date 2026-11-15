# llm-model-protocols Specification

## Purpose
Provide a closed set of reusable wire protocols for model discovery and minimal generation probes, while keeping authentication provider-owned and all requests on the connection's selected transport.

## Requirements

### Requirement: Closed set of shared protocols
The system SHALL provide exactly four shared wire protocols, identified as `openai-chat`, `openai-responses`, `anthropic` and `gemini`. The set SHALL be owned by core; plugins and provider declarations SHALL NOT add, replace or remove shared protocols. Listing the shared protocols SHALL return these four protocols as id and label pairs in a stable order.

#### Scenario: Listing shared protocols
- **WHEN** the shared protocol list is requested
- **THEN** it returns `openai-chat`, `openai-responses`, `anthropic` and `gemini` in that order, each with its display label

#### Scenario: Unknown protocol id
- **WHEN** a shared protocol is requested by an id outside the set
- **THEN** the request fails with an unsupported protocol error and no network request is made

### Requirement: Protocol strategy contract
Every shared protocol SHALL implement model discovery and a minimal probe on a provider-supplied endpoint and the transport-bound fetch. A probe SHALL require a model id. Both SHALL accept an optional abort signal. A protocol SHALL also normalize a configured base URL to its versioned API base, provide its required non-authentication headers, and map an API key to its standard authentication headers.

#### Scenario: Signal aborted before the request
- **WHEN** discovery or a probe is called with a signal that is already aborted
- **THEN** the operation rejects with an abort error and no request is sent

#### Scenario: Signal aborted after the response
- **WHEN** the signal is aborted after the response has arrived but before the operation completes
- **THEN** the operation rejects and the response body is cancelled

#### Scenario: Probe without a model
- **WHEN** a probe is called with an empty model id
- **THEN** it fails with a test model required error and no request is sent

#### Scenario: Base URL with empty query or fragment
- **WHEN** a base URL whose raw text contains `?` or `#`, even with nothing after it, is normalized
- **THEN** normalization fails with an invalid base URL error

#### Scenario: Discovery through a shared protocol
- **WHEN** a provider asks a shared protocol to discover models for an endpoint
- **THEN** the protocol requests its catalogue path and returns unique non-empty model ids in catalogue order

#### Scenario: Probe with a model
- **WHEN** a provider asks a shared protocol to probe an endpoint with a model id
- **THEN** the protocol sends one minimal non-streaming generation for that model limited to one output token

#### Scenario: Versioned base URL
- **WHEN** a base URL is normalized by `anthropic` or `gemini` after trailing slashes are trimmed
- **THEN** `anthropic` keeps a base ending with `/v1` and appends `/v1` to any other base
- **AND** `gemini` keeps a base ending with `/v1` or `/v1beta` and appends `/v1beta` to any other base
- **AND** the OpenAI protocols keep the base unchanged

### Requirement: Selection without protocol branching
Selecting a shared protocol SHALL be a single lookup by id. Behavior that differs between protocols SHALL live in the protocol implementations, not in conditional branches of callers.

#### Scenario: Provider uses the selected protocol
- **WHEN** a provider performs discovery or a probe for a configured protocol id
- **THEN** it obtains the protocol by id and calls its operations without branching on the id

### Requirement: Provider-owned authentication
A protocol SHALL NOT read connection secrets: it SHALL receive only the transport-bound fetch, not the connection itself. The provider SHALL build the endpoint headers, including any authentication. A shared protocol's API-key header mapping SHALL be: bearer `Authorization` for both OpenAI protocols, `x-api-key` for Anthropic, and `x-goog-api-key` for Gemini.

#### Scenario: Provider without an API key
- **WHEN** a provider builds an endpoint without an API key
- **THEN** the protocol requests carry no authentication header

### Requirement: Protocol-required headers
A shared protocol SHALL provide its required non-authentication headers separately from its API-key mapping, and they SHALL be sent whether or not an API key exists. For Anthropic this is `anthropic-version: 2023-06-01`. Header merging SHALL be case-insensitive.

#### Scenario: Anthropic without an API key
- **WHEN** an `anthropic` endpoint is built without an API key
- **THEN** requests carry `anthropic-version: 2023-06-01` and no `x-api-key`

### Requirement: Transport and failure safety
Protocol requests SHALL be sent only through the connection's transport-bound fetch. A non-success HTTP response or a malformed catalogue SHALL fail the operation without exposing the response body, and the response body SHALL be released.

#### Scenario: Discovery request fails
- **WHEN** the catalogue request returns a non-success status
- **THEN** discovery fails with a message containing only the HTTP status and the body is cancelled

#### Scenario: Malformed catalogue
- **WHEN** the catalogue response is invalid JSON, is `null`, or lacks an array at the protocol's model collection field
- **THEN** discovery fails with exactly `Invalid model catalogue`, without exposing response content or parser messages
- **AND** the response body is released by consuming it or cancelling any unread body

#### Scenario: Malformed catalogue elements
- **WHEN** a model array contains nulls, non-object elements, or elements with non-string or empty model identifiers
- **THEN** discovery skips those elements before performing string operations
- **AND** returns valid non-empty identifiers, normalized by the protocol and de-duplicated in catalogue order
- **AND** the response body is released

#### Scenario: Response content is not disclosed on JSON parsing failure
- **WHEN** any of the four protocols receives invalid JSON containing sensitive response text
- **THEN** the exposed error is exactly `Invalid model catalogue` and contains neither that text nor the JSON parser message
- **AND** the response body is released

### Requirement: Protocol streaming generation
Every shared protocol SHALL implement streaming generation on a provider-supplied endpoint and the transport-bound fetch: it SHALL send the OpenAI-shaped transcript, instructions, tools and options in its native wire format, report deltas through `onEvent`, and return a `StreamResult` with a normalized finish reason (`stop`, `length`, `tool_calls` or the upstream value). It SHALL map `responseFormat` to its native structured output form.

#### Scenario: Native structured output mapping
- **WHEN** a request carries a `json_schema` response format
- **THEN** `openai-chat` sends `response_format`, `openai-responses` sends `text.format`, `gemini` sends `responseMimeType` and `responseSchema`, and `anthropic` appends a JSON-only instruction to the system prompt

#### Scenario: Streaming text through a shared protocol
- **WHEN** a provider streams a request through any shared protocol and the upstream answers with text deltas and a terminal event
- **THEN** every delta is reported as `text_delta` and the joined text, finish reason `stop` and usage are returned

#### Scenario: Output budget and temperature
- **WHEN** a request carries `maxTokens` and `temperature`
- **THEN** the protocol sends them in its native fields (`max_tokens`, `max_output_tokens` or `generationConfig.maxOutputTokens`, and `temperature`)

#### Scenario: Anthropic request without an output budget
- **WHEN** an `anthropic` stream request carries no `maxTokens`
- **THEN** the protocol sends its default output budget of 4096 tokens

#### Scenario: Upstream HTTP error
- **WHEN** the upstream answers a stream request with a non-success status
- **THEN** the protocol fails with an SDK failure classified from the status, the response body is cancelled and no upstream body text is included in the message

#### Scenario: Stream ends without a terminal event
- **WHEN** the response stream ends before its protocol-specific terminal event
- **THEN** the protocol fails with a retryable transport failure whose acceptance is `uncertain`

#### Scenario: Signal aborted before streaming
- **WHEN** a stream is requested with an already aborted signal
- **THEN** the operation rejects with an abort error and no request is sent

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
