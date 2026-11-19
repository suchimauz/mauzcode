# Spec Delta

## ADDED Requirements

### Requirement: Classified terminal failures
The provider SHALL attach a failure reason to every terminal failure it reports and, when available, a safe detail: the WebSocket close code for disconnects, or the service error `code` (falling back to `type`) for service error events. It SHALL NOT attach close reason text, error messages or raw frames.

#### Scenario: Disconnect while streaming
- **WHEN** the routed socket closes with code 1011 during dictation
- **THEN** the session fails with the existing sanitized `provider` error and the reported reason is `socketClosed` with detail `1011`.

#### Scenario: Malformed frame
- **WHEN** the service sends a frame that is not a JSON object with a string `type`
- **THEN** the session fails with reason `malformedMessage` and no detail.

#### Scenario: Unexpected item order
- **WHEN** a committed item's predecessor does not match the previous item
- **THEN** the session fails with reason `sequenceMismatch`.
