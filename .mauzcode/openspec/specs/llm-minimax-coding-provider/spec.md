# llm-minimax-coding-provider Specification

## Purpose
Connect a MiniMax M Plan subscription as a core Models provider: API-key authentication, Anthropic-compatible inference with an admission tier, model discovery, documented MiniMax reasoning and thinking replay, quota usage and failure classification, exact token counting, image input and prompt-cache accounting, all through the connection's saved transport.

## Requirements

### Requirement: MiniMax M Plan connection
The system SHALL register a core provider `minimax-coding` labelled "MiniMax M Plan" with a required secret `apiKey` (an M Plan key), a `serviceTier` select of `standard` (default) or `priority`, and direct, SOCKS and SSH-tunnel transports. Requests SHALL go only to `https://api.minimax.io/...` and `https://www.minimax.io/...` through the connection's transport, never to the pay-as-you-go API or another provider.

#### Scenario: Connection created
- **WHEN** the owner creates a `minimax-coding` connection with an API key and no service tier
- **THEN** the connection is saved with the key in encrypted secret storage and service tier `standard`

#### Scenario: Unsupported service tier
- **WHEN** the owner saves a `minimax-coding` connection with service tier `flex`
- **THEN** validation fails and nothing is stored

#### Scenario: Missing key
- **WHEN** an operation runs on a `minimax-coding` connection without an API key
- **THEN** it fails without contacting the network

### Requirement: MiniMax key confidentiality
The API key MUST NOT be returned, logged or included in errors, test results, usage reports or model metadata. Provider errors SHALL carry only a safe message, the HTTP status and, when present, the MiniMax error code, never the upstream body.

#### Scenario: Upstream rejects the key
- **WHEN** MiniMax answers any provider request with HTTP 401 and a body echoing the key
- **THEN** the resulting error mentions status 401 and contains neither the key nor the body

### Requirement: MiniMax inference routing
Inference SHALL use the shared `anthropic` protocol with base `https://api.minimax.io/anthropic` and the key sent only as the `x-api-key` header. Every model except `MiniMax-M3.1-Flash*` SHALL receive the connection's `service_tier`; `MiniMax-M3.1-Flash*` SHALL receive none.

#### Scenario: Ordinary turn
- **WHEN** an agent turn streams on `minimax-coding/<account>:MiniMax-M3` with service tier `priority`
- **THEN** the request goes to `https://api.minimax.io/anthropic/v1/messages` with header `x-api-key` and body `service_tier: "priority"`

#### Scenario: Flash model ignores the tier
- **WHEN** a turn streams on `MiniMax-M3.1-Flash` with service tier `priority`
- **THEN** the request body contains no `service_tier`

### Requirement: MiniMax sampling and output budget
The provider SHALL NOT declare sampling support, because MiniMax ignores `temperature` and counts thinking in `max_tokens`. Requests SHALL carry neither `temperature` nor `max_tokens`, and one-shot calls SHALL report both options as ignored when a caller sets them.

#### Scenario: Caller options reported as ignored
- **WHEN** a one-shot call on a MiniMax model sets `maxTokens` 300 and `temperature` 0
- **THEN** the request body contains neither `max_tokens` nor `temperature` and the result lists both in `ignored`

#### Scenario: Agent turn without a budget
- **WHEN** an agent turn streams on a MiniMax model
- **THEN** the request body contains no `max_tokens`

### Requirement: MiniMax model discovery
Model discovery SHALL read `GET https://api.minimax.io/anthropic/v1/models` with `x-api-key` and return every unique, well-formed model id (`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`) in catalogue order, using `display_name` as the label when present. Discovery SHALL NOT filter models by family. A failed or unrecognized response SHALL fail the refresh with a safe error so the previous model cache is kept.

#### Scenario: Catalogue with duplicates and invalid ids
- **WHEN** the endpoint lists `MiniMax-M3.1-Flash`, `MiniMax-M3`, `MiniMax-M3` and `bad id!`
- **THEN** discovery returns `MiniMax-M3.1-Flash` and `MiniMax-M3`, once each, in that order

#### Scenario: Unknown family kept
- **WHEN** the endpoint lists `MiniMax-M4`
- **THEN** it is returned without reasoning controls

#### Scenario: Discovery HTTP error
- **WHEN** the models endpoint answers HTTP 500
- **THEN** the refresh fails with a safe error carrying status 500 and the cached models are unchanged

