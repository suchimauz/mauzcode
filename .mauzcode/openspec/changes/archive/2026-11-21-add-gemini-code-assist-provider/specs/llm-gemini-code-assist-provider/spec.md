# Spec Delta

## Purpose

Define the built-in Gemini model provider that signs in with a Google account like Gemini CLI: OAuth login through the connection transport, encrypted token storage and refresh, automatic Code Assist onboarding, model list, streaming inference, reasoning, quota usage, token counting and failure classification on the Code Assist API.

## ADDED Requirements

### Requirement: Gemini Google-account connection
The system SHALL provide a built-in `gemini` provider in the Models module. Its connections SHALL need only an account name, SHALL have no credential fields, and SHALL allow the direct, SOCKS proxy and SSH tunnel transports. A new connection SHALL report that login is required until a login succeeds. API keys and Vertex AI SHALL NOT be accepted.

#### Scenario: Create without credentials
- **WHEN** the owner creates a gemini connection with only an account name
- **THEN** the connection is stored without credentials and its status reports that login is required

#### Scenario: Provider offered by default
- **WHEN** the owner opens the list of providers for a new connection
- **THEN** `gemini` is offered alongside the other built-in providers without enabling any plugin

### Requirement: Gemini account-risk warning
The provider description shown when choosing a provider SHALL warn that it uses an unofficial Google API with Gemini CLI's client identity, that Google may limit or block the account, and that a non-critical Google account is recommended.

#### Scenario: Warning before connecting
- **WHEN** the owner selects `gemini` while creating a connection
- **THEN** the account-risk warning is shown before any login starts

### Requirement: Gemini OAuth login with pasted code
Login SHALL use the Google OAuth 2.0 authorization-code grant with S256 PKCE, a random state, offline access and the scopes `cloud-platform`, `userinfo.email` and `userinfo.profile`, using Gemini CLI's public installed-app client. Login SHALL return an authorization link whose redirect is `https://codeassist.google.com/authcode` and SHALL accept the pasted code. Every token request MUST use the connection transport.

#### Scenario: Successful pasted-code login over SOCKS
- **GIVEN** a gemini connection with a SOCKS proxy transport
- **WHEN** the owner starts login, approves access in the browser and submits the shown code
- **THEN** the code is exchanged once with the PKCE verifier through the proxy, tokens are stored and status becomes `succeeded`

#### Scenario: Rejected code
- **WHEN** the token endpoint rejects a submitted code
- **THEN** status reports a safe failure message and no tokens are stored

#### Scenario: Code submitted twice
- **WHEN** a code is submitted after the flow already succeeded or while an exchange is running
- **THEN** no second exchange is sent

### Requirement: Gemini loopback login callback
Login SHALL also try to start a loopback listener on `127.0.0.1` with a free port and path `/oauth2callback`, with its own authorization link. A callback with a matching state SHALL complete the flow. The listener SHALL close when the flow succeeds, fails, expires, is cancelled or is replaced. If the listener cannot start, login SHALL still work with the pasted code.

#### Scenario: Browser on the same machine
- **WHEN** the browser redirects to the loopback callback with a valid code and matching state
- **THEN** the code is exchanged, the flow succeeds and the listener closes

#### Scenario: State mismatch
- **WHEN** the loopback callback carries a different state
- **THEN** no exchange is sent and the flow stays pending

#### Scenario: Listener unavailable
- **WHEN** the loopback listener cannot bind a port
- **THEN** login returns only the pasted-code link and reports that no callback is listening

### Requirement: Gemini same-machine login link
The login flow SHALL expose the loopback authorization link in an optional `callbackAuthorizationUrl` field only while the listener runs. The Models settings SHALL show it as a link for a browser on the same machine next to the pasted-code link and code field. Flows without the field SHALL look as before.

#### Scenario: Both links shown
- **WHEN** a login starts and the listener is running
- **THEN** the Models settings show the pasted-code link, the same-machine link and the code field

