## MODIFIED Requirements

### Requirement: Protocol-specific authentication
The custom provider SHALL send the API key in the selected shared protocol's standard form, obtained from that protocol's API-key header mapping: bearer authorization for both OpenAI protocols, the `x-api-key` header with an API version header for Anthropic, and the `x-goog-api-key` header for Gemini. The custom provider SHALL choose the protocol by registry lookup of its configured protocol id, and its protocol select options SHALL equal the shared protocol set (values and labels) in the same order. The Anthropic version header SHALL be sent with or without an API key.

#### Scenario: Anthropic headers
- **WHEN** a request is made for a custom connection with protocol `anthropic` and an API key
- **THEN** it carries `x-api-key` and `anthropic-version` headers and no bearer authorization

#### Scenario: Protocol options match the shared set
- **WHEN** the custom provider fields are inspected
- **THEN** the protocol select option values and labels equal the listed shared protocol ids and labels in order
