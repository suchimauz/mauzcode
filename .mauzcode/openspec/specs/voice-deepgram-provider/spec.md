# voice-deepgram-provider Specification

## Purpose
Provide the built-in Deepgram Nova-3 live transcription provider for the Voice SDK, streaming dictation audio from the MauzCode server to Deepgram with client-committed phrases.

## Requirements

### Requirement: Deepgram provider declaration
The Voice SDK SHALL register a built-in provider with ID `deepgram` that offers exactly one model, `nova-3`, with client turn detection, a single sample rate of 16000 Hz, language hints and keywords, and no prompt or delay options. Its disclosed destination SHALL be a cloud destination naming `api.deepgram.com`, or only the host and port of a configured Base URL.

#### Scenario: Provider appears in settings
- **WHEN** the owner opens Settings → Voice
- **THEN** Deepgram is offered next to OpenAI Realtime with fields for API key, Base URL, languages, keyterms, smart formatting and Model Improvement Program opt-out, and no composer change is required.

#### Scenario: Custom endpoint disclosure
- **WHEN** a connection uses the Base URL `https://api.eu.deepgram.com`
- **THEN** the destination shown in settings, in the chat route picker and in the session start is `Configured endpoint (api.eu.deepgram.com)`, with no other configuration value.

### Requirement: Connection configuration validation
The provider SHALL require an API key, accept a Base URL only as a credential-free HTTPS URL without a query or fragment (plain HTTP only on numeric loopback), accept languages only as comma-separated language tags, and reject keyterm lists with more than 100 terms or with a term that contains a line break or exceeds the bounded length. Invalid values SHALL be rejected when saving and when starting, before any network request.

#### Scenario: Plain HTTP endpoint
- **WHEN** the owner saves a Deepgram connection with Base URL `http://api.deepgram.com`
- **THEN** saving fails on the Base URL field with the `httpsEndpoint` reason and nothing is stored.

#### Scenario: Keyterm with a line break
- **WHEN** a connection or chat option contains a keyterm with a line break
- **THEN** saving or starting fails on the keyterms field with the `keywordList` reason and no network request is made.

#### Scenario: Too many keyterms
- **WHEN** a connection lists 101 keyterms
- **THEN** saving fails on the keyterms field with the `keywordList` reason.

### Requirement: Live stream setup
The provider SHALL open one WebSocket from the server to `<base>/v1/listen` authenticated with the header `Authorization: Token <API key>`, never with the key in the URL, and SHALL request `model=nova-3`, `encoding=linear16`, `sample_rate=16000`, `channels=1`, `interim_results=true` and `endpointing=false`. It SHALL report the session as ready only after the WebSocket upgrade succeeds.

#### Scenario: Default connection
- **WHEN** a dictation session starts on a Deepgram connection with only an API key
- **THEN** the fake server observes the token header and the query `model=nova-3&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&endpointing=false&smart_format=true&no_delay=true&language=multi`, without `mip_opt_out` or `keyterm`.

### Requirement: Optional stream parameters
The provider SHALL add `smart_format=true` together with `no_delay=true` unless smart formatting is turned off, `mip_opt_out=true` only when the Model Improvement Program opt-out is turned on, and one `keyterm` parameter per configured keyterm, in order.

#### Scenario: Smart formatting turned off
- **WHEN** the connection turns smart formatting off
- **THEN** the query contains neither `smart_format` nor `no_delay`.

#### Scenario: Opt-out and keyterms
- **WHEN** the connection turns on the Model Improvement Program opt-out and lists the keyterms `MauzCode, OpenSpec`
- **THEN** the query also contains `mip_opt_out=true` and the two `keyterm` values in order.

### Requirement: Language selection
The provider SHALL send `language=<tag>` when exactly one language is configured. When no language or several languages are configured, it SHALL send `language=multi` and, for several languages, one `language_hint` parameter per configured language in order. Chat-level languages SHALL replace connection-level languages.

#### Scenario: One language
- **WHEN** the effective languages are `ru`
- **THEN** the query contains `language=ru` and no `language_hint`.

#### Scenario: Several languages
- **WHEN** the effective languages are `ru, en`
- **THEN** the query contains `language=multi`, `language_hint=ru` and `language_hint=en`.

### Requirement: Audio framing
The provider SHALL forward audio as binary frames of whole PCM16 samples of about 50 ms (1600 bytes at 16 kHz), carrying a shorter remainder into the next append. Before each `Finalize` and before `CloseStream`, it SHALL send any non-empty remainder as a final shorter frame.

#### Scenario: Browser chunks of another size
- **WHEN** core appends 1000 bytes three times and then commits
- **THEN** the fake server receives one 1600-byte frame, then one 1400-byte frame, then `Finalize`.

