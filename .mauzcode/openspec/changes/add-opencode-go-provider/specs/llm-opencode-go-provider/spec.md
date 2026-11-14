## Purpose
Connect an OpenCode Go subscription as a Models provider: API-key authentication, model discovery with protocol and reasoning metadata, per-model native routing, session identity, subscription usage windows and connection testing, all through the connection's saved transport.

## ADDED Requirements

### Requirement: OpenCode Go connection
The system SHALL offer an optional official plugin registering provider `opencode-go` with a required secret API key and direct, SOCKS and SSH-tunnel transports. Requests SHALL use `Authorization: Bearer`, a truthful MauzCode user agent and only `https://opencode.ai/inference/go/...` through the connection's transport. The key MUST NOT be returned, logged or put in errors. There SHALL be no fallback to pay-as-you-go or another provider; unknown configuration fields SHALL be rejected.

#### Scenario: Connection created
- **WHEN** the owner creates an `opencode-go` connection with an API key
- **THEN** the connection is saved with the key in encrypted secret storage and the provider appears in the provider catalogue

#### Scenario: Missing key
- **WHEN** an operation runs on a connection without an API key
- **THEN** it fails without contacting the network

### Requirement: OpenCode Go model discovery
Model discovery SHALL read `GET /inference/go/v1/models` and list only tool-capable chat models with label, limits and native protocol (`chat-completions` → `openai-chat`, `responses` → `openai-responses`, `messages` → `anthropic`, `generate-content` → `gemini`). Reasoning metadata SHALL come only from reported values: `none` → `off`, `max` → `xhigh` when `xhigh` is absent, unknown values ignored, a toggle adds `off` with thinking-disable, a reported default kept.

#### Scenario: Native protocol reported
- **WHEN** discovery reports model `claude-haiku-5-5` with API `messages`
- **THEN** it is listed with protocol `anthropic`

#### Scenario: Max effort without xhigh
- **WHEN** a model reports efforts `low`, `high`, `max`
- **THEN** its supported levels are `low`, `high`, `xhigh` and `xhigh` is sent as `max`

#### Scenario: Model without tools
- **WHEN** a reported model does not support tools
- **THEN** it is not listed

### Requirement: OpenCode Go native routing and sessions
Streaming SHALL use each model's cached native protocol with the Go base for that protocol (`/openai/v1` for both OpenAI protocols, `/anthropic/v1`, `/google/v1beta`), and Chat Completions when no protocol is cached. Every inference request SHALL carry `x-opencode-session` equal to the request session id.

#### Scenario: Responses model
- **WHEN** an agent streams a model cached with protocol `openai-responses`
- **THEN** the request is sent to `https://opencode.ai/inference/go/openai/v1/responses` with the session header

#### Scenario: Uncached model
- **WHEN** a model id has no cached metadata
- **THEN** the request is sent to Go Chat Completions

### Requirement: OpenCode Go usage and test
Usage SHALL read `GET /inference/go/v1/usage` and report `rolling`, `weekly` and `monthly` as used percentages (`rate-limited` counts as 100%) with server reset times; failures SHALL be reported, never shown as zero usage. The connection test SHALL do the same authenticated read: success is available, 401 or 403 unauthorized, otherwise unavailable, without response bodies. Prices SHALL come from the `opencode-go` catalogue vendor.

#### Scenario: Usage windows
- **WHEN** usage reports rolling 12%, weekly 40% rate-limited and monthly 55%
- **THEN** windows 5h 12%, weekly 100% and monthly 55% are returned with their reset times

#### Scenario: Rejected key
- **WHEN** the usage endpoint answers 401
- **THEN** the test reports unauthorized
