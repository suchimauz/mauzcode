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
For models without server turn detection the provider SHALL disable turn detection and commit the audio buffer whenever the Voice SDK core requests a commit. It SHALL send `languages` and `delay` only when configured. It SHALL append only whole PCM16 samples, carrying an odd trailing byte into the next append. It SHALL send a commit only when at least 100 ms of audio (4800 bytes at 24 kHz) were appended since the previous commit. A shorter non-empty tail SHALL be padded with silence up to 100 ms before committing. A commit request with no audio since the previous commit SHALL send nothing upstream and SHALL settle that order as a final empty phrase.

#### Scenario: Two phrases with silence
- **WHEN** core requests a commit after the first phrase and the client then finishes after a second phrase
- **THEN** the provider commits twice and the session produces two ordered phrases.

#### Scenario: Short tail at finish
- **WHEN** core requests a commit after only 40 ms of audio since the previous commit
- **THEN** the provider appends 60 ms of silence before the commit and the service never reports `input_audio_buffer_commit_empty`.

#### Scenario: Empty commit request
- **WHEN** core requests a commit with no audio appended since the previous commit
- **THEN** no commit is sent upstream, the order receives a final empty phrase and the session stays open.

#### Scenario: Odd-length frame
- **WHEN** core appends a frame with an odd number of bytes
- **THEN** the upstream append contains only whole samples and the remaining byte is sent at the start of the next append.

### Requirement: Event normalization
The provider SHALL bind each `input_audio_buffer.committed` item to the oldest unacknowledged core commit (FIFO). It SHALL NOT use `previous_item_id` to accept or reject an item, and SHALL NOT perform its own segmentation. Transcription events (delta, completed, failed) for an item ID that has no commit acknowledgement yet SHALL be buffered, bounded per session by item count and total bytes, and replayed in arrival order once that item is bound. The provider SHALL map transcription deltas to revisions with the accumulated text, completed events to the final text and failed events to phrase failures. Disconnects and terminal service errors SHALL become sanitized session errors.

#### Scenario: Delta then completion
- **WHEN** the service sends two deltas and a completed transcript for one item
- **THEN** the client receives two partial revisions and one final revision with the completed text.

#### Scenario: Deltas before the commit acknowledgement
- **WHEN** the service streams deltas for an item before `input_audio_buffer.committed` names that item, then acknowledges the commit and completes it
- **THEN** the session stays open and the phrase for the pending order receives all buffered text, in order, followed by the final transcript.

#### Scenario: Predecessor is not a failure condition
- **WHEN** a commit acknowledgement carries a `previous_item_id` that is null or differs from the previously bound item
- **THEN** the item still binds to the oldest pending commit and the session continues.

#### Scenario: Silence commit
- **WHEN** a committed item completes with an empty transcript
- **THEN** its phrase is settled as a final empty phrase and the session continues.

#### Scenario: Invalid key
- **WHEN** the service rejects the API key
- **THEN** the session fails with an authorization error that contains no key material.

### Requirement: Connection test without audio
The connection test SHALL open a session, send the transcription update, wait for confirmation and close without sending audio.

#### Scenario: Test a valid connection
- **WHEN** the user tests a connection with a valid key
- **THEN** the result is available and no audio was transmitted.

### Requirement: Routed OpenAI Realtime upstream

OpenAI Realtime SHALL advertise `direct`, `socks` and `ssh-tunnel` and open every upstream socket through the resolved voice connection's WebSocket operation, for both connection tests and live transcription. Transport selection SHALL NOT change the browser `/voice/session` protocol or replace the disclosed audio destination with the proxy or SSH host.

#### Scenario: Test and dictate to the same endpoint
- **WHEN** a connection uses either the default endpoint or a custom Base URL and the user tests it and then dictates
- **THEN** both WSS handshakes use the selected route to that endpoint; the test waits for transcription configuration confirmation and closes without sending audio, while the live session streams on its routed socket.

#### Scenario: Selected route breaks
- **WHEN** a saved SOCKS5 proxy or SSH tunnel is unavailable for the connection test or live handshake
- **THEN** the operation fails through the existing sanitized Voice error contract, without opening a direct socket or forwarding audio elsewhere.

### Requirement: Classified terminal failures
The provider SHALL attach a failure reason to every terminal failure it reports and, when available, a safe detail: the WebSocket close code for disconnects, or the service error `code` (falling back to `type`) for service error events. It SHALL NOT attach close reason text, error messages or raw frames. `sequenceMismatch` SHALL be reported only for a commit acknowledgement with no pending commit, a duplicate item ID, or buffered pre-acknowledgement events that exceed their bound.

#### Scenario: Disconnect while streaming
- **WHEN** the routed socket closes with code 1011 during dictation
- **THEN** the session fails with the existing sanitized `provider` error and the reported reason is `socketClosed` with detail `1011`.

#### Scenario: Malformed frame
- **WHEN** the service sends a frame that is not a JSON object with a string `type`
- **THEN** the session fails with reason `malformedMessage` and no detail.

#### Scenario: Unexpected item order
- **WHEN** the service acknowledges a commit while no commit is pending, or repeats an already bound item ID
- **THEN** the session fails with reason `sequenceMismatch`.

### Requirement: Correlated recoverable service errors
The provider SHALL send every `session.update` and `input_audio_buffer.commit` with a unique `event_id`. An `error` event whose `error.event_id` names a pending commit SHALL fail only that phrase: the commit leaves the FIFO, the order receives `phraseFailed`, and the session stays open.

#### Scenario: Later phrases after a failed commit
- **WHEN** the first of two pending commits is rejected with a correlated error
- **THEN** the next acknowledged item binds to the second order.

#### Scenario: Commit rejected as empty
- **WHEN** the service answers a pending commit with `invalid_request_error` / `input_audio_buffer_commit_empty` carrying that commit's `event_id`
- **THEN** only that order receives `phraseFailed`, later commits still bind to their own orders, and dictation continues.

### Requirement: Terminal service errors
Authentication, permission, rate-limit, server and `session_expired` errors, errors before the session is accepted, and errors that name no pending commit SHALL stay terminal and keep the existing classification.

#### Scenario: Rate limit during streaming
- **WHEN** the service sends a `rate_limit_exceeded` error while streaming
- **THEN** the session fails with cause `rateLimit` and reason `serviceError`, as before.

#### Scenario: Setup rejected
- **WHEN** the service answers the initial `session.update` with an `invalid_request_error`
- **THEN** opening fails with the sanitized `provider` error and no audio is sent.
