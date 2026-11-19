## Purpose

Enable owners to investigate recent live dictation provider failures without retaining speech, transcripts or credentials.

## ADDED Requirements

### Requirement: Correlatable provider failures
The server SHALL record one diagnostic for each terminal live voice-provider failure and include its unique short opaque ID in the sanitized error shown in either dictation entry point only after successful persistence.

#### Scenario: Provider failure during dictation
- **WHEN** a live provider fails and the record is saved
- **THEN** the failure shown to the user includes the ID of that record alongside the existing sanitized message.

#### Scenario: Storage unavailable
- **WHEN** recording the failure fails
- **THEN** dictation still reports the original sanitized error without a misleading ID.

### Requirement: Safe diagnostic fields
The journal SHALL store only ID, timestamp, validated provider and model identifiers when known, normalized failure stage, and a recognized safe cause or code. It SHALL exclude audio, transcripts, credentials, free-form messages and raw provider responses.

#### Scenario: Unrecognized provider response
- **WHEN** the provider returns an unknown code and free text containing sensitive data
- **THEN** the cause is marked unknown and neither the unknown code nor the free text is retained or returned.

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
