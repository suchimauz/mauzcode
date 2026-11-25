# llm-claude-provider Specification

## Purpose
Connect a Claude subscription as a models connection: native PKCE login through the selected transport, encrypted rotating tokens, Claude Code-compatible requests, prompt caching, native compaction, usage and safe error classification.

## Requirements

### Requirement: Claude connection
The system SHALL provide a built-in `claude` provider for Claude subscriptions whose connections need only an account name, accept an optional client version override, and allow the direct, SOCKS proxy and SSH tunnel transports.

#### Scenario: Create through a proxy
- **WHEN** the owner creates a claude connection with a saved SOCKS proxy transport
- **THEN** the connection is stored without credentials and reports that login is required

#### Scenario: Invalid client version
- **WHEN** the client version override does not look like a version number
- **THEN** the connection is rejected with a validation error

### Requirement: Native PKCE login through the transport
Claude login SHALL use OAuth authorization code with PKCE and the same client, authorize URL, loopback redirect and scopes as the existing Claude login. The code SHALL arrive via an optional loopback callback or pasted input; a busy port MUST fall back to paste. The token exchange MUST use the connection transport. Login MUST NOT start a CLI or run SSH commands. A new start MUST cancel the previous pending login.

#### Scenario: Successful login over SOCKS
- **GIVEN** a claude connection with a SOCKS proxy transport
- **WHEN** the owner starts login, authorizes in the browser and submits the returned code
- **THEN** status becomes `succeeded`, tokens are stored, and the token exchange was sent through the proxy

#### Scenario: Loopback callback
- **GIVEN** MauzCode runs on the owner's machine and the callback port is free
- **WHEN** the browser is redirected to the callback with a valid code and state
- **THEN** login completes without pasting and status becomes `succeeded`

#### Scenario: Pasted callback URL
- **GIVEN** the callback port is busy or MauzCode runs remotely
- **WHEN** the owner pastes the callback URL from the browser address bar
- **THEN** the code and state are taken from the URL and login completes

#### Scenario: Waiting for the code
- **WHEN** login has started and no code was submitted yet
- **THEN** login status stays `pending`

#### Scenario: State mismatch
- **WHEN** the submitted code carries a state different from the pending flow
- **THEN** the submission is rejected, no exchange request is sent and the flow stays `pending`

#### Scenario: Expiry
- **WHEN** no valid code is submitted within 10 minutes
- **THEN** login status becomes `expired` and a later submission is rejected

#### Scenario: Cancel
- **WHEN** the owner cancels a pending login
- **THEN** status becomes `failed` with a cancelled reason, the verifier is discarded and no tokens are stored

#### Scenario: Exchange is never repeated
- **WHEN** the code-for-token exchange fails or times out
- **THEN** login fails without sending the exchange request again

### Requirement: Login secrecy
Login status and results MUST contain only the flow id, flow kind, authorization link, expiry and a safe status message. Tokens, the code verifier, the authorization code and the submitted redirect URL MUST NOT be returned, logged or shown.

#### Scenario: Status payload
- **WHEN** login status is read at any stage
- **THEN** the payload contains no token, code verifier, authorization code or submitted redirect URL

### Requirement: Token storage
Claude tokens SHALL be stored encrypted per connection. The stored expiry SHALL be the server `expires_in` minus 5 minutes. A login without a refresh token MUST fail. A stale stored revision MUST NOT overwrite a newer one.

#### Scenario: Logout
- **WHEN** the owner logs out
- **THEN** the stored tokens are deleted without any network request and the connection reports that login is required

#### Scenario: Missing refresh token
- **WHEN** the token exchange answers without a refresh token
- **THEN** login fails and nothing is stored

### Requirement: Rotating token refresh
An expired access token SHALL be refreshed through the connection transport before use. Concurrent refreshes of one connection MUST result in one refresh request. Because each refresh rotates the refresh token, the connection MUST be durably marked refresh-uncertain before the request is sent and cleared only after the new tokens are saved; a refresh whose outcome is unknown MUST NOT be retried and MUST require a new login.

#### Scenario: Concurrent refresh
- **WHEN** two requests need a refreshed token at the same time
- **THEN** one refresh request is sent and both use the new access token

