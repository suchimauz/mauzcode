# llm-custom-provider Specification

## Purpose
Defines the built-in `custom` provider that connects any endpoint speaking one of the supported wire protocols, given an API URL, an optional API key and an optional network transport.

## Requirements

### Requirement: Custom connection fields
The `custom` provider SHALL accept an API base URL, an optional secret API key, a protocol (`openai-chat`, `openai-responses`, `anthropic` or `gemini`) and an optional manual model list, and SHALL allow every transport.

#### Scenario: Custom connection through a proxy
- **WHEN** the owner creates a custom connection with an https URL, protocol `openai-chat` and a saved SOCKS proxy
- **THEN** the connection is stored and all its requests go through that proxy

#### Scenario: Unsupported protocol
- **WHEN** the protocol value is not one of the four supported values
- **THEN** creation fails with a validation error

#### Scenario: Invalid base URL
- **WHEN** the base URL is not an absolute http or https URL or contains credentials, a query or a fragment
- **THEN** creation fails with a validation error

### Requirement: Protocol-specific authentication
The custom provider SHALL send the API key in the selected shared protocol's standard form, obtained from that protocol's API-key header mapping: bearer authorization for both OpenAI protocols, the `x-api-key` header with an API version header for Anthropic, and the `x-goog-api-key` header for Gemini. The custom provider SHALL choose the protocol by registry lookup of its configured protocol id, and its protocol select options SHALL equal the shared protocol set (values and labels) in the same order. The Anthropic version header SHALL be sent with or without an API key.

#### Scenario: Anthropic headers
- **WHEN** a request is made for a custom connection with protocol `anthropic` and an API key
- **THEN** it carries `x-api-key` and `anthropic-version` headers and no bearer authorization

#### Scenario: Protocol options match the shared set
- **WHEN** the custom provider fields are inspected
- **THEN** the protocol select option values and labels equal the listed shared protocol ids and labels in order

### Requirement: Custom model discovery
The custom provider SHALL list models from the protocol's models endpoint and merge them with the manual model list; when discovery fails or is unsupported, the manual list MUST still be returned.

#### Scenario: Discovery succeeds
- **WHEN** the models endpoint returns a model catalogue
- **THEN** the listed models include the discovered ids and the manual ids without duplicates

#### Scenario: Discovery fails
- **WHEN** the models endpoint returns an error
- **THEN** the manual model list is returned with a discovery error flag

### Requirement: Custom connection test
The custom provider test SHALL request the models endpoint and, when the connection has a test model configured, send one minimal generation request in the selected protocol; the result MUST report `available` only when every attempted request succeeds. If discovery fails, the result SHALL be `unavailable` with reason `models-failed` and no generation request SHALL be sent, whether or not a test model is configured.

#### Scenario: Models endpoint reachable, generation fails
- **WHEN** the models request succeeds and the minimal generation request returns an error
- **THEN** the test result is `unavailable` with reason `generation-failed`

#### Scenario: No test model
- **WHEN** no test model is configured and the models request succeeds
- **THEN** only model discovery is requested and the test result is `available` with reason `models-ok`

#### Scenario: Discovery fails without a test model
- **WHEN** no test model is configured and model discovery fails
- **THEN** the test result is `unavailable` with reason `models-failed`
- **AND** no generation request is sent

#### Scenario: Discovery fails with a test model
- **WHEN** a test model is configured and model discovery fails
- **THEN** the test result is `unavailable` with reason `models-failed`
- **AND** no generation request is sent

### Requirement: Custom usage is status only
The custom provider SHALL NOT report quota windows or balance; its usage report MUST contain only the connection status.

#### Scenario: Usage of a custom connection
- **WHEN** usage is requested for a custom connection
- **THEN** the report contains status, reason and check time only

### Requirement: Custom streaming inference
The `custom` provider SHALL declare streaming inference with the `sampling` and `structuredOutput` capabilities and SHALL serve it through the shared protocol selected by the connection's `protocol` field, using the same endpoint and authentication headers as discovery and testing, without branching on the protocol id. It SHALL accept no `providerOptions` keys.

#### Scenario: Streaming through the configured protocol
- **WHEN** a stream request targets an enabled model of a custom connection with protocol `anthropic`
- **THEN** the request is sent to the connection's Anthropic Messages endpoint with its API key header through the connection transport

#### Scenario: Provider options on a custom connection
- **WHEN** a stream request for a custom connection carries any `providerOptions` key
- **THEN** it fails with code `INVALID_INPUT` and no request is sent