### Requirement: Client-committed phrases
Every core commit with audio since the previous commit SHALL send exactly one `Finalize` control message after that audio; a commit without new audio SHALL settle as an empty final without sending `Finalize`. The provider SHALL attribute transcript results to pending commits in commit order and SHALL emit, for each commit, revisions with the complete phrase text so far (final segments plus the current interim hypothesis) and exactly one final with the joined final segments.

#### Scenario: Two phrases with silence
- **WHEN** core requests a commit after the first phrase and the client then finishes after a second phrase
- **THEN** the fake server receives two `Finalize` messages and the session produces two ordered phrases with their own text.

#### Scenario: Several final segments in one phrase
- **WHEN** the service returns two final results for one committed phrase, the second marked `from_finalize`
- **THEN** the phrase receives one final whose text joins both segments with a single space.

### Requirement: Phrase settlement triggers
A pending commit SHALL settle when the service answers its `Finalize` with a final result marked `from_finalize`, or when final results cover all of that commit's audio. If neither happens within a quiet period of 2 seconds after the `Finalize`, refreshed by every result for that commit, the provider SHALL settle the phrase with the text received so far, which can be empty. Commits SHALL settle in commit order.

#### Scenario: Finalize without an answer
- **WHEN** a commit covers only silence and the service sends no result for its `Finalize`
- **THEN** the phrase settles as an empty final after the quiet period and later phrases continue.

### Requirement: Keep-alive and close
While the session is open and no audio was sent for several seconds, the provider SHALL send a `KeepAlive` text message so the service does not close the stream after its idle limit. It SHALL never send an empty binary frame. On finish it SHALL settle all pending commits, send `CloseStream` and wait, within a bounded time, for the service to close. If the closing metadata reports an audio duration, the provider SHALL report it as usage. Cancel SHALL close the socket without waiting.

#### Scenario: Paused capture
- **WHEN** no audio reaches the provider for longer than the keep-alive interval
- **THEN** the fake server receives a `KeepAlive` text frame and the session stays open.

#### Scenario: Finish reports usage
- **WHEN** a session finishes and the service closes after `Metadata` with `duration` 12.5
- **THEN** the session completes and records 12.5 seconds of audio usage.

### Requirement: Connection test without audio
The connection test SHALL open the live WebSocket with the connection's settings, send `CloseStream` and wait, within a bounded time, for the socket to close normally. It SHALL send no audio and SHALL report a rejected key as `bad-key`, a timeout as `timeout` and any other failure as `unreachable`.

#### Scenario: Test a valid connection
- **WHEN** the owner tests a connection with a valid key
- **THEN** the result is available and the fake server received no binary frame.

#### Scenario: Test a rejected key
- **WHEN** the service refuses the WebSocket upgrade with HTTP 401
- **THEN** the result is unavailable with the reason `bad-key` and contains no key material.

### Requirement: Routed Deepgram upstream
The provider SHALL advertise the `direct`, `socks` and `ssh-tunnel` routes and SHALL open every upstream socket, for connection tests and live sessions, through the voice connection's routed WebSocket operation. Route selection SHALL NOT change the disclosed audio destination or the browser session protocol.

#### Scenario: Selected route breaks
- **WHEN** a saved SOCKS5 proxy or SSH tunnel is unavailable for the connection test or a live session
- **THEN** the operation fails through the existing sanitized Voice error contract without opening a direct socket.

### Requirement: Classified Deepgram failures
Terminal failures SHALL go through the sanitized Voice error contract and SHALL NOT include close reason text, service messages, request IDs or raw frames. A refused upgrade SHALL report `socketError` with detail `http_<status>`; HTTP 401 or 403 SHALL fail as `providerAuth` with cause `authentication`, and HTTP 429 with cause `rateLimit`. A socket closed by the service SHALL report `socketClosed` with the close code as detail.

#### Scenario: Rejected key at start
- **WHEN** the service refuses the upgrade with HTTP 401
- **THEN** opening fails with `providerAuth`, cause `authentication`, reason `socketError` and detail `http_401`, and no audio is sent.

#### Scenario: Stream closed for bad audio
- **WHEN** the service closes the socket with code 1008 during dictation
- **THEN** the session fails with the sanitized `provider` error, reason `socketClosed` and detail `1008`.

### Requirement: Unexpected service frames
A service `Error` message SHALL fail the session with reason `serviceError`, and a frame that is not a JSON object with a string `type` SHALL fail it with reason `malformedMessage`, both without detail text from the frame.

#### Scenario: Malformed frame
- **WHEN** the service sends a text frame that is not JSON
- **THEN** the session fails with the sanitized `provider` error and reason `malformedMessage`.
