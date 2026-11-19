# Spec Delta

## MODIFIED Requirements

### Requirement: Safe diagnostic fields
The journal SHALL store only ID, timestamp, validated provider and model identifiers when known, normalized failure stage, a recognized safe cause or code, a failure reason from a closed set when known, and an optional strictly validated machine detail. It SHALL exclude audio, transcripts, credentials, free-form messages and raw provider responses.

#### Scenario: Unrecognized provider response
- **WHEN** the provider returns an unknown code and free text containing sensitive data
- **THEN** the cause is marked unknown and neither the free text nor any code that fails detail validation is retained or returned.

## ADDED Requirements

### Requirement: Failure reason and detail
Each record SHALL carry a reason naming what ended the session (`socketClosed`, `socketError`, `serviceError`, `malformedMessage`, `sequenceMismatch`, `sendFailed`, `setupTimeout`, `finishTimeout`, `other`); an unrecognized reason SHALL be stored as `other`. The detail SHALL be either a WebSocket close code (integer 1000–4999) or a service error identifier of at most 64 characters matching `^[a-z][a-z0-9_.]*$`; any other value SHALL be stored as empty.

#### Scenario: Upstream closes during dictation
- **WHEN** the provider socket closes with code 1006 while streaming
- **THEN** the record shows stage `streaming`, reason `socketClosed` and detail `1006`, and no close reason text.

#### Scenario: Service error event
- **WHEN** the service sends an error event with code `session_expired` and a free-text message
- **THEN** the record shows reason `serviceError` and detail `session_expired`, and the message is not stored.

#### Scenario: Unsafe detail
- **WHEN** a provider supplies a detail containing spaces, uppercase text, a URL or more than 64 characters
- **THEN** the record is saved with an empty detail.

### Requirement: Reason and detail in Settings
Settings → Voice → Errors SHALL show the reason and detail of each record next to its stage and cause, and SHALL show older records without these fields as unknown.

#### Scenario: Owner views a detailed record
- **WHEN** the owner opens Errors and a record has reason `socketClosed` and detail `1006`
- **THEN** both values are displayed for that record.
