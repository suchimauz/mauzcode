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
For models without provider turn detection, the Voice SDK core SHALL detect pauses on the server and request a commit after a short silence, after a bounded run of continuous speech, on finish or at an explicit dedicated draft boundary. Silence-only audio SHALL NOT be committed. The browser SHALL stream audio and SHALL NOT choose phrase boundaries based on speech or silence.

#### Scenario: Pause between phrases
- **WHEN** a user says a phrase, stays silent for about half a second and says another phrase
- **THEN** core requests two commits and two ordered phrases are produced.

#### Scenario: Long monologue
- **WHEN** a user speaks continuously longer than the forced commit interval
- **THEN** core requests a commit without waiting for silence, placed at the quietest point of the last half second.

#### Scenario: Provider has its own turn detection
- **WHEN** the selected model declares provider-side turn detection
- **THEN** core sends no pause-based or forced-interval commits and assigns the order of reported phrases. At an explicit draft boundary or finish, it settles only speech not already covered by an upstream boundary, without duplicating a turn or committing silence.

### Requirement: Session bounds
The endpoint SHALL enforce frame size, buffered audio, idle and finish bounds on the server and report violations visibly. Dedicated voice mode SHALL have no maximum wall-clock duration; inline dictation, including legacy starts that omit the mode, SHALL retain its server-enforced five-minute limit. The server SHALL allow at most one active session per owner and chat and at most one dedicated session per owner.

#### Scenario: Maximum duration
- **WHEN** a dedicated session receives valid sequenced audio beyond five minutes, including a prolonged interval of valid digital silence while muted
- **THEN** session age causes no finish, timeout or replacement; subsequent speech is accepted on the same socket, session ID, route and provider stream.
- **WHEN** an inline or legacy session reaches five minutes
- **THEN** the server stops accepting audio, finalizes and delivers pending phrases, and closes with `timeout` even if frames keep arriving. Nothing is sent to the agent.

#### Scenario: Second tab starts dictation
- **WHEN** the same owner starts dictation for the same editable chat in a second tab
- **THEN** the first session is cancelled with `superseded` and its tab shows that dictation moved elsewhere.

#### Scenario: Edit access lost mid-session
- **WHEN** the owning chat is archived or becomes read-only while listening or muted, even if the user is viewing another chat
- **THEN** the server cancels the provider stream and closes the session with `readOnly`; no further phrase is delivered. Loss of authentication or ownership also fails closed.

#### Scenario: Idle is not age
- **WHEN** a ready dedicated connection receives no valid audio frames for the existing 30-second idle interval
- **THEN** it ends with a visible timeout, even if its socket is still open; valid generated silence keeps a healthy muted connection live, whereas malformed or out-of-sequence frames do not.

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

### Requirement: Per-connection transport selection

Providers MAY declare a nonempty list of distinct transport kinds. The SDK SHALL expose those kinds in provider metadata, defaulting to direct-only. Each connection SHALL select one supported transport: `{kind: "direct"}`, `{kind: "socks", proxyId}` or `{kind: "ssh-tunnel", instance}`. Non-direct selections SHALL reference saved infrastructure, never inline credentials.

#### Scenario: Upgrade with existing providers and connections
- **WHEN** a provider has no transport declaration and its existing connection has no saved transport
- **THEN** discovery reports direct-only and that connection continues to use direct without user intervention.

#### Scenario: Select a saved route in settings
- **WHEN** the user creates or edits a connection in Voice settings
- **THEN** only supported transport kinds are offered, with saved references from the matching registry for non-direct kinds; after saving and reopening, the same selection is shown without credentials and unrelated edits preserve it.

#### Scenario: Invalid or stale selection
- **WHEN** an API client selects an unsupported kind, supplies inline credentials or selects an unknown reference
- **THEN** the write fails without changing the existing connection or echoing credentials.
- **WHEN** a previously saved reference disappears
- **THEN** settings identify the unavailable selection and routed operations fail without changing it or contacting the destination directly.