#### Scenario: Refresh rejected
- **WHEN** the refresh request is rejected
- **THEN** the connection requires login and the test reports `unavailable` with reason `login-required`

#### Scenario: Refresh outcome unknown
- **WHEN** the refresh request was sent but the response was lost or unreadable
- **THEN** the request fails with code `OAUTH_OUTCOME_UNKNOWN`, no second refresh is sent, and the connection requires login

#### Scenario: Restart after an interrupted refresh
- **WHEN** the server restarts while a connection is marked refresh-uncertain
- **THEN** the next token request fails with `OAUTH_OUTCOME_UNKNOWN` without sending a refresh

### Requirement: Allowed Claude endpoints
The provider SHALL send requests only over https and only to `POST /v1/messages`, `POST /v1/messages/count_tokens`, `GET /api/oauth/usage`, `GET /api/oauth/profile` on the API base and `POST` to the OAuth token URL. Any other destination or method MUST be refused before sending. The API base SHALL default to `https://api.anthropic.com` and MAY be overridden by `CLAUDE_CODE_BASE_API_URL`.

#### Scenario: Unexpected destination
- **WHEN** a request to any other path or with another method is attempted
- **THEN** it fails with code `PROXY_CONFIG` and nothing is sent

### Requirement: Static model list
The provider SHALL return a static model list defined in code (the Claude ids of the existing subscription path) and MUST NOT call any API to list models. Availability on the owner's plan is checked only by inference.

#### Scenario: Model list
- **WHEN** models are listed for a claude connection, logged in or not
- **THEN** the catalogue from code is returned and no network request is sent

### Requirement: Usage and plan
The provider SHALL report the 5-hour and 7-day windows (`utilization` as used percent, `resets_at` as reset time) from the OAuth usage endpoint, and the plan (pro, max, team, enterprise) from the OAuth profile endpoint. A profile failure MUST NOT discard the usage windows. A usage answer without any window MUST be an error. The connection test SHALL check login via the usage endpoint.

#### Scenario: Usage windows
- **WHEN** usage is read for a logged-in connection
- **THEN** the report contains the 5-hour and 7-day windows with used percent, reset time and the plan

#### Scenario: Profile unavailable
- **WHEN** the profile request fails but usage succeeds
- **THEN** the windows are reported without a plan

#### Scenario: Not logged in
- **WHEN** a connection without tokens is tested
- **THEN** the result is `configured` with reason `login-required` and no network request is sent

### Requirement: Usage from response headers
After every successful inference response the provider SHALL record the `anthropic-ratelimit-unified-5h-*` and `anthropic-ratelimit-unified-7d-*` utilization and reset headers as the connection's current usage, without an extra request. A missing header MUST NOT be read as 0% used. Header-only updates MUST update only corresponding general windows, preserving cached additional windows and their original freshness without claiming those windows were refreshed.

#### Scenario: Headers update usage
- **WHEN** a stream completes with unified rate-limit headers
- **THEN** the connection usage shows those windows without calling the usage endpoint

#### Scenario: Header missing
- **WHEN** a response lacks the 7-day utilization header
- **THEN** the 7-day window is not overwritten with 0%

#### Scenario: Additional windows survive partial updates
- **GIVEN** usage contains a model-specific limit from the last successful usage-endpoint snapshot
- **WHEN** an inference response updates only general five-hour or seven-day headers
- **THEN** the additional limit remains available with its original observation time
- **AND** the header update does not claim to refresh or reset that additional limit

#### Scenario: Full snapshot replaces removed limits
- **GIVEN** a previous successful usage-endpoint snapshot contained an additional limit
- **WHEN** a newer successful complete usage-endpoint snapshot omits that limit
- **THEN** the removed limit is no longer reported

### Requirement: Claude Code system prompt
Requests SHALL place the system prompt exactly as the existing Claude subscription path does. For streaming, `system` SHALL be exactly `You are Claude Code, Anthropic's official CLI for Claude.` and the instructions (without a leading copy of that line) SHALL be sent as the first user message followed by the assistant acknowledgement `Understood. Ready to act.`. For compaction, `system` SHALL be a block list: the identity line, then the instructions as a second block when not empty.

#### Scenario: Streaming instructions in messages
- **WHEN** a stream request has instructions
- **THEN** `system` holds only the identity line and the first message is a user turn with the instructions

