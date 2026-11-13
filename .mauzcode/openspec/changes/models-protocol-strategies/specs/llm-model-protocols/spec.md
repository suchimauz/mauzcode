## ADDED Requirements

### Requirement: Closed set of shared protocols
The system SHALL provide exactly four shared wire protocols, identified as `openai-chat`, `openai-responses`, `anthropic` and `gemini`. The set SHALL be owned by core; plugins and provider declarations SHALL NOT add, replace or remove shared protocols. Listing the shared protocols SHALL return these four ids in a stable order.

#### Scenario: Listing shared protocols
- **WHEN** the shared protocol list is requested
- **THEN** it returns `openai-chat`, `openai-responses`, `anthropic` and `gemini` in that order

#### Scenario: Unknown protocol id
- **WHEN** a shared protocol is requested by an id outside the set
- **THEN** the request fails with an unsupported protocol error and no network request is made

### Requirement: Protocol strategy contract
Every protocol, shared or private, SHALL implement one contract consisting of model discovery and a minimal probe, both operating on a provider-supplied endpoint (base URL and request headers) and the resolved connection. A shared protocol SHALL additionally normalize a configured base URL to its versioned API base and map an API key to its standard authentication headers.

#### Scenario: Discovery through a shared protocol
- **WHEN** a provider asks a shared protocol to discover models for an endpoint
- **THEN** the protocol requests its catalogue path and returns unique non-empty model ids in catalogue order

#### Scenario: Probe with a model
- **WHEN** a provider asks a shared protocol to probe an endpoint with a model id
- **THEN** the protocol sends one minimal non-streaming generation for that model limited to one output token

#### Scenario: Versioned base URL
- **WHEN** a base URL without a version segment is normalized by `anthropic` or `gemini`
- **THEN** `/v1` or `/v1beta` respectively is appended, and a base that already ends with an accepted version is kept

### Requirement: Selection without protocol branching
Selecting a shared protocol SHALL be a single lookup by id. Behavior that differs between protocols SHALL live in the protocol implementations, not in conditional branches of callers.

#### Scenario: Provider uses the selected protocol
- **WHEN** a provider performs discovery or a probe for a configured protocol id
- **THEN** it obtains the protocol by id and calls its operations without branching on the id

### Requirement: Provider-owned authentication
A protocol SHALL NOT read connection secrets. The provider SHALL build the endpoint headers, including any authentication. A shared protocol's API-key header mapping SHALL be: bearer `Authorization` for both OpenAI protocols, `x-api-key` with `anthropic-version: 2023-06-01` for Anthropic, and `x-goog-api-key` for Gemini.

#### Scenario: Provider without an API key
- **WHEN** a provider builds an endpoint without an API key
- **THEN** the protocol requests carry no authentication header

### Requirement: Transport and failure safety
Protocol requests SHALL be sent only through the connection's transport-bound fetch. A non-success HTTP response or a malformed catalogue SHALL fail the operation without exposing the response body, and the response body SHALL be released.

#### Scenario: Discovery request fails
- **WHEN** the catalogue request returns a non-success status
- **THEN** discovery fails with a message containing only the HTTP status and the body is cancelled

#### Scenario: Malformed catalogue
- **WHEN** the catalogue response lacks the protocol's model array
- **THEN** discovery fails with an invalid model catalogue error

### Requirement: Private provider protocols
A provider MAY implement its own protocol of the same contract inside the provider. Such a protocol SHALL NOT be registered as a shared protocol, listed, or selectable by other providers, and adopting it SHALL NOT change the provider's observable requests or results.

#### Scenario: Provider with a private protocol
- **WHEN** the shared protocol list is requested while providers with private protocols are mounted
- **THEN** only the four shared protocols are listed
