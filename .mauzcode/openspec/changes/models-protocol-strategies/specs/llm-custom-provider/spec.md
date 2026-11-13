## MODIFIED Requirements

### Requirement: Protocol-specific authentication
The custom provider SHALL send the API key in the selected shared protocol's standard form, obtained from that protocol's API-key header mapping: bearer authorization for both OpenAI protocols, the `x-api-key` header with an API version header for Anthropic, and the `x-goog-api-key` header for Gemini. The custom provider SHALL choose the protocol by registry lookup of its configured protocol id, and its protocol select options SHALL equal the shared protocol set (values and labels) in the same order. The Anthropic version header SHALL be sent with or without an API key.

#### Scenario: Anthropic headers
- **WHEN** a request is made for a custom connection with protocol `anthropic` and an API key
- **THEN** it carries `x-api-key` and `anthropic-version` headers and no bearer authorization

#### Scenario: Protocol options match the shared set
- **WHEN** the custom provider fields are inspected
- **THEN** the protocol select option values and labels equal the listed shared protocol ids and labels in order

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
