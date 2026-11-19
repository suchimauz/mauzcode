# voice-error-journal Specification

## Purpose
Enable owners to investigate recent live dictation provider failures without retaining speech, transcripts or credentials.

## Requirements

### Requirement: Correlatable provider failures
The server SHALL record one diagnostic for each terminal live voice-provider failure and include its unique short opaque ID in the sanitized error shown in either dictation entry point only after successful persistence.

#### Scenario: Provider failure during dictation
- **WHEN** a live provider fails and the record is saved
- **THEN** the failure shown to the user includes the ID of that record alongside the existing sanitized message.

#### Scenario: Storage unavailable
- **WHEN** recording the failure fails
- **THEN** dictation still reports the original sanitized error without a misleading ID.

### Requirement: Safe diagnostic fields
The journal SHALL store only ID, timestamp, validated provider and model identifiers when known, normalized failure stage, a recognized safe cause or code, a failure reason from a closed set when known, and an optional strictly validated machine detail. It SHALL exclude audio, transcripts, credentials, free-form messages and raw provider responses.

#### Scenario: Unrecognized provider response
- **WHEN** the provider returns an unknown code and free text containing sensitive data
- **THEN** the cause is marked unknown and neither the free text nor any code that fails detail validation is retained or returned.

### Requirement: Owner-only lookup and seven-day retention
Only the owner SHALL be able to list recent records or look one up by ID in Settings → Voice → Errors. Records SHALL become inaccessible at seven days and be automatically purged without requiring the owner to open settings.

#### Scenario: Investigate a failure
- **WHEN** the owner searches for an unexpired ID
- **THEN** the matching technical fields are shown.

#### Scenario: Unauthorized lookup
- **WHEN** a non-owner accesses the list or requests a known ID directly
- **THEN** no diagnostic information is returned.

#### Scenario: Expired records
- **WHEN** a record reaches seven days of age
- **THEN** neither list nor lookup returns it and automatic cleanup deletes it from storage.

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
