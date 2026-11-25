## Purpose

Use the Gemini models available to a single Antigravity account through a distinct Models connection, without substituting public Gemini API credentials or another account's quota.

## ADDED Requirements

### Requirement: Explicit Antigravity connection
The system SHALL provide a distinct `antigravity` connection type that sends no upstream request until the owner creates a connection and signs in. Before sign-in it MUST disclose Google's restriction on third-party personal-login use and possible account suspension. Provider traffic MUST use the connection transport and never fall back to another account, credential type or service.

#### Scenario: Connection before sign-in
- **WHEN** the owner creates an Antigravity connection and has not signed in
- **THEN** settings show the restriction warning and require sign-in, and connection tests, catalogue discovery and inference send no upstream request

#### Scenario: Existing Gemini connection
- **WHEN** an owner adds an Antigravity connection alongside a Custom Gemini connection
- **THEN** they have separate routes and credentials and the Custom connection behaves as before

### Requirement: Built-in Antigravity client identity
The provider SHALL sign in with the public Antigravity OAuth client ID and client secret shipped as provider constants. Each value SHALL be overridable through an installation environment variable that applies only to that installation. The client values MUST NOT be requested from the owner or stored per connection.

#### Scenario: Default client identity
- **WHEN** no override is configured and the owner starts sign-in
- **THEN** the authorization and token requests use the built-in Antigravity client identity

#### Scenario: Operator override
- **WHEN** the installation sets a client ID or client secret override
- **THEN** sign-in and token refresh use the overridden value instead of the built-in one

### Requirement: Single-account sign-in lifecycle
An Antigravity connection SHALL use authorization code with PKCE, not a Gemini API key. It SHALL bind completion to the original login and connection, refresh expired access for that account, and remove local authorization on logout. Account tokens, authorization codes and verifiers MUST NOT appear in public connection data, logs or error messages.

#### Scenario: Login and refresh
- **WHEN** the owner completes a valid login for connection A and its access token later expires
- **THEN** A can refresh without a new interactive login, and connection B cannot use the resulting credentials

#### Scenario: Stale or mismatched return
- **WHEN** a cancelled, expired, already consumed or mismatched login is completed
- **THEN** no new credentials are stored and no current account is replaced

#### Scenario: Logout or revoked grant
- **WHEN** the owner logs out or refresh reports a revoked grant
- **THEN** the connection requires sign-in, cannot infer with the old account, and does not offer its stale catalogue as available

### Requirement: Sign-in from a browser on another machine
Sign-in SHALL always show the authorization link and accept the returned redirect address pasted into the Models login panel. An optional local loopback listener SHALL complete the same login when reachable, but sign-in MUST NOT depend on it. A pasted address SHALL complete the login only when its scheme, host, port and path equal the expected redirect, it carries a code and the pending login's state, and the login is neither expired, cancelled nor consumed.

#### Scenario: Remote browser paste
- **WHEN** the browser runs on a different machine, cannot reach the redirect address, and the owner pastes that address into the login panel
- **THEN** the code is exchanged exactly once and the connection is signed in to that account

#### Scenario: Invalid pasted address
- **WHEN** the pasted address has a different host or path, lacks a code, carries another state, or was already used
- **THEN** sign-in is rejected with a safe message, no token request is sent and no credentials are stored

#### Scenario: Loopback and paste race
- **WHEN** the local listener completes a login and the same redirect is pasted afterwards
- **THEN** the paste is rejected as already consumed and the stored account is unchanged

### Requirement: Account-scoped Gemini catalogue
The provider SHALL resolve the signed-in account's Antigravity project and list only the models the inventory marks visible and not disabled whose native ID names Gemini and not Claude. It MUST preserve native model IDs and MUST NOT add a model the inventory does not offer. A connection test SHALL verify authorization, project access and discovery without a billable generation.

#### Scenario: Mixed inventory
- **WHEN** an inventory returns a visible Gemini model, a Claude model, a disabled Gemini model and a hidden internal model
- **THEN** the picker offers only the visible Gemini model on the Antigravity connection route

#### Scenario: No accessible project or no models
- **WHEN** the account has no accessible project or discovery succeeds with no eligible Gemini models
- **THEN** the test distinguishes project access failure from an empty catalogue and the provider invents neither a project nor a fallback model

### Requirement: Inventory model metadata
Each listed model SHALL take its context and output limits from the inventory entry and leave an absent limit unspecified. A model the inventory marks as not supporting thinking SHALL offer no reasoning levels. Gemini 3 Flash models SHALL offer `minimal`, `low`, `medium` and `high`, Gemini 3 Pro models `low` and `high`, each sent as the native thinking level. Models SHALL carry no price.

#### Scenario: Reported limits and levels
- **WHEN** the inventory reports a Gemini 3 Flash entry with context and output limits and thinking support
- **THEN** the model shows those limits and offers `minimal` through `high`, and a selected level is sent as the same native thinking level

#### Scenario: Missing metadata
- **WHEN** an entry omits its limits and marks thinking as unsupported
- **THEN** the model has no provider limits, no reasoning levels and no price

### Requirement: Wrapped Gemini turns and tool continuity
The provider SHALL send the selected model, the account project and the Gemini request in the Antigravity envelope. It SHALL normalize wrapped events into SDK text, tool calls, finish status and reported token usage. It MUST preserve each tool call's own opaque thought signature for the corresponding continuation, and MUST NOT fabricate one.

#### Scenario: Tool round trip
- **WHEN** a stream returns two function calls with different signatures and the agent sends their results on the next turn
- **THEN** each call retains its own signature and result association in the next Gemini request, and the resulting text streams to the agent

#### Scenario: Normal completion
- **WHEN** wrapped events deliver text followed by a final reason and usage
- **THEN** consumers receive incremental text and one normalized completion with the reported usage

### Requirement: Failure classification
The provider SHALL classify failures as follows. A revoked refresh grant is `auth`, not retryable, and clears local sign-in. A 401 response is `auth`, rejected and replay-safe, and forces a token refresh before any retry. A 403 is an access failure, not retryable. A 429 or exhausted resource is `QUOTA_EXHAUSTED`, not retryable, carrying any reported reset time. A 5xx or connection error before response data is retryable and replay-safe.

#### Scenario: Quota exhausted
- **WHEN** generation is rejected with exhausted quota and a reported retry delay
- **THEN** the call fails with `QUOTA_EXHAUSTED` and the reset time after exactly one upstream generation request

#### Scenario: Expired access during generation
- **WHEN** generation returns 401 and a token refresh succeeds
- **THEN** at most one further generation request is sent on the same account, with the refreshed token

#### Scenario: Access denied
- **WHEN** generation is rejected for missing entitlement
- **THEN** the call fails as an access failure without retry or substitute request

### Requirement: No fallback or unsafe replay
The provider MUST NOT rotate accounts, projects, quota sources or services after any failure. A cancelled, malformed or incomplete generation MUST NOT be reported as a successful completion or replayed; once response data has arrived, acceptance SHALL be reported as uncertain.

#### Scenario: Stream ends early
- **WHEN** generation has emitted text but is cancelled or the stream closes without a terminal reason
- **THEN** the SDK reports cancellation or interruption respectively, without replaying the request

#### Scenario: Malformed stream frame
- **WHEN** a wrapped stream frame cannot be parsed after response data has arrived
- **THEN** the call fails with uncertain acceptance and no further generation request is sent