#### Scenario: Compaction instructions in system
- **WHEN** a compaction request has instructions
- **THEN** `system` has two text blocks: the identity line and the instructions

### Requirement: Compaction beta on replay
When the first content block of the first message is a compaction block, a stream request SHALL add the `compact-2026-09-04` beta.

#### Scenario: Replayed checkpoint
- **WHEN** a stream request starts with a compaction block
- **THEN** the beta list includes `compact-2026-09-04`

### Requirement: Native compaction
Compaction SHALL send a non-streaming messages request with betas `claude-code-20250219`, `oauth-2025-04-20` and `compact-2026-09-04`, `max_tokens` (default 32000) and `compaction: { type: "summarize" }`; a focus SHALL be wrapped into the handoff prompt as `compaction.instructions`. It SHALL return the signed block, stop reason and compaction-iteration usage, and MUST fail without a signed block.

#### Scenario: Compaction checkpoint
- **WHEN** compaction is requested for a transcript on a logged-in connection
- **THEN** the result contains the signed compaction block, stop reason and usage

#### Scenario: Focus
- **WHEN** compaction is requested with a focus
- **THEN** `compaction.instructions` holds the handoff prompt followed by the focus

#### Scenario: Empty result
- **WHEN** the response has no compaction block (cut off, refusal or overflow)
- **THEN** compaction fails with the stop reason in the message

### Requirement: Thinking and output limits
Messages requests SHALL set `max_tokens` to 16384 and `stream: true`. For reasoning effort `auto` no thinking field SHALL be sent. For low, medium, high or xhigh the request SHALL send `thinking: { type: "adaptive" }` and `output_config.effort` with xhigh mapped to `max`. For `off` the request SHALL send `thinking: { type: "disabled" }`, except for Claude 5 models (Opus, Sonnet, Haiku and Fable), where no thinking field is sent.

#### Scenario: High effort
- **WHEN** reasoning effort is `xhigh`
- **THEN** the body has adaptive thinking and effort `max`

#### Scenario: Off on Claude 5
- **WHEN** reasoning effort is `off` for a Claude 5 Opus, Sonnet, Haiku or Fable model
- **THEN** the body has no `disabled` thinking field

### Requirement: Prompt caching
Messages requests SHALL set two `cache_control: { type: "ephemeral" }` markers: on the last block of the instructions acknowledgement turn and on the last block of the transcript tail before transient guidance, so each request reuses the previous request's prefix.

#### Scenario: Cache markers
- **WHEN** a stream request with a transcript longer than the bootstrap is sent
- **THEN** exactly two content blocks carry an ephemeral cache marker

### Requirement: Stream parsing and usage
The provider SHALL emit text, thinking and tool argument deltas, collect tool calls, and map `end_turn`/`stop_sequence` to `stop` and `max_tokens` to `length`. Prompt tokens SHALL be input + cache read + cache creation tokens, preferring `message_delta` over `message_start`; cache read and write tokens SHALL be reported separately. Unparseable tool input SHALL become `{ __unparsed: <raw> }`.

#### Scenario: Streamed reply with a tool call
- **WHEN** the backend streams text deltas, a tool use block with partial JSON input and a message stop event
- **THEN** the result contains the text, the tool call with parsed arguments, usage with cache tokens and the finish reason

#### Scenario: Truncated tool input
- **WHEN** the stream ends with incomplete tool JSON
- **THEN** the tool call arguments are `{ __unparsed: <raw> }`

### Requirement: Stream failures
An `error` event inside the stream SHALL fail the request with the provider's classified error. A stream that ends without `message_stop` SHALL fail with a retryable connection-lost error. Malformed SSE data SHALL fail the request. Errors MUST NOT contain tokens.

#### Scenario: Stream cut off
- **WHEN** the transport closes before `message_stop`
- **THEN** the request fails with code `PROXY_CONNECTION_LOST` and is marked retryable

#### Scenario: Error event mid-stream
- **WHEN** the backend sends an `overloaded_error` event after some text
- **THEN** the request fails with the classified overload error, not as success