### Requirement: Connection-bound provider networking

The server SDK SHALL supply connection-bound HTTP and WebSocket operations to `listModels`, `test` and `open`. Providers advertising non-direct transport SHALL use these operations for upstream traffic. Non-direct connections SHALL use the selected saved SOCKS5 proxy or SSH tunnel for the whole exchange, require HTTPS/WSS with destination hostname and certificate verification, reject redirects and never fall back to direct. Failures SHALL NOT expose secrets, audio or upstream payloads.

#### Scenario: Third-party provider uses the selected path
- **WHEN** a provider discovers models via HTTP and opens a WSS check or transcription stream
- **THEN** each exchange, including the upgrade and subsequent frames, travels over the configured path, with no independent destination dial for a proxied connection.

#### Scenario: Route or handshake fails
- **WHEN** proxy negotiation, tunnel acquisition, TLS validation or a redirected request or upgrade fails
- **THEN** the operation reports a safe failure without following a redirect, disabling TLS verification or retrying directly.

#### Scenario: Resource ownership ends
- **WHEN** an operation completes, fails, times out or is cancelled during setup or streaming
- **THEN** the SDK closes its stream and releases its tunnel lease exactly once, including resources acquired after cancellation, without interrupting other leases.

### Requirement: Authorized voice-mode takeover
An accepted dedicated start SHALL replace the same owner's previous dedicated session, even in another chat or tab, before the new session can accept audio. The new session SHALL resolve the new chat's own route. Visits, rejected access checks, other owners and inline starts in a different chat SHALL NOT claim a dedicated session. Superseded sessions SHALL NOT accept audio, deliver later results or release the winner's claim.

#### Scenario: A second chat explicitly starts voice mode
- **WHEN** one owner has a muted dedicated session in A and an authorized dedicated start is accepted in B
- **THEN** A receives `superseded`, its provider session is cancelled and B alone becomes ready for dedicated audio, using B's destination. No audio or transcript is transferred.

#### Scenario: Overlapping starts or a failed replacement
- **WHEN** two valid dedicated starts for one owner overlap and the older setup finishes last
- **THEN** only the newer accepted start can become or remain live; late cleanup of the older one cannot tear it down.
- **WHEN** the new start fails after replacing A
- **THEN** the new claim is released and A is not silently restarted. A start refused before it is authorized cannot evict A.

### Requirement: Settle a draft without closing voice mode
On an explicit send from dedicated voice mode the relay SHALL provide a bounded boundary for the current draft: await all pre-boundary audio and all recognition attributable to it, then acknowledge success without closing the stream. No post-boundary speech SHALL enter that draft, and no event from that draft SHALL affect the next. A failed phrase, terminal error or expiry of the finalization deadline SHALL NOT acknowledge a successful boundary.

#### Scenario: Pending words and an empty boundary
- **WHEN** an explicit boundary follows a short last phrase and earlier finals arrive out of order
- **THEN** the final words are delivered once in phrase order before the success acknowledgement; the same dedicated session can accept the next draft after explicit unmute.
- **WHEN** the stream contains no uncommitted speech and all earlier phrases are settled
- **THEN** the boundary completes without an invented phrase or an empty upstream commit.

For provider-detected turns, the adapter SHALL NOT infer from a missing turn notification that speech remains uncommitted. If coverage of the tail cannot be established by the deadline, the boundary SHALL fail without a speculative commit or success acknowledgement.

#### Scenario: Provider closed a turn but its notification is in flight
- **WHEN** the provider has closed the last spoken turn before `settle`, but its boundary notification and final arrive only after `settle` and before the deadline
- **THEN** the relay issues no additional commit, delivers the final words once and only then acknowledges settlement.

#### Scenario: Provider fails or does not settle
- **WHEN** the provider closes during the boundary, or fails to settle pending audio before the deadline
- **THEN** the boundary fails visibly within the bound, a terminal session is released, and no partial draft is acknowledged as ready to send.
