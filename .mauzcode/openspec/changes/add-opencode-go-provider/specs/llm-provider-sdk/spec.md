## ADDED Requirements

### Requirement: Protocol-route providers
A provider definition MAY declare a protocol route instead of a streaming operation, returning a shared protocol id, base URL and headers for a connection, model, cached model metadata and session id. Registration MUST reject a definition declaring both. The core SHALL run all existing inference checks first, then stream through that shared protocol on the connection's transport, merging headers as: JSON accept, protocol headers, provider headers.

#### Scenario: Provider streams through a route
- **WHEN** a stream request targets an enabled model of a provider declaring a protocol route that returns `anthropic`
- **THEN** the request is sent in Anthropic Messages format to the returned base through the connection's transport
- **AND** the normalized result is returned as for any streaming provider

#### Scenario: Route returns an unknown protocol
- **WHEN** a protocol route returns an id outside the shared protocol set
- **THEN** inference fails with code `INVALID_INPUT` and no request is sent

#### Scenario: Route and stream both declared
- **WHEN** a provider declaration contains both a streaming operation and a protocol route
- **THEN** registration of that provider fails with an error

#### Scenario: Route model without reasoning controls
- **GIVEN** a protocol-route provider opted into reasoning
- **WHEN** the requested model was discovered without reasoning metadata and no profile applies
- **THEN** the request streams without any reasoning field instead of failing capability-unavailable

#### Scenario: Disabled model with a route provider
- **WHEN** the requested model or connection is disabled
- **THEN** the existing disabled-state error is returned and the protocol route is not called

## MODIFIED Requirements

### Requirement: Optional inference operations
A provider definition MAY declare streaming and compaction operations that receive the resolved connection and a request, and send network traffic only through the connection's transport. A protocol route counts as streaming support. The core inference entry point SHALL refuse a request with code `UNSUPPORTED` when the provider declares neither a streaming operation nor a protocol route (or no compaction operation for compaction), without contacting the network.

#### Scenario: Provider without streaming
- **WHEN** a stream request targets a connection whose provider declares neither a streaming operation nor a protocol route
- **THEN** it fails with code `UNSUPPORTED` and no request is sent

#### Scenario: Provider with streaming
- **WHEN** a stream request targets an enabled model of an enabled connection whose provider declares streaming
- **THEN** the provider's streaming operation receives the request and its normalized result is returned

### Requirement: SDK-owned reasoning capabilities
The SDK SHALL define provider-owned supported reasoning levels, an optional supported default, optional native wire values per level, an optional thinking-disable flag and requested/applied preference diagnostics. Opted-in providers SHALL receive normalized preferences before inference, without legacy routes, accounts or types. Automatic or omitted preference SHALL use the default; when capabilities declare no default it SHALL apply `auto`, meaning no reasoning setting is sent. Unsupported levels SHALL use the nearest supported lower-or-equal level, otherwise the lowest higher level. Providers not opting in MUST retain their existing behavior.

#### Scenario: Capability-backed normalization
- **GIVEN** a provider participating in SDK reasoning normalization and validated capabilities
- **WHEN** a caller submits a preference
- **THEN** the SDK resolves it before provider inference and retains the requested value for diagnostics without mutating caller settings

#### Scenario: Auto without a declared default
- **WHEN** capabilities declare supported levels but no default and the caller requests auto
- **THEN** the applied value is `auto` and no reasoning field is sent upstream

#### Scenario: Missing capabilities
- **WHEN** an opted-in provider has neither validated capabilities nor an applicable documented SDK profile
- **THEN** inference fails explicitly with a capability-unavailable classification before the inference request
- **AND** the SDK does not discover legacy model routes to fill the gap

#### Scenario: Invalid metadata or preference
- **WHEN** supported levels are empty, a declared default is unsupported, a wire value is empty or for an unsupported level, or the preference is outside the SDK enumeration
- **THEN** the SDK reports a validation failure rather than sending an invalid effort downstream

#### Scenario: Provider not opted in
- **WHEN** an existing provider without SDK capability normalization receives its existing reasoning input
- **THEN** its established behavior is preserved and no new capability lookup is forced on it