#### Scenario: No listener
- **WHEN** the loopback listener cannot start
- **THEN** the flow has no `callbackAuthorizationUrl` and the settings show only the pasted-code link and code field

### Requirement: Gemini login flow lifecycle
Each connection SHALL have at most one login flow. It SHALL expire after ten minutes. Starting a new login SHALL cancel the previous flow. Cancelling SHALL stop the flow and close its listener. Login state and status responses MUST NOT contain tokens, the PKCE verifier or the authorization code.

#### Scenario: Restart login
- **WHEN** the owner starts login while an earlier flow is pending
- **THEN** the earlier flow is cancelled and its listener closed before the new links are returned

#### Scenario: Flow expiry
- **WHEN** ten minutes pass without a code
- **THEN** status becomes `expired` and a later code is rejected without network access

### Requirement: Gemini account identity
After a successful login the system SHALL read the Google userinfo email through the transport on a best-effort basis and show it in the connection status. A userinfo failure SHALL NOT fail the login.

#### Scenario: Userinfo unavailable
- **WHEN** the userinfo request fails after a successful token exchange
- **THEN** login still succeeds and the status shows no email

### Requirement: Gemini token storage and refresh
Tokens SHALL be stored in one encrypted local secret per connection with revision-checked writes. The access token SHALL be refreshed through the transport with the refresh-token grant when it expires within 60 seconds, with at most one refresh at a time per connection. A rejected refresh (`invalid_grant`, 400 or 401) SHALL mark the connection as requiring login. Tokens MUST NOT appear in logs, results or errors.

#### Scenario: Expired access token
- **WHEN** a request needs a token that expires within 60 seconds
- **THEN** one refresh is sent through the transport, the new token is stored and concurrent requests reuse it

#### Scenario: Refresh rejected
- **WHEN** the token endpoint answers `invalid_grant`
- **THEN** the request fails with code `LOGIN_REQUIRED` and the status reports that login is required

### Requirement: Gemini logout
Logout SHALL cancel any pending login flow and delete the stored tokens, so that a late login response cannot restore them. It SHALL then try to revoke the refresh token through the transport with a five-second limit. A revoke failure SHALL NOT fail the logout.

#### Scenario: Logout while offline
- **WHEN** the owner logs out and the revoke request fails
- **THEN** the tokens are deleted and status reports that login is required

### Requirement: Gemini automatic Code Assist setup
Before the first Code Assist request, the system SHALL call `loadCodeAssist`. When it reports a project, the system SHALL store that project and the current tier, preferring the paid tier. Otherwise it SHALL onboard the user to the default allowed tier without a project and SHALL poll the onboarding operation until it reports a project, for at most two minutes. The stored project SHALL be reused until logout.

#### Scenario: Existing project
- **WHEN** `loadCodeAssist` returns a companion project and a tier
- **THEN** the project and tier are stored and no onboarding request is sent

#### Scenario: First-time free tier user
- **WHEN** `loadCodeAssist` returns no project and the default allowed tier is the free tier
- **THEN** `onboardUser` is called for that tier without a project, the operation is polled until done and its project is stored

### Requirement: Gemini setup failures
Setup SHALL fail with a safe error instead of guessing. Ineligible tiers without a project SHALL fail with code `INELIGIBLE` and their reason messages. An account that needs its own Google Cloud project SHALL fail with code `PROJECT_REQUIRED`. A required account validation SHALL fail with code `VALIDATION_REQUIRED` and its Google validation link. Onboarding that does not finish in time SHALL fail with a retryable error.

#### Scenario: Workspace account without a project
- **WHEN** setup finds no project, no ineligibility reasons and a tier that needs a project
- **THEN** the request fails with code `PROJECT_REQUIRED` and no inference request is sent

#### Scenario: Ineligible account
- **WHEN** `loadCodeAssist` reports ineligible tiers and no project
- **THEN** the request fails with code `INELIGIBLE` and a message listing the reported reasons

