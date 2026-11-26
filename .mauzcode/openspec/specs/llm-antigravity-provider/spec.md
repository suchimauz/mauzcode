# llm-antigravity-provider Specification

## Purpose
Use the Gemini models available to a single Antigravity account through a distinct Models connection, without substituting public Gemini API credentials or another account's quota.

## Requirements

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

### Requirement: Inventory model metadata
Each model SHALL use its inventory limits, leaving absent limits unspecified, and carry no price. A group's reasoning choices SHALL come only from its `groupedModels` entry's `supportedThinkingLevels` that resolve to distinct eligible native IDs with thinking not explicitly disabled. Labels, numeric levels, suffixes or a thinking-support flag alone MUST NOT create selectable levels. A standalone model without evidence of a choice SHALL offer no effort selector.

#### Scenario: Reported limits and levels
- **WHEN** a Gemini 3.8 Flash group advertises `low`, `medium` and `high`, all three visible native members share reported context and output limits, and no member for `minimal` is advertised
- **THEN** the group shows the reported limits and exactly those three levels; `minimal` is not offered even though an older Flash profile included it

#### Scenario: Missing metadata
- **WHEN** an ungrouped entry omits its limits and marks thinking as unsupported
- **THEN** the model has no provider limits, no reasoning levels and no price

#### Scenario: Group link is not proof of availability
- **WHEN** a group declares four suffixes but one has no corresponding visible native ID and another member explicitly disables thinking
- **THEN** neither level is offered, and no request can be made by inventing an ID from the group key and a suffix

### Requirement: Wrapped Antigravity turns and tool continuity
The provider SHALL send the selected native Gemini or Claude ID and the account project in the Antigravity envelope, with the inner request in Gemini `generateContent` format for both families. It SHALL normalize wrapped events into SDK text, tool calls, finish status and reported token usage, preserving each tool call's own opaque continuation data and never fabricating a signature.

#### Scenario: Tool round trip
- **WHEN** a Gemini stream returns two function calls with different signatures and the agent sends their results on the next turn
- **THEN** each call retains its own signature and result association in the next Gemini request, and the resulting text streams to the agent

#### Scenario: Normal completion
- **WHEN** a stream returns text followed by a terminal reason and usage
- **THEN** consumers receive incremental text and one normalized completion with the reported usage

#### Scenario: Claude generation and continuation
- **WHEN** a selected Claude member streams a tool call and the agent returns its result
- **THEN** both requests use the exact selected Claude native ID on the same Antigravity connection; the tool result is correlated with the original call, provider-required continuation data is preserved and the final text and usage reach the agent
- **AND** successful catalogue discovery on its own does not satisfy this scenario

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

### Requirement: Account-scoped Gemini and Claude catalogue
The provider SHALL resolve the signed-in account's project and offer only its visible, non-disabled Gemini and Claude models. It MUST show one choice per advertised group with eligible members and keep eligible ungrouped models as individual choices. It MUST NOT turn service-only, unsupported-family or unlisted IDs into choices. The connection test SHALL verify authorization, project access and discovery without generating.

#### Scenario: Mixed inventory
- **WHEN** a response contains grouped Gemini and Claude variants, an ungrouped visible Gemini, a disabled variant, GPT-OSS and a service-only model
- **THEN** the picker offers each eligible group once and the standalone Gemini once, without separate rows for group members or entries for the excluded models
- **AND** the same visible ID appearing in multiple inventory lists does not create another choice

#### Scenario: Group key collides with a native ID
- **WHEN** a group key equals the ID of a separate visible native model, or one native ID is claimed by two groups
- **THEN** the ambiguous group gets no effort choices and its eligible native models are offered as standalone choices, so the native route still denotes that exact model

#### Scenario: No accessible project or no models
- **WHEN** the account has no accessible project or discovery succeeds with no eligible models
- **THEN** the connection test distinguishes project access failure from an empty catalogue, without generating or inventing a project, group or fallback model

### Requirement: Exact group variant dispatch
A group route SHALL publish its members as SDK reasoning variants, with the response's default agent model as default member only when it belongs to that group. The request SHALL name the SDK-chosen native member on the same connection with no separate thinking level. A standalone route SHALL send its own ID. A route absent from the current catalogue MUST fail `MODEL_UNAVAILABLE` before generation, never switching family, account or service.

#### Scenario: Explicit effort selects a model, not a second effort override
- **WHEN** the user selects `xhigh` on a group whose eligible member for that level is `gemini-4-neon-xhigh`
- **THEN** the Antigravity request names `gemini-4-neon-xhigh` verbatim; it does not send the group key as the model or override the member with a conflicting thinking level

#### Scenario: Auto chooses a member deterministically
- **WHEN** the provider's default ID belongs to a different group or is no longer eligible
- **THEN** `auto` chooses the first eligible member of the selected group in listing order, not the first key in the model dictionary or a default from another group
- **AND** an eligible declared default in the selected group takes precedence over that order

#### Scenario: Saved level missing from the group
- **WHEN** a chat saved `xhigh` and its group now backs only `low`, `medium` and `high`
- **THEN** the request names the `high` member, following the SDK nearest-level rule, and sends no thinking level

#### Scenario: Route no longer in the catalogue
- **WHEN** a saved route names a native member ID, a removed group or a model of the old Gemini-only catalogue that is not a current choice
- **THEN** the request fails `MODEL_UNAVAILABLE` without a generation request; no member, group or neighbouring model is substituted

### Requirement: Read quota summary on the signed-in connection
Quota measurement SHALL use authenticated POST `v1internal:retrieveUserQuotaSummary` with the signed-in connection's resolved project on its fixed Cloud Code host and saved transport. This dedicated read MUST NOT allow arbitrary methods, hosts or redirects, generate a response from a model, or borrow another account's credentials or project. No raw credentials, project identifiers or response bodies SHALL be exposed in quota output or errors.

#### Scenario: Isolated read with an active sign-in
- **WHEN** usage is requested for an eligible signed-in connection
- **THEN** the quota read uses that connection's project, Hub client identity and transport, without generation or catalogue mutation
- **AND** an unlisted endpoint remains blocked; an access failure produces no probe of another project, account or host

### Requirement: Separate measured group and period buckets
The provider SHALL read `groups[].buckets[]` using structured bucket identity and `window` (`5h` or `weekly`), retaining each bucket's group, period, observation, valid fraction and reset independently. It MUST NOT infer a family or period from display labels, time until reset, equal readings or model inventory. The shared third-party pool SHALL supply Claude's windows, not account-wide limits.

#### Scenario: Independent measurements from one account
- **WHEN** `gemini-5h`, `gemini-weekly`, `3p-5h` and `3p-weekly` report remaining fractions 0.8, 0.4, 0.9 and 0.25 and four distinct resets with their matching windows
- **THEN** Gemini reports 20% and 60% used and Claude/GPT reports 10% and 75% used for five hours and weekly, respectively; each reset stays with its bucket
- **AND** an independently reported model-specific Gemini weekly bucket does not replace the general Gemini weekly bucket, even if its label contains Gemini

#### Scenario: Unit conversion and missing fields
- **WHEN** a bucket contains a fraction of 0 or 1, a valid reset without a fraction, or a valid fraction without a parseable reset
- **THEN** the reports distinguish 100% used, 0% used, unknown usage with a reset, and known usage with an unknown reset
- **AND** a missing bucket, invalid fraction or conflicting group/period evidence is not populated from another bucket, an inventory reading or a previous complete response
