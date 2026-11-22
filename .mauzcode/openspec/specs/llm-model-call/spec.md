# llm-model-call Specification

## Purpose
Defines the one-shot, non-agent model call of the `models` stack: a single user prompt sent to one enabled model of a stored connection through the provider SDK, with capability-gated options, bounded retries on the same connection and normalized structured output, so runtime synthesis no longer depends on legacy provider routing.

## Requirements

### Requirement: One-shot call contract
The system SHALL provide `models.call`, addressed by `connectionId` and a provider-native `model`, that sends a non-empty `user` prompt as one user message with optional `system` instructions and no tools. It SHALL apply the same enabled, capability and input checks as `models.stream` and SHALL return `text`, `finishReason`, `usage`, the resolved `reasoning`, the number of `attempts` and the `ignored` option names.

#### Scenario: Successful call
- **WHEN** `models.call` targets an enabled model of an enabled connection whose provider streams text `Hello`
- **THEN** it returns text `Hello`, the provider finish reason and usage, `attempts` 1 and an empty `ignored` list

#### Scenario: Empty prompt
- **WHEN** `user` is empty or only whitespace
- **THEN** the call fails with code `INVALID_INPUT` and no request is sent

#### Scenario: Invalid timeout
- **WHEN** `timeoutMs` is not an integer between 1 and 3600000
- **THEN** the call fails with code `INVALID_INPUT` and no request is sent

#### Scenario: Disabled model
- **WHEN** the model is in the connection's disabled models
- **THEN** the call fails with code `MODEL_DISABLED_BY_USER` and no request is sent

#### Scenario: Provider without streaming
- **WHEN** the connection's provider declares no streaming operation
- **THEN** the call fails with code `UNSUPPORTED` and no request is sent

#### Scenario: Stable session identity
- **WHEN** `sessionId` is omitted
- **THEN** one generated identifier is used for every attempt of that call

### Requirement: Capability-gated call options
The call SHALL pass `temperature` and `maxTokens` only to providers declaring `sampling` and SHALL report each dropped option name in `ignored` instead of failing. `maxTokens` SHALL be a positive integer and `temperature` a finite number between 0 and 2; other values SHALL fail with code `INVALID_INPUT` before any request. `providerOptions` SHALL be passed to the provider unchanged.

#### Scenario: Sampling not supported
- **WHEN** a call with `temperature` targets a provider without `sampling`
- **THEN** the request is sent without temperature and `ignored` contains `temperature`

#### Scenario: Invalid output budget
- **WHEN** `maxTokens` is 0
- **THEN** the call fails with code `INVALID_INPUT` and no request is sent

### Requirement: Bounded retries on the same connection
The call SHALL retry on the same connection and model, at most three attempts in total, only when the failure is `retryable`, `replaySafe` and its `acceptance` is `none` or `rejected`, waiting `retryAfterMs` or else 500 ms and then 2000 ms. It SHALL NOT retry past the `timeoutMs` deadline or after cancellation, and SHALL NOT switch connection, account or model. A Codex retry MUST prove it is still in the same verified account generation, regardless of the options supplied.

#### Scenario: Transient throttling
- **WHEN** the first attempt fails with a retryable, replay-safe throttled failure with acceptance `none` and the second succeeds
- **THEN** the call returns the second result with `attempts` 2

#### Scenario: Upstream may have accepted the request
- **WHEN** an attempt fails with acceptance `uncertain` or `accepted`
- **THEN** the call fails with that failure without retrying

#### Scenario: Deadline shorter than the delay
- **WHEN** a retryable failure asks for a delay longer than the remaining deadline
- **THEN** the call fails with that failure without waiting

#### Scenario: Cancellation during the delay
- **WHEN** the signal is aborted while waiting before a retry
- **THEN** the call rejects with an abort error and sends no further request

#### Scenario: Ordinary calls cannot cross a login boundary
- **GIVEN** the first attempt on Codex account A used omitted options or explicit Standard and Default
- **WHEN** a replacement login completes during retry backoff, even for the same account ID
- **THEN** the call terminates without sending its prompt a second time
- **AND** ordinary token renewal that verifies continuity does not by itself prevent an otherwise safe retry

#### Scenario: Account continuity cannot be proved
- **WHEN** a valid default first attempt used credentials without a verified identity, or the verified binding is lost before retry
- **THEN** no second inference request is sent, even if the connection later obtains a verified identity

### Requirement: Structured output
When `responseFormat` is given, the call SHALL pass it to providers declaring `structuredOutput` and otherwise append a JSON-only instruction with the schema. It SHALL strip code fences, parse JSON, check the schema's object type, required and `additionalProperties: false`, and return compact JSON. A violation SHALL fail with code `INVALID_OUTPUT`, `retryable:false`, without echoing the response.

#### Scenario: Fenced JSON from a provider without structured output
- **WHEN** a provider without `structuredOutput` answers "```json\n{\"a\":1}\n```" to a `json_object` call
- **THEN** the call returns text `{"a":1}`

#### Scenario: Missing required property
- **WHEN** a `json_schema` call requires property `a` and the provider answers `{"b":1}`
- **THEN** the call fails with code `INVALID_OUTPUT`

#### Scenario: Native structured output
- **WHEN** a `json_schema` call targets a provider declaring `structuredOutput`
- **THEN** the provider receives `responseFormat` and the instructions contain no JSON fallback text
