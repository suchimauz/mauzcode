# Local Whisper audio transcription

## Purpose
Describe how the Whisper plugin uses installed models to transcribe local recordings, bound microphone work, preview spoken commands and identify a ready local server.

<!-- Last verified: d35de7c2, 2026-11-22 (source inspection) -->

## Requirements

### Requirement: Installed model listing
The model listing SHALL return the local model directory and matching models in descending order of rounded size in MiB.

#### Scenario: Discover a model
- **WHEN** the listing scans `~/.local/share/whisper-cpp` and finds `ggml-small.bin`
- **THEN** its entry has name `small` and `sizeMb` equal to its byte size divided by 1048576 and rounded to the nearest integer.

<!-- id: whisper.models.list -->
<!-- entities: model directory, model entry -->
<!-- enforced: plugins/whisper/src/whisper/models.ts default export -->

### Requirement: General recording transcription
General transcription SHALL prefer supplied audio bytes over a path, convert the selected input to 16 kHz mono PCM WAV and return the local recognizer's transcript and timings.

#### Scenario: Transcribe with defaults
- **WHEN** a recording is successfully transcribed without model or language overrides
- **THEN** the result identifies `large-v3-turbo` and `auto`, reports audio seconds and conversion and recognition milliseconds, and returns trimmed text with line breaks replaced by spaces.

#### Scenario: Missing model
- **WHEN** the requested model name is valid but its local model file does not exist
- **THEN** transcription fails with `model not found` and the model path before conversion.

<!-- id: whisper.transcribe.general -->
<!-- entities: recording, transcript -->
<!-- enforced: plugins/whisper/src/whisper/transcribe.ts default export -->

### Requirement: Dictation input limits
Bounded dictation SHALL require nonempty audio bytes of at most 8 MiB and reject decoded audio longer than 60 seconds before recognition.

#### Scenario: Invalid byte count
- **WHEN** the helper receives zero bytes or 8388609 bytes
- **THEN** it fails with `invalid_audio` before checking the model or allocating scratch files.

#### Scenario: Excess decoded duration
- **WHEN** decoding yields more than 1920000 bytes of 16 kHz mono signed 16-bit PCM
- **THEN** the helper fails with `audio_too_long` rather than recognizing the first minute.

<!-- id: whisper.transcribeDictation.audioLimits -->
<!-- entities: microphone audio, decoded PCM -->
<!-- enforced: plugins/whisper/src/whisper/transcribeDictation.ts default export -->
<!-- test: plugins/whisper/src/whisper/transcribeDictation.test.ts :: bounded transcription rejects empty and oversized input before touching files (byte count) -->

### Requirement: Fixed dictation recognition
Dictation SHALL use the local small model and Russian language regardless of caller overrides, with separate time limits for decoding and recognition.

#### Scenario: Successful dictation
- **WHEN** bounded recognition succeeds
- **THEN** the result identifies `small` and `ru` and returns normalized text, decoded audio seconds and conversion and recognition milliseconds without dispatching the text.

#### Scenario: Child timeout
- **WHEN** the 15-second decoder timer or 120-second recognizer timer fires
- **THEN** the helper sends the child `SIGKILL` and reports `transcription_timeout` after the child exits.

<!-- id: whisper.transcribeDictation.recognize -->
<!-- kind: invariant -->
<!-- entities: dictation, recognizer -->
<!-- enforced: plugins/whisper/src/whisper/transcribe.ts default export (dictation branch); plugins/whisper/src/whisper/transcribeDictation.ts default export, run -->

### Requirement: Dictation upload admission
The dictation endpoint SHALL require an authenticated user and valid CSRF token and admit only one supported audio upload at a time on its shared context.

#### Scenario: Untrusted request
- **WHEN** the request lacks a user or an authenticated request fails CSRF verification
- **THEN** the endpoint returns 401 or 403 respectively without starting transcription.

#### Scenario: Busy worker
- **WHEN** an otherwise admissible request arrives while another holds the dictation lock
- **THEN** it returns 429 `dictation_busy`; the holder releases the lock even after transcription fails.

<!-- id: whisper.routeDictate.admission -->
<!-- entities: upload, dictation lock -->
<!-- enforced: plugins/whisper/src/whisper/$route_dictate_POST.ts default export -->
<!-- test: plugins/whisper/src/whisper/dictate.test.ts :: anonymous open-mode requests and invalid CSRF are rejected before transcription -->
<!-- test: plugins/whisper/src/whisper/dictate.test.ts :: serial busy guard and release after failure; internal errors never leak -->

### Requirement: Spoken dispatch preview
Dispatch SHALL describe the proposed action without executing it and restrict an owner-scoped waiting preview to that owner's sessions.

#### Scenario: Ordinary phrase with focus
- **WHEN** a phrase matches no command and an agent has focus
- **THEN** dispatch returns a non-confident dictation proposal for `ui.sendToAgent` with the focused ID and trimmed original text.

#### Scenario: Owner asks who is waiting
- **WHEN** an owner-scoped request matches the waiting command
- **THEN** the preview lists only that owner's unread or running sessions without querying global waiting state.

<!-- id: whisper.dispatch.preview -->
<!-- entities: transcript, dispatch proposal, waiting preview -->
<!-- enforced: plugins/whisper/src/whisper/dispatch.ts default export, run -->
<!-- test: plugins/whisper/src/whisper/livePage.test.ts :: owner-scoped waiting preview never reads global waiting -->

### Requirement: Local server readiness
Readiness SHALL require an installed model and use an HTTP response below 500 at its model-derived loopback port as the readiness signal.

#### Scenario: Reuse a responding endpoint
- **WHEN** the initial probe receives status 404
- **THEN** readiness returns the model, loopback URL and port with `started: false` without spawning a server.

#### Scenario: Start a server
- **WHEN** the initial probe fails and a probe after spawning `whisper-server` succeeds
- **THEN** readiness returns `started: true`; if polling ends without success it throws an error identifying the local server log.

<!-- id: whisper.ensureServer.up -->
<!-- entities: model, loopback endpoint -->
<!-- enforced: plugins/whisper/src/whisper/ensureServer.ts default export, up -->

<!-- uncertainty: Readiness does not verify server identity or loaded model. No real decoder, recognizer, model directory or server was exercised. -->
<!-- deferred: plugins/whisper/src/whisper/$route_live_POST.ts and plugins/whisper/src/whisper/$route_dispatch_POST.ts transport details; realtime Voice SDK and chat voice UI are outside scope. -->