### Requirement: Error classification
HTTP errors SHALL be classified the same way as the existing Claude subscription path. Only an explicit quota signal (`usage_limit_reached`, `usage_not_included`, `quota_exceeded`, `credits_depleted` or a usage-limit message) SHALL produce a non-retryable `USAGE_LIMIT` with the reset time from the response or unified reset headers. A plain `rate_limit_error` SHALL be retryable throttling honoring `Retry-After`. 401 and 403 SHALL mark the connection as requiring login.

#### Scenario: Subscription exhausted
- **WHEN** the backend answers 429 with `usage_limit_reached`
- **THEN** the request fails with `USAGE_LIMIT`, not retryable, with the reset time

#### Scenario: Ordinary throttling
- **WHEN** the backend answers 429 with `rate_limit_error` and no quota signal
- **THEN** the request fails as retryable rate limiting with the `Retry-After` delay

#### Scenario: Unauthorized
- **WHEN** the backend answers 401
- **THEN** the connection requires login

### Requirement: Additional Claude quota windows
The provider SHALL retain valid additional quota-window records returned by the usage endpoint, including model-specific limits, without a fixed allowlist of model names. It MUST preserve a stable source identity, a readable label and available utilization/reset data. Null, disabled or malformed entries and unrelated billing/profile objects MUST NOT become quota windows.

#### Scenario: Model-specific weekly limit
- **WHEN** the endpoint reports general five-hour and seven-day quotas plus a valid model-specific seven-day quota
- **THEN** all three windows are retained with distinct identities
- **AND** the model-specific window is not classified as the general weekly quota

#### Scenario: Previously unseen model
- **WHEN** the endpoint adds a quota-window record for a model not known to the client
- **THEN** the valid window is retained and identified using its provider name or readable source key without requiring a client model-name update

#### Scenario: Unrelated or invalid fields
- **WHEN** the payload includes null entries, explicitly disabled records, non-finite utilization or billing objects without quota-window semantics
- **THEN** those entries do not create phantom quota windows and valid windows remain available

#### Scenario: Additional-only response
- **WHEN** the endpoint returns at least one valid additional quota window and no general five-hour or seven-day window
- **THEN** usage remains available with the additional window and no general window is invented

### Requirement: Claude quota scope
The provider SHALL identify the documented general `five_hour` and `seven_day` windows as account-wide five-hour and weekly limits. Model-specific and other unrecognized windows MUST remain additional limits, even if their duration or name resembles a standard period. Missing reset data MUST NOT imply a fabricated reset time.

#### Scenario: Weekly model limit cannot replace account limit
- **WHEN** a model-specific weekly window exists without the general `seven_day` window
- **THEN** it remains an additional limit and the account-wide weekly period is absent

#### Scenario: Missing reset
- **WHEN** an otherwise valid additional window lacks a valid reset timestamp
- **THEN** its usage is retained without an invented reset time

### Requirement: Claude usage polling interval
The Claude provider SHALL declare a usage refresh interval of 180000 ms, so the OAuth usage endpoint is requested at most once every 3 minutes per connection outside explicit refresh. Header observations from inference responses MUST continue to update the general windows without extending that interval.

#### Scenario: Frequent quota polling
- **WHEN** quotas are polled every 60 s for a Claude connection
- **THEN** the OAuth usage endpoint is requested at most once per 3 minutes

#### Scenario: Header update between polls
- **WHEN** an inference response carries 5h utilization headers between usage polls
- **THEN** the cached five-hour window is updated and the next endpoint request time is unchanged

### Requirement: Claude Code request headers from client version
Every request SHALL carry bearer authorization and the user agent `claude-cli/<version> (external, sdk-cli)`, where the version is the connection's resolved client version. Messages and compaction requests SHALL also carry `anthropic-version: 2023-06-01`, `x-app: cli`, `anthropic-dangerous-direct-browser-access: true`, a new `x-client-request-id` and the Claude Code betas. `x-api-key` MUST NOT be sent. The user agent MUST NOT be taken from an environment variable.

#### Scenario: Default betas
- **WHEN** no override is set
- **THEN** the betas are `claude-code-20250219`, `oauth-2025-04-20`, `fine-grained-tool-streaming-2025-05-14` and `interleaved-thinking-2025-05-14`

#### Scenario: Streamed request headers
- **WHEN** a stream request is sent for a claude connection
- **THEN** it carries all the headers above, a request id different from the previous request, and no `x-api-key` header

