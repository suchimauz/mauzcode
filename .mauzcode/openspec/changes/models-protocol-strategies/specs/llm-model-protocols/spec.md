## Purpose

Provide a closed set of reusable wire protocols for model discovery and minimal generation probes, while keeping authentication provider-owned and all requests on the connection's selected transport.

## ADDED Requirements

### Requirement: Closed set of shared protocols
The system SHALL provide exactly four shared wire protocols, identified as `openai-chat`, `openai-responses`, `anthropic` and `gemini`. The set SHALL be owned by core; plugins and provider declarations SHALL NOT add, replace or remove shared protocols. Listing the shared protocols SHALL return these four protocols as id and label pairs in a stable order.

#### Scenario: Listing shared protocols
- **WHEN** the shared protocol list is requested
- **THEN** it returns `openai-chat`, `openai-responses`, `anthropic` and `gemini` in that order, each with its display label

#### Scenario: Unknown protocol id
- **WHEN** a shared protocol is requested by an id outside the set
- **THEN** the request fails with an unsupported protocol error and no network request is made

### Requirement: Protocol strategy contract
Every shared protocol SHALL implement model discovery and a minimal probe on a provider-supplied endpoint and the transport-bound fetch. A probe SHALL require a model id. Both SHALL accept an optional abort signal. A protocol SHALL also normalize a configured base URL to its versioned API base, provide its required non-authentication headers, and map an API key to its standard authentication headers.

#### Scenario: Signal aborted before the request
- **WHEN** discovery or a probe is called with a signal that is already aborted
- **THEN** the operation rejects with an abort error and no request is sent

#### Scenario: Signal aborted after the response
- **WHEN** the signal is aborted after the response has arrived but before the operation completes
- **THEN** the operation rejects and the response body is cancelled

#### Scenario: Probe without a model
- **WHEN** a probe is called with an empty model id
- **THEN** it fails with a test model required error and no request is sent

#### Scenario: Base URL with empty query or fragment
- **WHEN** a base URL whose raw text contains `?` or `#`, even with nothing after it, is normalized
- **THEN** normalization fails with an invalid base URL error

#### Scenario: Discovery through a shared protocol
- **WHEN** a provider asks a shared protocol to discover models for an endpoint
- **THEN** the protocol requests its catalogue path and returns unique non-empty model ids in catalogue order

#### Scenario: Probe with a model
- **WHEN** a provider asks a shared protocol to probe an endpoint with a model id
- **THEN** the protocol sends one minimal non-streaming generation for that model limited to one output token

#### Scenario: Versioned base URL
- **WHEN** a base URL is normalized by `anthropic` or `gemini` after trailing slashes are trimmed
- **THEN** `anthropic` keeps a base ending with `/v1` and appends `/v1` to any other base
- **AND** `gemini` keeps a base ending with `/v1` or `/v1beta` and appends `/v1beta` to any other base
- **AND** the OpenAI protocols keep the base unchanged

### Requirement: Selection without protocol branching
Selecting a shared protocol SHALL be a single lookup by id. Behavior that differs between protocols SHALL live in the protocol implementations, not in conditional branches of callers.

#### Scenario: Provider uses the selected protocol
- **WHEN** a provider performs discovery or a probe for a configured protocol id
- **THEN** it obtains the protocol by id and calls its operations without branching on the id

### Requirement: Provider-owned authentication
A protocol SHALL NOT read connection secrets: it SHALL receive only the transport-bound fetch, not the connection itself. The provider SHALL build the endpoint headers, including any authentication. A shared protocol's API-key header mapping SHALL be: bearer `Authorization` for both OpenAI protocols, `x-api-key` for Anthropic, and `x-goog-api-key` for Gemini.

#### Scenario: Provider without an API key
- **WHEN** a provider builds an endpoint without an API key
- **THEN** the protocol requests carry no authentication header

### Requirement: Protocol-required headers
A shared protocol SHALL provide its required non-authentication headers separately from its API-key mapping, and they SHALL be sent whether or not an API key exists. For Anthropic this is `anthropic-version: 2023-06-01`. Header merging SHALL be case-insensitive.

#### Scenario: Anthropic without an API key
- **WHEN** an `anthropic` endpoint is built without an API key
- **THEN** requests carry `anthropic-version: 2023-06-01` and no `x-api-key`

### Requirement: Transport and failure safety
Protocol requests SHALL be sent only through the connection's transport-bound fetch. A non-success HTTP response or a malformed catalogue SHALL fail the operation without exposing the response body, and the response body SHALL be released.

#### Scenario: Discovery request fails
- **WHEN** the catalogue request returns a non-success status
- **THEN** discovery fails with a message containing only the HTTP status and the body is cancelled

#### Scenario: Malformed catalogue
- **WHEN** the catalogue response lacks the protocol's model array
- **THEN** discovery fails with an invalid model catalogue error
