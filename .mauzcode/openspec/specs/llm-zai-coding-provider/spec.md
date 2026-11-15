# llm-zai-coding-provider Specification

## Purpose
Connect a Z.ai Coding Plan subscription as a core Models provider: API-key authentication, a per-connection choice of shared protocol, model discovery, five-hour and weekly quota usage, connection testing and GLM-5.3 reasoning, all through the connection's saved transport.

## Requirements

### Requirement: Z.ai Coding Plan connection
The system SHALL register a core provider `zai-coding` labelled "Z.ai Coding Plan" with a required secret `apiKey` (a Coding Plan key), a `protocol` select of `openai-chat` (default) or `anthropic`, and direct, SOCKS and SSH-tunnel transports. Connections SHALL be created by the owner in Models. Requests SHALL go only to `https://api.z.ai/...` through the connection's transport, with no fallback to the standard API or another provider.

#### Scenario: Connection created
- **WHEN** the owner creates a `zai-coding` connection with an API key and no protocol
- **THEN** the connection is saved with the key in encrypted secret storage and protocol `openai-chat`

#### Scenario: Unsupported protocol value
- **WHEN** the owner saves a `zai-coding` connection with protocol `gemini`
- **THEN** validation fails and nothing is stored

#### Scenario: Missing key
- **WHEN** an operation runs on a `zai-coding` connection without an API key
- **THEN** it fails without contacting the network

### Requirement: Z.ai key confidentiality
The API key MUST NOT be returned, logged or included in errors, test results, usage reports or model metadata. Provider errors SHALL carry only a safe message and the HTTP status, never the upstream body.

#### Scenario: Upstream rejects the key
- **WHEN** Z.ai answers any provider request with HTTP 401 and a body echoing the key
- **THEN** the resulting error mentions status 401 and contains neither the key nor the body

### Requirement: Z.ai protocol routing
The provider SHALL stream through a protocol route chosen by the connection's protocol: `openai-chat` with base `https://api.z.ai/api/coding/paas/v4` and `Authorization: Bearer <key>`; `anthropic` with base `https://api.z.ai/api/anthropic` and both `Authorization: Bearer <key>` and `x-api-key: <key>`. The provider SHALL NOT implement its own streaming operation.

#### Scenario: OpenAI Chat connection
- **WHEN** an agent streams `glm-5.3` on a `zai-coding` connection with protocol `openai-chat`
- **THEN** the request is POSTed to `https://api.z.ai/api/coding/paas/v4/chat/completions` through the connection's transport

#### Scenario: Anthropic connection
- **WHEN** an agent streams a model on a `zai-coding` connection with protocol `anthropic`
- **THEN** the request is POSTed in Anthropic Messages format to `https://api.z.ai/api/anthropic/v1/messages`

### Requirement: Z.ai model discovery
Model discovery SHALL read `GET https://api.z.ai/api/coding/paas/v4/models` for either protocol and list each reported id matching `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$` once, in catalogue order. A non-success status or a payload without a `data` array SHALL fail with a safe error; invalid entries SHALL be dropped.

#### Scenario: Catalogue with duplicates and invalid ids
- **WHEN** discovery returns ids `glm-5.3`, `glm-5.3`, `../x` and `glm-4.7`
- **THEN** the listed models are `glm-5.3` and `glm-4.7`

#### Scenario: Discovery HTTP error
- **WHEN** the models endpoint answers HTTP 500
- **THEN** discovery fails with an error naming status 500 and the cached list is kept

### Requirement: Z.ai quota usage
Usage SHALL read `GET https://api.z.ai/api/monitor/usage/quota/limit` with an explicit GET, no redirects and a bounded timeout. Only a response with `success: true`, `code: 200` and a `data.limits` array SHALL be accepted. `CREDIT_LIMIT` entries with unit 3 and number 5 SHALL map to an account `fiveHour` window and unit 6 with number 1 to an account `weekly` window, each with a 0–100 used percent and reset time from `nextResetTime` in milliseconds; `data.level` SHALL be the plan.

#### Scenario: Both windows reported
- **WHEN** the endpoint reports `CREDIT_LIMIT` unit 3 number 5 at 40% and unit 6 number 1 at 10% with level `pro`
- **THEN** usage is available with plan `pro`, a five-hour window at 40% and a weekly window at 10%, both scope `account`

#### Scenario: Unrecognized response
- **WHEN** the endpoint answers `success: false` or reports no recognized window
- **THEN** usage reports unavailable with a safe reason and no window shows zero usage

#### Scenario: Out-of-range entry
- **WHEN** a recognized entry reports percentage 140 or a missing reset time
- **THEN** that window is omitted

### Requirement: Z.ai connection test
The connection test SHALL call the quota endpoint as an authenticated, read-only, free check and SHALL NOT run a generation. A recognized response SHALL report the connection healthy; HTTP 401 or 403 SHALL report an authentication failure; other failures SHALL report the connection unavailable.

#### Scenario: Valid key
- **WHEN** the owner tests a connection whose key the quota endpoint accepts
- **THEN** the test reports success without any chat request

#### Scenario: Revoked key
- **WHEN** the quota endpoint answers HTTP 401
- **THEN** the test reports an authentication failure

### Requirement: GLM-5.3 reasoning levels
On `openai-chat` connections, discovery SHALL attach reasoning metadata to `glm-5.3`, `glm-5.3-flash` and `glm-5.3-flashx`: supported `auto`, `low`, `high`, `xhigh`, default `xhigh`, with `xhigh` sent as `max`. Other models and every model on `anthropic` connections SHALL have no reasoning metadata and stream without reasoning fields.

#### Scenario: Default effort
- **WHEN** an agent with effort `auto` streams `glm-5.3` on an `openai-chat` connection
- **THEN** the request body contains `reasoning_effort: "max"`

#### Scenario: Unsupported level
- **WHEN** an agent requests `medium` for `glm-5.3`
- **THEN** the nearest supported level at or below it, `low`, is applied

#### Scenario: Model without reasoning metadata
- **WHEN** an agent streams `glm-4.7` on a `zai-coding` connection
- **THEN** the request contains no reasoning field and does not fail capability-unavailable

### Requirement: GLM-5.3 thinking and reasoning replay
For a GLM-5.3 model on an `openai-chat` connection with applied reasoning other than `auto`, the route SHALL add `thinking: {type: "enabled"}` to the request body and request reasoning replay, so earlier assistant tool-call turns carry their stored reasoning as `reasoning_content`. On `anthropic` connections the route SHALL add neither.

#### Scenario: Thinking enabled
- **WHEN** `glm-5.3-flash` streams on an `openai-chat` connection with applied `high`
- **THEN** the body contains `thinking: {type: "enabled"}` and `reasoning_effort: "high"`

#### Scenario: Tool-call turn replayed
- **GIVEN** a transcript whose assistant tool-call turn stored reasoning `checked the file`
- **WHEN** the next `glm-5.3` request is sent on an `openai-chat` connection
- **THEN** that assistant wire message carries `reasoning_content: "checked the file"`

#### Scenario: Anthropic connection
- **WHEN** `glm-5.3` streams on an `anthropic` connection
- **THEN** the body contains no `thinking` field added by the provider and no `reasoning_content`

### Requirement: Z.ai presentation
The provider SHALL use the shared Z.ai brand mark (`brand:zai`), price vendor `zai`, the shared GLM display names and the GLM tokenizer, so `zai-coding` models look and count like other GLM models.

#### Scenario: Provider mark
- **WHEN** the Models screen lists the `zai-coding` provider
- **THEN** it shows the Z.ai mark
