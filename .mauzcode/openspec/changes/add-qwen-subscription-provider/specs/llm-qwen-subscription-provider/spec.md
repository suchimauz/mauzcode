## Purpose

Define the built-in Qwen subscription model provider: OAuth device-code login against Qwen's account service through the connection transport, encrypted token storage, refresh and revocation, model discovery and OpenAI Chat Completions inference on the Qwen subscription gateway.

## ADDED Requirements

### Requirement: Qwen subscription connection
The system SHALL provide a built-in `qwen` provider in the Models module whose connections need only an account name, have no credential fields, and allow the direct, SOCKS proxy and SSH tunnel transports. A new connection SHALL report that login is required until a login succeeds.

#### Scenario: Create without credentials
- **WHEN** the owner creates a qwen connection with only an account name
- **THEN** the connection is stored without credentials and its status reports that login is required

#### Scenario: Provider offered by default
- **WHEN** the owner opens the list of providers for a new connection
- **THEN** `qwen` is offered alongside the other built-in providers without enabling any plugin

### Requirement: Qwen device-code login through the transport
Qwen login SHALL use the OAuth 2.0 device authorization grant at `https://auth.qwen.ai/api/oauth` (client `qwen-code-cli`, scope `model:invoke profile:read`): show a `https://chat.qwen.ai/authorize` link with the user code, poll at the server interval and store the tokens. Every flow request MUST use the connection transport. Login MUST NOT start a local CLI, open a callback server or read Qwen Code credential files.

#### Scenario: Successful login over SOCKS
- **GIVEN** a qwen connection with a SOCKS proxy transport
- **WHEN** the owner starts login, approves the code on chat.qwen.ai and polls status
- **THEN** status becomes `succeeded`, tokens are stored, and every login request was sent through the proxy

#### Scenario: Waiting for approval
- **WHEN** the token endpoint answers 400 `authorization_pending`
- **THEN** status stays `pending` and polling continues at the current interval

#### Scenario: Slow down
- **WHEN** the token endpoint answers 400 `slow_down`
- **THEN** the polling interval grows by 5 seconds for the rest of the flow

#### Scenario: Transient poll failure
- **WHEN** a poll answers 429, a 5xx status or fails at the network level
- **THEN** polling continues with backoff no shorter than the interval and any `Retry-After`, until expiry

#### Scenario: Denied or failed
- **WHEN** the token endpoint answers another OAuth error such as `access_denied`
- **THEN** status becomes `failed` with a safe message and no tokens are stored

#### Scenario: Expiry
- **WHEN** the code is not approved before the server-provided `expires_in`
- **THEN** status becomes `expired` and polling stops

#### Scenario: Cancel
- **WHEN** the owner cancels a pending login
- **THEN** polling stops, status becomes `failed` with a cancelled reason, and no tokens are stored

### Requirement: Qwen login secrecy
Login status and results MUST contain only the flow id, authorization link, one-time user code, expiry and a safe status message. Access tokens, refresh tokens and the device code MUST NOT be returned, logged, shown or included in failure details.

#### Scenario: Status payload
- **WHEN** login status is read at any stage
- **THEN** the payload contains no token and no device code

### Requirement: Qwen account identity
After a successful login the provider SHALL read `GET /api/oauth/userinfo` with the new access token. When the connection still has its default account name, the name SHALL become the reported name or email. The reported plan (`member_type`) MAY be shown as safe status; failure to read user info MUST NOT fail the login.

#### Scenario: Default account name replaced
- **WHEN** login succeeds and userinfo reports email `dev@example.com`
- **THEN** a connection with the default account name is renamed to `dev@example.com`

#### Scenario: Userinfo unavailable
- **WHEN** login succeeds but userinfo answers 500
- **THEN** login still reports `succeeded` and the account name is unchanged

### Requirement: Qwen token storage and refresh
Tokens SHALL be stored only as one encrypted local secret per connection with an absolute expiry. The provider SHALL refresh with the `refresh_token` grant when the access token expires within 30 seconds, with one refresh in flight per connection and no overwrite of newer tokens. A rejected refresh (`invalid_grant`, 400 or 401) SHALL mark the connection as requiring login. Deleting a connection SHALL delete its tokens.

