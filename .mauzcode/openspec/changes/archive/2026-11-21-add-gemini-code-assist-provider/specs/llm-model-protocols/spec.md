# Spec Delta

## ADDED Requirements

### Requirement: Gemini thought signature capture
The `gemini` protocol SHALL return each streamed function call's `thoughtSignature` as the `thoughtSignature` of the matching tool call in the `StreamResult`. A function call without a signature SHALL return no signature field. The stored signature SHALL be sent back unchanged on that function call when the conversation continues on a `gemini` model. Other protocols SHALL ignore it.

#### Scenario: Signed function call
- **WHEN** a `gemini` stream returns a function call part with `thoughtSignature` `sig-1`
- **THEN** the returned tool call carries `thoughtSignature` `sig-1`

#### Scenario: Replay on the next turn
- **GIVEN** a stored assistant tool call with `thoughtSignature` `sig-1`
- **WHEN** the tool result is sent on a `gemini` model
- **THEN** the replayed function call part carries `thoughtSignature` `sig-1`

#### Scenario: Unsigned function call
- **WHEN** a `gemini` stream returns a function call part without a signature
- **THEN** the returned tool call has no `thoughtSignature` field

#### Scenario: Parallel calls with one signature
- **WHEN** a `gemini` stream returns two function call parts and only the first carries `sig-1`
- **THEN** the first tool call carries `sig-1` and the second has no `thoughtSignature` field