### Requirement: MiniMax reasoning levels
Reasoning SHALL follow the model family, matched case-insensitively on the model id:
- `MiniMax-M3.1-Flash*`: levels `low`, `medium`, `high`, `xhigh`, no declared default, sent with native names.
- other `MiniMax-M3` and `MiniMax-M3.*`: levels `off` and `high` (thinking on), default `off`, without effort.
- any other model: no reasoning controls.

#### Scenario: Flash levels
- **WHEN** a connection discovers `MiniMax-M3.1-Flash`
- **THEN** the model offers `low`, `medium`, `high` and `xhigh` and no `off`

#### Scenario: M3 is on or off
- **WHEN** a connection discovers `MiniMax-M3`
- **THEN** the model offers only `off` and `high`, with `off` as default

### Requirement: MiniMax reasoning on the wire
For `MiniMax-M3.1-Flash` an applied level SHALL be sent as `output_config.effort` with the same name and `thinking: {type: "adaptive"}`; `auto` SHALL send neither, so MiniMax uses its default. For `MiniMax-M3` applied `high` SHALL send only `thinking: {type: "adaptive"}` and `off` nothing. `thinking: {type: "disabled"}` MUST never be sent to MiniMax.

#### Scenario: Flash auto
- **WHEN** a turn on `MiniMax-M3.1-Flash` has no reasoning preference
- **THEN** the body contains neither `thinking` nor `output_config`

#### Scenario: Flash xhigh is native
- **WHEN** a turn on `MiniMax-M3.1-Flash` applies `xhigh`
- **THEN** the body contains `thinking: {type: "adaptive"}` and `output_config: {effort: "xhigh"}`

#### Scenario: Flash cannot turn thinking off
- **WHEN** the owner asks for `off` on `MiniMax-M3.1-Flash`
- **THEN** `low` is applied and the body never contains `thinking: {type: "disabled"}`

#### Scenario: M3 thinking on
- **WHEN** a turn on `MiniMax-M3` applies `high`
- **THEN** the body contains `thinking: {type: "adaptive"}` and no `output_config`

#### Scenario: M3 thinking off
- **WHEN** a turn on `MiniMax-M3` applies `off`
- **THEN** the body contains neither `thinking` nor `output_config`

### Requirement: MiniMax thinking replay
MiniMax routes SHALL request native reasoning replay, so thinking blocks returned on a tool-call turn, with their signatures, are sent back unchanged on later requests to the same connection and model.

#### Scenario: Tool loop keeps the reasoning chain
- **GIVEN** a MiniMax turn that streamed a signed thinking block and called a tool
- **WHEN** the agent sends the tool result to the same model
- **THEN** the assistant message in the request starts with that thinking block, text and signature unchanged, followed by the tool use

#### Scenario: Model switched
- **GIVEN** the same stored turn
- **WHEN** the conversation continues on `MiniMax-M3` instead of `MiniMax-M3.1-Flash`
- **THEN** no stored thinking block is sent

### Requirement: MiniMax quota usage
Usage SHALL read `GET https://www.minimax.io/v1/token_plan/remains` with Bearer authentication and use the `model_remains` entry named `general` (else the first). Its interval remaining percentage and `end_time` SHALL become the five-hour window, its weekly remaining percentage and `weekly_end_time` the weekly window, with used percent = 100 − remaining. The plan SHALL be reported as "M Plan" (the response carries no tier name).

#### Scenario: Both windows reported
- **WHEN** the `general` entry has interval remaining 70 and weekly remaining 40 with future reset times
- **THEN** usage reports a five-hour window at 30% used and a weekly window at 60% used with those reset times

#### Scenario: Non-coding modality ignored
- **WHEN** `model_remains` lists a video entry before the `general` entry
- **THEN** the windows come from the `general` entry

### Requirement: MiniMax quota validation
A non-zero `base_resp.status_code`, a missing `model_remains`, or no valid window SHALL be reported as usage unavailable, never as unused quota. An entry whose interval and weekly statuses are both 3 with zero totals is not in the plan and SHALL NOT provide windows. An out-of-range percentage or a non-positive reset time SHALL drop only that window.

#### Scenario: Unrecognized response
- **WHEN** the response has `base_resp.status_code` 1004 or no `model_remains`
- **THEN** usage is unavailable and no window is reported

#### Scenario: General entry not in plan
- **WHEN** the `general` entry has both statuses 3 and zero totals
- **THEN** usage is unavailable instead of reporting 0% used

