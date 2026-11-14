## ADDED Requirements

### Requirement: Cached protocol and reasoning metadata
The model cache SHALL keep, for each discovered model, a native shared protocol id when the provider reported one from the closed shared protocol set, and the reasoning metadata's supported levels, optional default, optional native wire values and optional thinking-disable flag when they are well-formed. Malformed values SHALL be dropped from the cached entry without dropping the model.

#### Scenario: Protocol kept
- **WHEN** discovery reports a model with protocol `openai-responses`
- **THEN** the cached entry and the model listing carry that protocol

#### Scenario: Unknown protocol dropped
- **WHEN** discovery reports a model with a protocol outside the shared set
- **THEN** the model is cached without a protocol

#### Scenario: Reasoning without a default
- **WHEN** discovery reports supported levels with wire values but no default
- **THEN** the cached reasoning keeps the levels and wire values and has no default
