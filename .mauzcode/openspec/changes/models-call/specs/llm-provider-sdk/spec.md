## MODIFIED Requirements

### Requirement: Optional inference operations
A provider definition MAY declare streaming and compaction operations that receive the resolved connection and a request, and send network traffic only through the connection's transport. The core inference entry point SHALL refuse a request with code `UNSUPPORTED` when the provider declares no such operation, without contacting the network. A stream request MAY carry the optional fields `temperature`, `maxTokens`, `responseFormat` and `providerOptions`; the core SHALL pass `temperature` and `maxTokens` only to providers declaring the `sampling` capability, `responseFormat` only to providers declaring the `structuredOutput` capability, and `providerOptions` unchanged. A provider SHALL reject unknown `providerOptions` keys with an invalid input failure.

#### Scenario: Provider without streaming
- **WHEN** a stream request targets a connection whose provider declares no streaming operation
- **THEN** it fails with code `UNSUPPORTED` and no request is sent

#### Scenario: Provider with streaming
- **WHEN** a stream request targets an enabled model of an enabled connection whose provider declares streaming
- **THEN** the provider's streaming operation receives the request and its normalized result is returned

#### Scenario: Sampling options for a provider without the capability
- **WHEN** a stream request with `temperature` or `maxTokens` targets a provider that does not declare `sampling`
- **THEN** the provider receives the request without those fields

#### Scenario: Structured format for a provider with the capability
- **WHEN** a stream request with `responseFormat` targets a provider that declares `structuredOutput`
- **THEN** the provider receives `responseFormat` and maps it to its native wire format

#### Scenario: Unknown provider option
- **WHEN** a provider receives a `providerOptions` key it does not support
- **THEN** the request fails with code `INVALID_INPUT` before any network request is sent

#### Scenario: Unknown capability flag
- **WHEN** a provider declaration lists a capability flag other than `continuationState`, `checkpoints`, `reasoning`, `sampling` or `structuredOutput`
- **THEN** registration of that declaration fails