#### Scenario: Out-of-range entry
- **WHEN** the weekly remaining percentage is 140 and the interval one is valid
- **THEN** only the five-hour window is reported

### Requirement: MiniMax connection test
The connection test SHALL make one authenticated request to the quota endpoint through the connection's transport and classify the result as success, authentication failure (HTTP 401/403, or MiniMax code 1004 or 2057 even inside an HTTP 200 body) or provider unavailable, without exposing the key or the response body.

#### Scenario: Valid key
- **WHEN** the quota endpoint answers HTTP 200 with a recognized body
- **THEN** the test succeeds

#### Scenario: Invalid key answered with HTTP 200
- **WHEN** the quota endpoint answers HTTP 200 with `base_resp.status_code` 1004
- **THEN** the test reports an authentication failure

#### Scenario: Not an M Plan key
- **WHEN** the quota endpoint answers with MiniMax code 2057
- **THEN** the test reports an authentication failure stating that an M Plan key is required

### Requirement: MiniMax failure classification
Inference failures SHALL be classified from the MiniMax error code when the error body carries one: 2056 and 2067 as `QUOTA_EXHAUSTED`; 1002, 1039, 1041, 1045, 2045–2047 and 2062 as throttled and retryable; 2061 and 2068 as `UNSUPPORTED`; 1004 and 2057 as `AUTH`. Without a recognized code the status-based classification SHALL apply.

#### Scenario: Rate limit is not quota
- **WHEN** a turn fails with HTTP 429 and MiniMax code 1002
- **THEN** the failure is throttled and retryable, not `QUOTA_EXHAUSTED`

#### Scenario: Model outside the plan
- **WHEN** a turn on `MiniMax-M3` fails with MiniMax code 2068
- **THEN** the failure is `UNSUPPORTED` and is not retried

### Requirement: MiniMax quota reset time
A quota failure SHALL carry the reset time of the exhausted window when cached usage reports a window at 100% with a reset time in the future; otherwise it SHALL carry no reset time.

#### Scenario: Usage limit reached
- **GIVEN** cached usage shows the five-hour window at 100% resetting at 15:00
- **WHEN** a turn fails with MiniMax code 2056
- **THEN** the failure is `QUOTA_EXHAUSTED` with reset time 15:00 and the agent is parked until then

#### Scenario: Stale cached usage
- **GIVEN** cached usage shows no window at 100%, or only a reset time in the past
- **WHEN** a turn fails with MiniMax code 2056
- **THEN** the failure is `QUOTA_EXHAUSTED` without a reset time

### Requirement: MiniMax token counting
The provider SHALL offer exact input token counting through `POST https://api.minimax.io/anthropic/v1/messages/count_tokens` with the same converted messages, instructions and tools as inference, returning the reported input tokens without generating output.

#### Scenario: Count before a request
- **WHEN** the agent measures the context of a MiniMax model without fresh provider usage
- **THEN** one `count_tokens` request is sent and its `input_tokens` is used as the context size

#### Scenario: Count fails
- **WHEN** the `count_tokens` request fails or times out
- **THEN** the local estimate is used and the turn is not failed

### Requirement: MiniMax image input and prompt cache
Image blocks in the transcript SHALL reach MiniMax as Anthropic image blocks. Requests SHALL carry no `cache_control` markers, since MiniMax caches automatically. Prompt usage SHALL be new input plus cache-read and cache-write tokens, with cache-read tokens reported separately for pricing.

#### Scenario: Screenshot from a tool
- **WHEN** a tool result carries a PNG image and the turn streams on `MiniMax-M3.1-Flash`
- **THEN** the request contains an `image` block with that PNG

#### Scenario: Cache hit reported
- **WHEN** the final usage reports `input_tokens` 400 and `cache_read_input_tokens` 800
- **THEN** prompt usage is 1200 with 800 cache-read tokens, and the request body contained no `cache_control`

#### Scenario: Usage reported only at the end
- **WHEN** `message_start` reports zero input tokens and the final `message_delta` reports the real counts
- **THEN** the final counts are used

### Requirement: MiniMax presentation
`minimax-coding` routes SHALL show the MiniMax mark, MiniMax display names and price vendor `minimax`, and SHALL count tokens locally with the MiniMax tokenizer.

#### Scenario: Model picker
- **WHEN** a `minimax-coding` connection lists `MiniMax-M3`
- **THEN** the picker shows it with the MiniMax mark under the "MiniMax M Plan" provider