### Requirement: Gemini model list
The provider SHALL list a static, versioned set of Gemini models supported by the Code Assist API, at least `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-3-pro-preview`, `gemini-3.1-pro-preview` and `gemini-3-flash-preview`, with labels, image input and reasoning metadata. Context and output limits SHALL come from the public `google` catalogue. Listing SHALL NOT need network access.

#### Scenario: List models
- **WHEN** model discovery runs for a gemini connection
- **THEN** the versioned model list is returned without any network request

### Requirement: Gemini Code Assist streaming
Streaming SHALL POST to `https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse` with a bearer token through the transport. The body SHALL wrap a Gemini `generateContent` request (contents, system instruction, tools, generation config, session id) with the model, the stored project and a prompt id. Each SSE event's `response` SHALL be read with the same rules as the shared `gemini` protocol.

#### Scenario: Stream a model
- **WHEN** an agent streams `gemini-2.5-pro` on a logged-in gemini connection
- **THEN** one request wrapped with model and project is sent through the transport, and text and thought deltas are reported as text and thinking

#### Scenario: Structured output
- **WHEN** a request carries a `json_schema` response format
- **THEN** the generation config carries `responseMimeType: application/json` and the schema

#### Scenario: Stream ends without a finish reason
- **WHEN** the stream ends before any candidate reports a finish reason
- **THEN** the request fails with a retryable transport failure whose acceptance is `uncertain`

#### Scenario: Not logged in
- **WHEN** a stream is requested for a connection without tokens
- **THEN** it fails with code `LOGIN_REQUIRED` and no request is sent

### Requirement: Gemini Code Assist request identity
The wrapped request's `session_id` SHALL be the request's session id. Its `user_prompt_id` SHALL be `<sessionId>########<n>`, where `n` is the number of user turns in the transcript.

#### Scenario: Stable prompt id on retry
- **WHEN** the same step is retried without a new user turn
- **THEN** both requests carry the same `user_prompt_id` and `session_id`

#### Scenario: New user turn
- **WHEN** the user sends a new message in the same session
- **THEN** the next request carries the same `session_id` and a `user_prompt_id` with a higher turn number

### Requirement: Gemini tool-call signatures on Code Assist
The provider SHALL return each streamed function call's `thoughtSignature` on its tool call, and only on the call whose part carried it. When a replayed model turn has function calls and none of them has a signature, for example from another provider's transcript, the provider SHALL send the Gemini CLI placeholder signature `skip_thought_signature_validator` on the first function call of that turn. A turn that already has a signed call SHALL be sent unchanged.

#### Scenario: Tool loop on Gemini 3
- **GIVEN** a Gemini 3 response with a signed function call
- **WHEN** the agent sends the tool result on the next turn
- **THEN** the replayed function call carries the original signature

#### Scenario: Parallel calls with one signature
- **GIVEN** a Gemini 3 response with two function calls where only the first carries `sig-1`
- **WHEN** the turn is replayed
- **THEN** the first call carries `sig-1`, the second call has no signature and no placeholder is added

#### Scenario: Transcript from another provider
- **WHEN** a replayed assistant tool call has no signature
- **THEN** the first function call of that turn is sent with `skip_thought_signature_validator`

### Requirement: Gemini reasoning levels
The provider SHALL support SDK reasoning through a versioned profile that uses only SDK levels and declares no default level. Gemini 3 models SHALL send the applied level as `thinkingConfig.thinkingLevel`. Gemini 2.5 models SHALL send `thinkingConfig.thinkingBudget`: `low` 1024, `medium` 8192, `high` 24576, and `off` 0 only for flash and flash-lite models.

#### Scenario: Budget model
- **WHEN** `gemini-2.5-flash` is streamed with reasoning `off`
- **THEN** the request carries `thinkingBudget: 0` and no `includeThoughts`

