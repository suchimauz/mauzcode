# voice-provider-sdk Specification

## Purpose
Provide a self-contained live transcription SDK with pluggable providers, explicit routing, a single session entry point and a visible audio destination.

## Requirements

### Requirement: Independent provider registry
The Voice SDK SHALL load provider declarations from mounted modules and plugins, each with a unique kebab-case ID, label, processing destination, connection fields, transcription models and per-model capabilities. An invalid or duplicate declaration SHALL be rejected without affecting other providers. The registry SHALL NOT depend on the Models SDK or on any existing speech plugin.

#### Scenario: Mount another compatible provider
- **WHEN** a mounted plugin declares a valid voice provider and model
- **THEN** it is discoverable and selectable through the same settings and session flow as the built-in provider without a composer change.

#### Scenario: Duplicate provider ID
- **WHEN** two mounted sources declare the same voice provider ID
- **THEN** the later declaration is rejected with a diagnostic and the first remains usable.

### Requirement: Voice connections
The SDK SHALL store voice connections separately from model connections, keep secret fields in the secret store, return only secret-free projections and allow a provider-defined connection test that sends no user audio.

#### Scenario: Secret-free listing
- **WHEN** the settings UI lists voice connections
- **THEN** each secret field is reported only as present or absent.

### Requirement: Single session entry point
All live transcription SHALL go through one authenticated WebSocket endpoint that verifies origin, owner and chat editability, resolves the effective route once at start and relays audio to the selected provider on the server. The browser SHALL send mono PCM16 frames at the sample rate announced by the server and SHALL never receive vendor events or credentials.

#### Scenario: Start reports destination
- **WHEN** an authorized client starts a session for an editable chat
- **THEN** the server replies with the session ID, resolved route, destination label and required sample rate before any transcript event.

#### Scenario: Cross-origin or foreign chat
- **WHEN** a client from another origin or another owner tries to start, append to or cancel a session
- **THEN** the request is refused without disclosing audio, transcript or credential information.

### Requirement: Revision-safe transcript protocol
A session SHALL emit phrases with a stable ID, an order assigned only by the Voice SDK core in the sequence of audio commits (providers SHALL NOT assign order), a strictly increasing revision carrying the complete phrase text and a final marker emitted once. Finish SHALL complete only after every committed phrase is final or failed, or fail after a bounded timeout. Cancel SHALL drop all later events and release provider resources.

#### Scenario: Provider revises a hypothesis
- **WHEN** a provider reports two partial updates and then a final transcript for one phrase
- **THEN** the client receives three revisions of the same phrase, the last one final, independent of the provider's native format.

#### Scenario: Finals arrive out of order
- **WHEN** the final for a later phrase arrives before the final for an earlier phrase
- **THEN** both phrases keep their commit order.

#### Scenario: Late event after cancellation
- **WHEN** a provider event arrives after the session was cancelled
- **THEN** it is not delivered to any client.

### Requirement: Server-side segmentation
For models without provider turn detection, the Voice SDK core SHALL detect pauses in the incoming audio on the server and request a commit after a short silence, after a bounded run of continuous speech and on finish. Silence-only audio SHALL NOT be committed. The browser SHALL only stream audio.

#### Scenario: Pause between phrases
- **WHEN** a user says a phrase, stays silent for about half a second and says another phrase
- **THEN** core requests two commits and two ordered phrases are produced.

#### Scenario: Long monologue
- **WHEN** a user speaks continuously longer than the forced commit interval
- **THEN** core requests a commit without waiting for silence, placed at the quietest point of the last half second.

#### Scenario: Provider has its own turn detection
- **WHEN** the selected model declares provider-side turn detection
- **THEN** core sends no pause-based or forced commits, commits only on finish, and still assigns the order of reported phrases.

### Requirement: Session bounds
The endpoint SHALL bound frame size, buffered audio, session duration, idle time and finish time, allow one active session per owner and chat, and end a session that exceeds a bound with a visible error. Every bound, including the session duration, SHALL be enforced by the server without relying on the client.

#### Scenario: Maximum duration
- **WHEN** a session reaches five minutes
- **THEN** the server stops accepting audio even if the client keeps sending, finalizes pending phrases, delivers them and closes with `timeout`, and the draft is left unsent.

#### Scenario: Second tab starts dictation
- **WHEN** the same chat starts dictation in a second tab
- **THEN** the first session is cancelled with `superseded` and its tab shows that dictation moved elsewhere.

#### Scenario: Edit access lost mid-session
- **WHEN** the chat is archived or becomes read-only while a session is listening
- **THEN** the server cancels the provider stream and closes the session with `readOnly`, and no further phrase is delivered.

### Requirement: Session error codes
A session that ends abnormally SHALL report one code from a closed set (`unauthorized`, `readOnly`, `superseded`, `unconfigured`, `routeUnavailable`, `providerAuth`, `provider`, `timeout`, `backpressure`, `protocol`) with a user-facing message that contains no vendor payload or key material. A gap or repeat in the frame sequence numbers SHALL end the session with `protocol`.

#### Scenario: Sequence gap
- **WHEN** the client skips a frame sequence number
- **THEN** the session ends with `protocol` and the provider stream is cancelled.

### Requirement: Default and per-chat routing
Settings SHALL persist a default voice route. Each chat SHALL inherit it unless it has a saved override stored in the chat's own state (scratchpad key `voice.route`); clearing the override SHALL restore inheritance. A route failure SHALL NOT cause fallback to another route.

#### Scenario: Override persists independently
- **WHEN** the default uses one connection, one chat overrides it with another and the chat is reopened
- **THEN** that chat shows its override before capture, other chats show the default, and removing the override restores the default.

### Requirement: Audio and credential privacy
Provider credentials SHALL remain server-side. Audio SHALL be kept only in memory for an active session and never written to disk or logs. Transcripts SHALL NOT be logged or added to agent history. Provider-reported usage SHALL be counted in memory for the active session only and SHALL NOT be persisted in this version. Finishing transcription SHALL NOT publish a message.

#### Scenario: Finish without sending
- **WHEN** an authorized user finishes recognition and leaves the result in the editor
- **THEN** no API key reached the browser, no audio file exists and no agent transcript or queue entry was created.
