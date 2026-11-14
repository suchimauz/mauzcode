## ADDED Requirements

### Requirement: Custom streaming inference
The `custom` provider SHALL declare streaming inference with the `sampling` and `structuredOutput` capabilities and SHALL serve it through the shared protocol selected by the connection's `protocol` field, using the same endpoint and authentication headers as discovery and testing, without branching on the protocol id. It SHALL accept no `providerOptions` keys.

#### Scenario: Streaming through the configured protocol
- **WHEN** a stream request targets an enabled model of a custom connection with protocol `anthropic`
- **THEN** the request is sent to the connection's Anthropic Messages endpoint with its API key header through the connection transport

#### Scenario: Provider options on a custom connection
- **WHEN** a stream request for a custom connection carries any `providerOptions` key
- **THEN** it fails with code `INVALID_INPUT` and no request is sent
