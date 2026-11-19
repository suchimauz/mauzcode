# voice-openai-realtime-provider Specification

## Purpose
Provide the built-in OpenAI Realtime transcription provider for the Voice SDK.

## Requirements

### Requirement: Transcription-only Realtime session
The `openai-realtime` provider SHALL connect from the server to the Realtime endpoint with transcription intent and no model in the URL, authenticate with the connection's API key, send a transcription session update with mono PCM16 at 24 kHz and wait for confirmation before accepting audio. It SHALL NOT request responses, output audio, instructions or tools.

#### Scenario: Session setup
- **WHEN** a dictation session starts on an `openai-realtime` route
- **THEN** the provider sends one transcription session update with the selected model and options and reports ready only after the service confirms it.

#### Scenario: No conversational traffic
- **WHEN** a full dictation session runs against a fake Realtime server
- **THEN** the fake server receives only session update, audio append and commit messages.

### Requirement: Models and options
The provider SHALL offer `gpt-live-transcribe` as its only model in this version, and SHALL support optional languages, keywords, prompt and delay. It SHALL send `languages`, never `language`, and SHALL reject keywords containing `<`, `>` or line breaks before connecting.

#### Scenario: Invalid keyword
- **WHEN** a connection or chat option contains a keyword with a line break
- **THEN** saving or starting fails with a validation message and no network request is made.

### Requirement: Client-committed turns
For models without server turn detection the provider SHALL disable turn detection and commit the audio buffer whenever the Voice SDK core requests a commit. It SHALL send `languages` and `delay` only when configured.

#### Scenario: Two phrases with silence
- **WHEN** core requests a commit after the first phrase and the client then finishes after a second phrase
- **THEN** the provider commits twice and the session produces two ordered phrases.

### Requirement: Event normalization
The provider SHALL bind each committed item to the oldest unacknowledged core commit, using `previous_item_id` only as a consistency check (a mismatch is a sanitized `provider` error), and SHALL NOT perform its own segmentation. It SHALL map transcription deltas to revisions with the accumulated text, completed events to the final text and failed events to phrase failures. Service errors and disconnects SHALL become sanitized session errors.

#### Scenario: Delta then completion
- **WHEN** the service sends two deltas and a completed transcript for one item
- **THEN** the client receives two partial revisions and one final revision with the completed text.

#### Scenario: Invalid key
- **WHEN** the service rejects the API key
- **THEN** the session fails with an authorization error that contains no key material.

### Requirement: Connection test without audio
The connection test SHALL open a session, send the transcription update, wait for confirmation and close without sending audio.

#### Scenario: Test a valid connection
- **WHEN** the user tests a connection with a valid key
- **THEN** the result is available and no audio was transmitted.
