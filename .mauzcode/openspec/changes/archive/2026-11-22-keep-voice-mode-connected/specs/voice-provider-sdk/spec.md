# Delta: Voice provider SDK

## MODIFIED Requirements

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

## ADDED Requirements

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

## MODIFIED Requirements

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