#### Scenario: Level model
- **WHEN** `gemini-3-pro-preview` is streamed with reasoning `high`
- **THEN** the request carries `thinkingLevel: high` and `includeThoughts: true`

### Requirement: Gemini automatic reasoning and thought summaries
When the applied level is `auto` (no preference), Gemini 2.5 models SHALL send `thinkingBudget: -1` and Gemini 3 models SHALL send no level. Every request except applied `off` SHALL include `includeThoughts: true`. The provider SHALL build `thinkingConfig` itself; the shared protocol's reasoning mapping SHALL NOT be applied to Code Assist requests.

#### Scenario: Automatic budget
- **WHEN** `gemini-2.5-pro` is streamed without a reasoning preference
- **THEN** the request carries `thinkingBudget: -1` and `includeThoughts: true`

#### Scenario: Automatic level
- **WHEN** `gemini-3-flash-preview` is streamed without a reasoning preference
- **THEN** the request carries `includeThoughts: true` and no `thinkingLevel`

### Requirement: Gemini quota usage
Usage SHALL call `retrieveUserQuota` for the stored project through the transport and SHALL report one window per model, with the used percent derived from the remaining fraction and the reset time when one is given. The card SHALL also show the tier name and email. Usage SHALL refresh at most once per minute.

#### Scenario: Partially used model
- **WHEN** a bucket for `gemini-2.5-pro` reports remaining fraction 0.25 and a reset time
- **THEN** usage shows a `gemini-2.5-pro` window at 75% used with that reset time

### Requirement: Gemini quota bucket normalization
Buckets without a model id or a numeric remaining fraction SHALL be skipped. Several buckets for one model SHALL merge into one window using the lowest remaining fraction and that bucket's reset time.

#### Scenario: Duplicate buckets
- **WHEN** two buckets for `gemini-2.5-flash` report remaining fractions 0.9 and 0.4
- **THEN** usage shows one `gemini-2.5-flash` window at 60% used

### Requirement: Gemini token counting
Exact input token counting SHALL POST `{ request: { model: "models/<model>", contents } }` to the Code Assist `countTokens` method through the transport, without project or prompt id, where contents come from the same conversion as streaming with the system instructions as a leading user content. It SHALL return the reported `totalTokens`. No generation SHALL happen.

#### Scenario: Count a transcript
- **WHEN** tokens are counted for a transcript on a gemini model
- **THEN** one `countTokens` request is sent and its `totalTokens` is returned

### Requirement: Gemini failures
Code Assist 429 errors SHALL be classified as `quota` when they report exhausted quota and as `throttled` otherwise, with any retry delay or reset time. 403 permission or tier errors SHALL be classified as `auth` with a safe plan message. 404 for a model SHALL be `MODEL_UNAVAILABLE`. Messages MUST NOT include upstream bodies or tokens.

#### Scenario: Quota exhausted
- **WHEN** a stream answers 429 `RESOURCE_EXHAUSTED` with a quota failure and a retry delay of 60 s
- **THEN** the failure has classification `quota`, a 60 s retry hint and no upstream body text

### Requirement: Gemini rejected access token
A 401 SHALL invalidate the access token without replay. The next request SHALL refresh it first, and a rejected refresh SHALL fail with code `LOGIN_REQUIRED`.

#### Scenario: Token rejected
- **WHEN** a stream answers 401
- **THEN** it fails with classification `auth` and the next request refreshes the token first

#### Scenario: Token rejected and refresh rejected
- **WHEN** a stream answers 401 and the following refresh answers `invalid_grant`
- **THEN** the next request fails with code `LOGIN_REQUIRED` and the status reports that login is required

### Requirement: Gemini connection test
The connection test SHALL run Code Assist setup through the transport.

#### Scenario: Connection test
- **WHEN** the owner tests a logged-in connection whose setup succeeds
- **THEN** the test reports available; it reports unauthorized when login is missing or rejected, and unavailable otherwise
