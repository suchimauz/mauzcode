## ADDED Requirements

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