#### Scenario: Beta override
- **WHEN** `CLAUDE_CODE_ANTHROPIC_BETA` is set
- **THEN** its value replaces the default beta list

### Requirement: Claude CLI version detection setting
A claude connection SHALL have a boolean setting "Detect CLI version" that defaults to enabled, including for stored connections without the setting. It MUST NOT be enabled together with a client version override: saving a connection with both an override and the setting explicitly enabled SHALL be rejected. A client version override that does not match `^[0-9A-Za-z.+-]{1,40}$` SHALL be rejected on save and MUST NOT be sent.

#### Scenario: Existing connection keeps detecting
- **GIVEN** a stored claude connection without override and without the setting
- **WHEN** a request is sent
- **THEN** the version is detected from the local `claude --version` as before

#### Scenario: Override with detection rejected
- **WHEN** the owner saves a claude connection with override `2.0.0` and detection enabled
- **THEN** the save fails with a validation error and the stored connection is unchanged

#### Scenario: Invalid override rejected
- **WHEN** the owner saves a claude connection with override `2.0 beta`
- **THEN** the save fails with a validation error

### Requirement: Claude client version source
The `claude` provider SHALL resolve its client version with this precedence and report the matching source: a valid connection override (`override`); else, when detection is enabled, the version detected from the local `claude --version` (`detected`); else the built-in fallback (`fallback`). `CLAUDE_CODE_CLI_VERSION` MUST NOT be read. Request headers and the report MUST use the same resolution.

#### Scenario: Connection override
- **GIVEN** a claude connection with client version override `2.0.0`
- **WHEN** its client version is reported
- **THEN** the version is `2.0.0` with source `override` and no local command is executed

#### Scenario: Detected CLI version
- **GIVEN** no override, detection enabled and a local `claude --version` that prints a version
- **WHEN** the client version is reported
- **THEN** the version is the detected one with source `detected`, and a request sent right after uses the same version in its user agent

#### Scenario: Detection disabled
- **GIVEN** no override and detection disabled
- **WHEN** the client version is reported
- **THEN** the version is the built-in fallback with source `fallback` and no local command is executed

#### Scenario: Detection fails
- **GIVEN** no override, detection enabled and no usable local Claude CLI
- **WHEN** the client version is reported
- **THEN** the version is the built-in fallback with source `fallback`

#### Scenario: Environment version ignored
- **GIVEN** no override, detection disabled and `CLAUDE_CODE_CLI_VERSION` set
- **WHEN** the client version is reported
- **THEN** the version is the built-in fallback with source `fallback`

### Requirement: Claude version detection cache
Claude CLI detection SHALL run only on the MauzCode host with the existing timeouts and cache (five minutes on success, thirty seconds on failure). Reporting MUST reuse the cache used by requests. A refresh request SHALL discard the local detection cache entry and detect again.

#### Scenario: Cached detection
- **GIVEN** a request detected the CLI version less than five minutes ago
- **WHEN** the client version is reported without refresh
- **THEN** the cached version is returned and `claude --version` is not executed again

#### Scenario: Refresh
- **GIVEN** a cached detected version
- **WHEN** the client version is reported with refresh
- **THEN** `claude --version` is executed again and the next request uses the new result

### Requirement: Claude 5 effort levels
The catalogue SHALL offer effort levels `low`, `medium` and `high` for every Claude 5 model (Opus, Sonnet, Haiku and Fable) and SHALL NOT offer `off`. It SHALL additionally offer `xhigh` for Opus and Fable models and for Sonnet and Haiku models from version 5.5 on. A requested `off` SHALL be applied as `low`, and `auto` SHALL leave effort to the model.

#### Scenario: Current catalogue
- **WHEN** models are listed for a claude connection
- **THEN** `claude-fable-5-2`, `claude-opus-5-5`, `claude-sonnet-5-5` and `claude-haiku-5-5` each offer `low`, `medium`, `high` and `xhigh`

#### Scenario: Earlier Sonnet 5
- **WHEN** effort `xhigh` is requested for `claude-sonnet-5`
- **THEN** `high` is applied and the result is marked as downgraded

#### Scenario: Off downgrades
- **WHEN** effort `off` is requested for `claude-haiku-5-5`
- **THEN** `low` is applied and the request carries adaptive thinking with effort `low`