#### Scenario: Proactive refresh
- **GIVEN** a stored access token expiring in 10 seconds
- **WHEN** two requests for that connection start concurrently
- **THEN** exactly one refresh request is sent through the transport and both requests use the new token

#### Scenario: Refresh rejected
- **WHEN** the refresh answers `invalid_grant`
- **THEN** the request fails with code `LOGIN_REQUIRED` and connection status reports that login is required

### Requirement: Qwen logout
Logout SHALL cancel and invalidate any active login flow before deleting the stored tokens locally, then send a best-effort revocation of the refresh token to `/api/oauth/revoke` through the transport. Flow invalidation and token persistence MUST be coordinated so that an in-flight login response cannot store tokens after logout. A failed revocation MUST NOT restore the tokens or fail the logout.

#### Scenario: Revocation fails
- **WHEN** the owner logs out and the revoke request times out
- **THEN** the tokens are gone, the connection requires login, and logout reports success with a safe note

#### Scenario: Logout while a login poll is in flight
- **GIVEN** an active login flow with a token poll in flight
- **WHEN** the owner logs out and the poll subsequently returns a successful token response
- **THEN** the old flow remains cancelled, no tokens are persisted, and the connection still requires login

### Requirement: Qwen model discovery
Model discovery SHALL read `GET https://api.qwen.ai/compatible-mode/v1/models` with the bearer token and list the reported model ids with protocol `openai-chat`, the reported context window, and image input only when `image` is among the reported input modalities. Unknown modalities SHALL be ignored. An empty or malformed list SHALL be reported as a discovery failure, not as zero models.

#### Scenario: Model with image input
- **WHEN** discovery reports `qwen3.8-max` with input modalities `text`, `image` and context window 1000000
- **THEN** it is listed with protocol `openai-chat`, context 1000000 and image input enabled

#### Scenario: Not logged in
- **WHEN** discovery runs for a connection without tokens
- **THEN** it fails with code `LOGIN_REQUIRED` and no request is sent

### Requirement: Qwen inference routing
Streaming SHALL use the shared OpenAI Chat Completions protocol at base `https://api.qwen.ai/compatible-mode/v1` with an `Authorization: Bearer` header holding a currently valid access token, through the connection transport. The provider MUST NOT fall back to DashScope, Alibaba Coding Plan or the discontinued free-tier endpoints. A 401 response SHALL invalidate the cached access token so the next request refreshes it, without replaying the failed request automatically.

#### Scenario: Stream a model
- **WHEN** an agent streams `qwen3.8-max` on a logged-in qwen connection
- **THEN** the request is sent to `https://api.qwen.ai/compatible-mode/v1/chat/completions` with a bearer token through the transport

#### Scenario: Gateway rejects the token
- **WHEN** a streaming request answers 401
- **THEN** it fails with classification `auth`, and the next request refreshes the token before sending

### Requirement: Qwen failures and connection test
Gateway 429 or quota errors SHALL be classified as `QUOTA_EXHAUSTED` or `THROTTLED` with any reset time or `Retry-After`; 402/403 plan errors as `QUOTA_EXHAUSTED` with a safe plan message. Failure details MUST NOT include upstream bodies or tokens. The connection test SHALL list models: success is available, missing or rejected login unauthorized, otherwise unavailable. The provider SHALL declare no usage windows.

#### Scenario: Quota exhausted
- **WHEN** a streaming request answers 429 with a quota error and `Retry-After: 60`
- **THEN** the failure has classification `quota` or `throttled` with a 60 s retry hint and no upstream body text

#### Scenario: Classified quota preserves the transport retry hint
- **WHEN** the gateway returns a quota error with a valid `Retry-After` header and the provider classifier supplies no `retryAfterMs`
- **THEN** the shared protocol handler preserves the header's retry hint in the classified failure, supporting both seconds and HTTP-date values

#### Scenario: Explicit classifier retry hint
- **WHEN** the provider classifier supplies `retryAfterMs` and the response also contains `Retry-After`
- **THEN** the explicit classifier hint takes precedence; malformed headers supply no fallback hint

#### Scenario: Test without login
- **WHEN** the owner tests a qwen connection that requires login
- **THEN** the test reports unauthorized without sending a request
