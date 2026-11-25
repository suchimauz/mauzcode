## Purpose

Use the Gemini models available to a single Antigravity account through a distinct Models connection, without substituting public Gemini API credentials or another account's quota.

## ADDED Requirements

### Requirement: Explicit Antigravity connection
The system SHALL provide a distinct `antigravity` connection type. Before sign-in it MUST disclose Google's restriction on third-party personal-login use and possible account suspension. Provider traffic MUST require explicit configuration, use the connection transport, and never fall back to another account, credential type or service.

#### Scenario: Unconfigured installation
- **WHEN** the owner inspects an Antigravity connection without the required client configuration
- **THEN** settings explain why sign-in is unavailable, and connection tests, catalogue discovery and inference send no upstream request

#### Scenario: Existing Gemini connection
- **WHEN** an owner adds an Antigravity connection alongside a Custom Gemini connection
- **THEN** they have separate routes and credentials and the Custom connection behaves as before

### Requirement: Single-account sign-in lifecycle
An Antigravity connection SHALL use the Antigravity OAuth client identity with authorization code and PKCE, not a Gemini API key. It SHALL bind completion to the original login and connection, refresh expired access for that account, and remove local authorization on logout. Credentials MUST NOT appear in source, public connection data, logs or error messages.

#### Scenario: Login and refresh
- **WHEN** the owner completes a valid login for connection A and its access token later expires
- **THEN** A can refresh without a new interactive login, and connection B cannot use the resulting credentials

#### Scenario: Stale or mismatched return
- **WHEN** a cancelled, expired, already consumed or mismatched login is completed
- **THEN** no new credentials are stored and no current account is replaced

#### Scenario: Logout or revoked grant
- **WHEN** the owner logs out or refresh reports a revoked grant
- **THEN** the connection requires sign-in, cannot infer with the old account, and does not offer its stale catalogue as available

### Requirement: Account-scoped Gemini catalogue
The provider SHALL resolve the signed-in account's Antigravity project and discover available Gemini generation models for that project. It MUST preserve native model IDs and exclude non-Gemini and non-generation entries. A connection test SHALL verify authorization, project access and discovery without a billable generation.

#### Scenario: Mixed inventory
- **WHEN** a project returns a Gemini generation model, a Claude model and a non-generation model
- **THEN** the picker offers only the Gemini generation model on the Antigravity connection route

#### Scenario: No accessible project or no models
- **WHEN** the account has no accessible project or discovery succeeds with no eligible Gemini models
- **THEN** the test distinguishes project access failure from an empty catalogue and the provider invents neither a project nor a fallback model

### Requirement: Wrapped Gemini turns and tool continuity
The provider SHALL send the selected model, the account project and the Gemini request in the Antigravity envelope. It SHALL normalize wrapped events into SDK text, tool calls, finish status and reported token usage. It MUST preserve each tool call's own opaque thought signature for the corresponding continuation, and MUST NOT fabricate one.

#### Scenario: Tool round trip
- **WHEN** a stream returns two function calls with different signatures and the agent sends their results on the next turn
- **THEN** each call retains its own signature and result association in the next Gemini request, and the resulting text streams to the agent

#### Scenario: Normal completion
- **WHEN** wrapped events deliver text followed by a final reason and usage
- **THEN** consumers receive incremental text and one normalized completion with the reported usage

### Requirement: No fallback or unsafe replay
The provider SHALL surface authentication, access and quota failures distinctly without rotating accounts or quota sources. A cancelled, malformed or incomplete generation MUST NOT be reported as a successful completion or silently replayed.

#### Scenario: Access denied or quota exhausted
- **WHEN** generation is rejected for missing entitlement or exhausted quota
- **THEN** the failure identifies the corresponding cause and no substitute request is sent

#### Scenario: Stream ends early
- **WHEN** generation has emitted text but is cancelled or the stream closes without a terminal reason
- **THEN** the SDK reports cancellation or interruption respectively, without replaying the request
