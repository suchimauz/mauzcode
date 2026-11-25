# Voice providers (live dictation SDK)

The Voice SDK (`src/voice`, runtime namespace `ctx.fns.voice`) turns speech into text for chat
drafts. It has its own provider declarations, its own connections table and its own live session
protocol. It is **not** the Models SDK and it is **not** the Whisper plugin:

- Models (`docs/models-providers.md`) routes chat and inference requests. A Models connection and a
  voice connection are stored separately, even when both hold the same OpenAI key, and their routes
  are not interchangeable.
- The `whisper` plugin (`whisper.transcribe`, `/whisper`) transcribes an audio file or uploaded
  bytes locally with whisper.cpp. The Voice SDK does not import, call or adapt it.

Two built-in providers ship today: **`openai-realtime`**, which streams audio from the MauzCode
server to the OpenAI Realtime transcription service, and **`deepgram`**, which streams it to
Deepgram Nova-3 live transcription. The rest of this page covers using them and declaring a
different one.

## Implementation status

Available now:

- the provider registry, `$voiceProvider_<id>.ts` declarations and reload;
- `voice_connections` storage with secrets in the encrypted secret store, CRUD, secret-free views
  and a connection test;
- route parsing, resolution, the `voice.defaultRoute` setting and the per-chat override;
- the session core on the server (phrase identity, commit order, revisions, finish/cancel,
  generations, deadlines, energy-based voice-activity segmentation);
- one authenticated WebSocket endpoint, `src/$ws_voice_session.ts` → `/voice/session`, that relays
  audio and normalized transcript events;
- the `openai-realtime` adapter, with unit tests and integration tests against a fake Realtime
  server;
- the `deepgram` adapter (Nova-3, `/v1/listen`), with unit tests and integration tests against a
  fake Deepgram server (see [Set up Deepgram](#set-up-deepgram));
- an owner-only **Settings → Voice** tab (`/voice/api`, `src/voice/http/api.ts`) to add, edit, test
  and remove voice connections (the key is entered in a write-only password field and never sent
  back), and to choose or clear the default route;
- a per-chat voice route selector in the composer footer of open editable chats, right after the
  context indicator: it states where the audio would be processed before anything is activated,
  lets the owner pick a route for this chat or return to the default, reports an unavailable
  selection without falling back, and links to the Voice tab when nothing is configured. The
  selector itself never requests the microphone or opens `/voice/session`;
- browser capture (`frontend/src/hooks/useVoiceCapture.ts`): secure-context and AudioWorklet
  checks, microphone → AudioWorklet → mono PCM16 frames over one `/voice/session` socket per
  generation, connected mute/unmute, and release on lost access or connection;
- two entry points next to the route selector: **inline voice input** at the caret, and **voice
  mode**, a panel bound to the chat that opened it. Leaving the chat stops inline dictation but
  mutes a connected dedicated panel (see [Dictate in a chat](#dictate-in-a-chat));
- explicit send from either mode waits for recognition, then uses ordinary send/queue with the
  draft and attachments. Unlike inline dictation, a dedicated stream stays connected and muted
  after send. Silence, mute, navigation and stop do not submit a message.
- per-connection **network routes**: a voice connection can reach its recognizer directly, through a
  saved SOCKS5 proxy or through a pinned SSH tunnel, for model discovery, the connection check and
  live dictation alike (see [Network route](#network-route)).

### Public facade and internal namespaces

The public surface is a minimal facade of root procedures: `voice.providers`, `voice.list`,
`voice.get`, `voice.create`, `voice.update`, `voice.remove`, `voice.test`, `voice.resolveRoute` and
`voice.effectiveRoute`. Everything else lives in an implementation namespace and is called by full
name — `voice.connections.*` (CRUD, resolution, the connection check, schema validation),
`voice.route.*` (parsing, resolution, the per-chat override), `voice.session.*` (the normalized
session core and its segmentation) and `voice.transport.*` (route validation and the connection-bound
HTTP and WebSocket clients providers receive on `conn`). `src/$ws_voice_session.ts` is the single transport into the
session core; an ordinary consumer should not open a session core directly.

## How a dictation session runs

```
browser  ──/voice/session (WebSocket)──▶  MauzCode server  ──wss──▶  OpenAI Realtime
         mono PCM16 LE 24 kHz             session core, VAD,           ?intent=transcription
         + 4-byte sequence header         provider adapter
```

- The browser sends no credentials and receives no vendor events. The API key is read on the server
  and only the server opens the vendor socket.
- Start once with `{ type: "start", agentId, generation, mode }`. Use `mode: "panel"` for dedicated
  voice mode or `"inline"` for ordinary dictation. Omission means inline; an unknown mode is a
  protocol error. `ready` identifies the session, route, destination and sample rate. Use the
  persistent lifecycle **only** when `ready.mode === "panel"` and `ready.settle === true`.
  A client on an older relay uses finite dictation and terminal `finish`; it never sends `settle`.
- Audio frames contain 20–100 ms of mono PCM16 LE at the negotiated rate, prefixed with a
  four-byte, zero-based little-endian sequence number. The relay forwards `phrase` (`id`, `order`,
  `revision`, complete `text`, `final`) and recoverable `phraseFailed` events after `ready`.
- On explicit Send in dedicated mode, the client first waits for the audio thread to acknowledge
  the mute cut and drain pre-cut audio. It then sends `{ type: "settle", id }` on the same socket
  (`id` starts at 1 and increases per boundary). The relay serializes the boundary with appends
  and delivers its final phrase events **before** `{ type: "settled", id, ok, throughOrder }`.
  `throughOrder` is the last covered phrase order, inclusive, or `-1` for no phrases. A repeated
  request cannot create another boundary. Only a matching successful response permits ordinary
  submission; neither it nor a recoverable phrase failure closes a healthy stream. Terminal
  `finish` drains and reports `completed`; `cancel` discards the run without sending a message.
- The endpoint requires the owner session cookie, an exact origin match, the `owner` role and an
  editable chat owned by that user. There is one run per (owner, chat) and at most one dedicated
  run per owner across chats and tabs. An authorized start supersedes conflicting runs before it
  accepts audio, using the **new** chat’s route. Visiting a chat, a refused start, another owner,
  or inline dictation in a different chat cannot take over. Loss of edit access also ends a
  parked run. If provider setup fails after the relay took the dedicated lease, its terminal
  error includes `claimed: true`. The client discards older pending starts rather than silently
  reviving them. A refusal before the claim leaves the previous session alone.
- **Lifetime is not liveness.** Only inline/legacy sessions have a five-minute limit from `ready`.
  Both modes time out after 30 seconds without a valid audio frame. The relay also limits control
  messages to 1 KiB, frames (including header) to 16 KiB and buffered audio and outgoing data to
  1 MiB; at most 1,024 replies may wait for an access check. The relay rechecks access on
  invalidation and every second, failing closed if a check takes over 5 s. Opening times out
  after 30 s, and draft settlement and terminal finish are bounded (10 s on the server).
  A stalled client, broken network or provider-imposed limit can end a dedicated run.
  Errors carry sanitized codes: `unauthorized`, `readOnly`, `superseded`, `unconfigured`,
  `routeUnavailable`, `providerAuth`, `provider`, `timeout`, `backpressure` or `protocol`.

In the dedicated panel, mute disables the microphone track but keeps the audio graph, browser socket,
provider stream and draft generation. The worklet drains the known pre-mute tail and, on the audio
render clock, generates **zero-valued PCM frames**, even with no input channel. These are ordinary
sequenced frames, not a keepalive message: the relay stays active and can finish recognizing speech
from before mute. Muted microphone sound is neither transmitted nor saved for unmute. Returning
from another chat does not unmute. Explicit unmute resumes fresh input on the same sequence;
valid digital silence renews the idle guard, but cannot extend an inline/legacy age limit.

`useVoiceCapture` opens a new socket and generation only on an explicit start after a run has ended.
No terminal event (including loss of access, timeout or supersession) automatically restarts the mic.

## Dictate in a chat

Dictation needs a configured route (Settings → Voice) and a page opened over HTTPS or on
`localhost`; otherwise the controls stay visible but disabled and say what is missing. Nothing
requests the microphone until you activate a control, and the footer tells you where the audio would
be processed before you do. Neither control is shown in a new-session or read-only composer.

**Inline voice input** (microphone icon after the context indicator). Click once to start dictating
at the caret of the message field; click again to stop. The last phrase is finalized, the text stays
editable and nothing is sent. Interim words are replaced in place as recognition improves; once you
edit a recognized word yourself, later corrections of that phrase are ignored. Leaving the chat
stops inline capture; explicitly sending from inline capture finalizes and closes the run.

**Voice mode** (waveform icon). The panel shows your draft and elapsed connection time and starts
recording at the caret. Opening another chat immediately mutes the microphone, even during setup.
The other chat has its own editor. Return to the original chat to see the same panel, words and
attachments, still muted; only **Unmute** resumes listening. A late result from before the switch
can revise only its original draft. Explicitly starting voice mode elsewhere replaces the previous
session; it does not transfer text or files. With focus on the frame or transcript:

| Key | Button | Effect |
| --- | --- | --- |
| Space | Mute / Unmute microphone | Toggles the microphone on the same connection. While muted, the waveform stops and elapsed time continues; earlier speech can still finalize in place. |
| Backspace | Delete last word (click or tap) | Removes the last unedited dictated word in draft order, including its trailing punctuation. Late revisions cannot restore it. |
| Ctrl+Backspace | Hold the same button for 600 ms | Clears all unedited dictation in this draft, from inline input and earlier panel visits too. Typed text, manually corrected phrases and attachments survive both delete actions. |
| Enter | Send | From listening or mute, mutes the mic, settles the final words and submits text and attachments once through ordinary send/queue. Acknowledgement clears that draft; the healthy session stays connected and muted, ready for explicit unmute. |
| Escape | Exit | Stops recording and returns focus to the message field with the visible text, without sending. Clicking the voice mode icon again does the same. |

For example, if you typed `Note:` then dictated `хорошая погода сегодня!`, a tap removes `сегодня!`,
leaving `Note: хорошая погода`. A hold clears the rest of the dictation, leaving `Note:`. Neither
operation changes whether the mic is muted. Desktop tooltips list the shortcuts; touch help describes
tap and hold instead. A held button does not delete another word on release.

One browser deadline covers both the microphone cut and recognition. If either fails, nothing
is submitted; the text and attachments stay for review. A late acknowledgement cannot authorize
a send. If the provider reports a failed phrase, exit voice mode to review the text and send it
from the ordinary editor; the failed draft cannot authorize submission. If recognition succeeds
but ordinary submission is uncertain, an explicit retry of the
unchanged draft reuses its request key and endpoint, including attachments while the page stays
open. An actual disconnect closes the panel; its reason (and error ID, if available) appears in
that chat’s input, not whichever chat happens to be on screen. There is no automatic reconnect.

The shortcuts work only while focus is on the panel itself or its message text, never for typing
elsewhere. A focused button inside the panel keeps its own keys — Space and Enter press it and Escape
does nothing there; use the Exit button to leave. Text fields keep all their keys. Screen readers hear
state changes, not ticking time or dictated words; the transcript and elapsed time can be read on
demand. Exit or leaving the page releases the microphone. Neither sends the draft.

### Look up a dictation error

If inline dictation or voice mode shows an **ID** beside a provider failure, copy it. As the instance owner, open **Settings → Voice → Errors**. The recent list shows the newest failures first. Paste the exact ID into **Error ID** and select **Look up** to see when it happened, the provider and model (when known), the failure stage, a safe cause, the **reason** that ended the session and a **detail**. `unknown` means the cause could not be safely classified; the reason still tells what happened: `socketClosed` (the provider connection closed — detail is the WebSocket close code, e.g. `1006` for an abrupt drop of the network, proxy or SSH tunnel), `socketError` (detail `http_NNN` for a refused upgrade), `serviceError` (the provider reported an error — detail is its error code such as `session_expired`), `malformedMessage`, `sequenceMismatch`, `sendFailed`, `setupTimeout`, `finishTimeout` or `other`. Older records show the reason as `unknown`. A missing or expired ID shows **No matching error**; use **Show recent** to return to the list.

Records expire after seven days and are automatically removed. The journal excludes audio, transcripts, credentials, raw provider responses and free-form messages. Browser and microphone errors are not journaled, and past incidents are not backfilled. If saving fails, dictation still shows the original error without an ID.

## Set up OpenAI Realtime

### 1. Create an API key at OpenAI

Create a project API key in the OpenAI platform for the organization and project that may use the
Realtime transcription endpoint. A key that already works for Models or for `codex login` is not
automatically reused: a voice connection is a separate record with its own secret.

### 2. Put the key into the standard secret storage

Two rules apply to every credential in MauzCode: never type it into a chat message or a shell
command that keeps history, and never paste it into a file in the repository. In particular the key
must **never be passed as a tool argument** — a tool call and its result are part of the transcript.

You also do not create a `secret://` reference by hand. That reference is what the secret store
returns *after* a protected input form accepted the value, so the person typing the key never hands
it to the caller at all.

**Recommended: Settings → Voice.** The owner opens Settings → Voice (or `/?settings=voice`), picks
the provider, enters an account name and pastes the key into the **API key** password field, then
chooses **Add connection**. The form posts the key once over the same-origin, CSRF-protected
`/voice/api` request; the server stores it encrypted and answers with a secret-free view, and the
field is emptied. Editing a connection never shows the stored key: an empty field keeps it, a new
value replaces it. **Test** runs the provider's connection check without audio. This path is for a
person at the browser; an agent must not ask for the key in chat.

**Alternative for operators: from a runtime session.** The key then reaches a voice connection in
two steps.

**Step 1 — collect the key in a protected form.** The owner answers a `secret` input (the `secret`
chat input kind, or `ctx.fns.secureInput.prompt({ title: "OpenAI API key", saveAs: "secret://voice/openai-key" })`). The value goes
from the browser form straight into encrypted storage; the caller receives only
`secret://voice/openai-key`.

**Step 2 — create the connection where the value is never visible.** The reference is resolved inside
the server process, so the plaintext is neither an argument nor a result. Either of these keeps it
that way:

- a local REPL session on a **non-production** instance — the REPL endpoint is refused when
  `NODE_ENV=production`:

```ts
// `bun script/repl.ts` on the server itself. The code runs as an async function body, so
// `return` decides what the REPL prints — never return or print the key itself.
const apiKey = await ctx.fns.secrets.get({ ref: "secret://voice/openai-key" });
if (!apiKey) throw new Error("The protected input did not supply an API key.");
const connection = await ctx.fns.voice.create({
    provider: "openai-realtime",
    accountName: "work",
    config: { baseUrl: "https://api.openai.com/v1" },
    secrets: { apiKey },
});
return { id: connection.id, route: `openai-realtime/${connection.accountName}:gpt-live-transcribe`, secrets: connection.secrets };
```

- or a small project-local procedure that does the same and returns only that object; call it with
  no secret argument at all.

The returned view reports secret fields as present or absent (`{ apiKey: true }`) and never contains
the value — that is also how `voice.get` and `voice.list` behave.

Storage detail, for operators rather than for configuration: the value is encrypted in the local
secret store under `secret://voice/<connectionId>.<field>`, and the row records only which secret
fields are present. Treat that layout as an implementation detail; `voice.create`, `voice.update`,
`voice.remove` and `voice.test` are the interface, and `voice.remove` deletes the connection's
secrets with it. The separately collected `secret://voice/openai-key` is not removed with the
connection. The `voice` namespace is classified for the Creator preset, so a Standard agent
cannot read, change, test or delete these connections.

### 3. Choose the model and the route

The adapter offers exactly one model in this version: `gpt-live-transcribe`. A voice route is
`<provider>/<accountName>:<modelId>`, so with the connection above it is:

```text
openai-realtime/work:gpt-live-transcribe
```

Select it globally in Settings → Voice under **Default route** (the list shows each stored
connection's models with where that connection sends the audio — for this adapter `OpenAI Realtime
(api.openai.com)` with the default Base URL, or `Configured endpoint (host[:port])` with another one; "Not configured" clears it). The same
declared setting `voice.defaultRoute` is also listed by the generic owner-only **Declared settings**
page (`/settings/declared`) and can be stored by `settings.set` or the instance file
`~/.mauzcode/settings/$settings_voice.json` as `{ "defaultRoute": "…" }`; a value fixed by that file
is shown read-only in the Voice tab. The Voice tab and the chat selector accept only a route that
resolves at the moment of saving.

A single chat can override it from the voice route button in its composer footer (after the context
indicator): choose a route for this chat or **По умолчанию** to inherit the default again. The button's
accessible name and the menu state the model, whether it is the chat's own choice or the default,
and where the audio would go. Programmatically the same is `voice.route.setOverride({ agentId, route })`;
`voice.route.clearOverride({ agentId })` restores inheritance. `voice.effectiveRoute({ agentId })`
reports the chosen route and its source. Resolution happens once at session start and never falls
back to another route: a broken selection fails with `routeUnavailable` instead of silently using a
different model.

### 4. Options

Per connection (`config` of `voice.create`/`voice.update`), fields declared by the adapter:

| Field | Type | Meaning |
| --- | --- | --- |
| `apiKey` | secret, required | Bearer key for the Realtime endpoint. Never returned. |
| `baseUrl` | url, default `https://api.openai.com/v1` | Credential-free HTTPS base URL, without query or fragment. Plain HTTP is accepted only on numeric loopback for tests. The adapter derives `wss://…/realtime?intent=transcription`. |
| `organization` | text | Sent as `OpenAI-Organization`; a single identifier without whitespace. |
| `project` | text | Sent as `OpenAI-Project`; a single identifier without whitespace. |
| `languages` | text | Comma-separated language hints, for example `en, ru, zh-Hans`. Two- or three-letter codes, or `zh-*` tags. |
| `keywords` | text | Comma-separated terms on one line, no `<`, `>`, CR or LF. Biases recognition toward domain words. |
| `prompt` | text | Free-text context or spelling hints, up to 4000 characters. |
| `delay` | select | `minimal`, `low`, `medium`, `high` or `xhigh`; trades latency for accuracy. |

Per-session recognition options (`options` of `voice.session.open`, later the per-chat settings) are
filtered by the model's declared capabilities: `languages`, `keywords`, `prompt`, `delay`. Values
absent from both the connection and the session are not sent at all, so the vendor default applies.
`languages` is always sent as a list — the service has no single-`language` field — and invalid
keywords or language codes are rejected before any network request.

The adapter always opens a transcription-only session: `session.update` with `type:
"transcription"`, PCM 24 kHz input, `noise_reduction: near_field`, `turn_detection: null` and the
model plus configured options. It never requests a response, output audio, instructions or tools,
and it reports ready only after the service confirms the update.

### Network route

Each voice connection selects one network route under **Network** in its Settings → Voice form:
**Direct**, **SOCKS5 proxy** (a proxy saved in the SOCKS5 tab) or **SSH tunnel** (an SSH instance with
a verified host key). The connection stores only the reference — `{ kind: "socks", proxyId }` or
`{ kind: "ssh-tunnel", instance }` — never a proxy host, password or key. Both the no-audio test and
every live session open their WSS handshake over that route, to the default endpoint or a custom
Base URL alike: TLS is verified for the endpoint's host, redirects are refused, and a broken proxy or
tunnel fails the check or the session with the usual sanitized error instead of connecting directly.
The disclosed audio destination stays the recognizer endpoint, not the proxy or SSH host, and the
browser `/voice/session` protocol is unchanged. Connections created before routes existed keep using
**Direct**. If a saved proxy or instance is removed later, the connection keeps its selection, shows
it as unavailable and fails until another one is chosen.

### 5. Test the connection without audio

```ts
const result = await ctx.fns.voice.test({ id: connection.id });
// { status: "available", reason: "voice-ok", message: "Voice connection is ready", checkedAt: … }
```

The provider check opens the Realtime socket, sends the transcription session update, waits for
confirmation and closes. **No audio is transmitted.** The result is local and fixed: one sentence per
status and a reason from a closed set (`voice-ok`, `bad-key`, `timeout`, `unreachable`, …). A wrong
or revoked key shows up as `status: "unavailable"` with `reason: "bad-key"`; the check never echoes
the key, the vendor error text or the URL.

### 6. Cost

`gpt-live-transcribe` is metered **per audio minute**. The design documents this change with roughly
**$0.017 per audio minute as an estimate at the time of writing**. That is an estimate from the
specification, not a promise of the current tariff: confirm the price on the vendor's pricing page
before relying on it.

The session counts vendor-reported billable audio seconds in memory for the active session only
(`session.status().usage.audioSeconds`). Nothing is persisted and MauzCode does not meter or bill
dictation itself. The WebSocket protocol has no usage message in this version, so that count stays
inside the server process instead of being shown to the person dictating.

### 7. How the adapter handles the Realtime stream

These rules follow the OpenAI Realtime transcription behaviour observed with `gpt-live-transcribe`:

- **Early text.** The service often streams transcription deltas for a phrase before it acknowledges
  the commit for that phrase. The adapter holds such deltas (at most 8 items and 1 MiB per session)
  and replays them once `input_audio_buffer.committed` binds the item to its phrase. You therefore
  see a phrase's text right after its commit, not while you are still speaking.
- **Binding.** Each acknowledgement binds to the oldest pending commit. `previous_item_id` is
  ignored. An acknowledgement with no pending commit, a live or recently completed item ID, or an
  overflowing early buffer ends the session as `sequenceMismatch`. Completed text is discarded;
  the adapter keeps only the last 128 completed IDs to suppress duplicate or late events.
- **100 ms minimum.** The service rejects commits with less than 100 ms of audio. A shorter spoken
  tail is padded with silence up to 100 ms; a commit with no audio sends nothing and settles an
  empty phrase locally. Audio is always sent as whole PCM16 samples.
- **Recoverable errors.** Every `session.update` and commit carries an `event_id`. An `error` that
  names a pending commit (for example `input_audio_buffer_commit_empty`) fails only that phrase and
  dictation continues. Authentication, rate-limit, server and `session_expired` errors, errors
  during setup and errors that name no pending commit still end the session; the error journal
  records their service code as detail.

## Set up Deepgram

The `deepgram` provider streams dictation audio from the MauzCode server to Deepgram's live
transcription endpoint `wss://<Base URL>/v1/listen` with the `nova-3` model. Its route is
`deepgram/<account>:nova-3`. It appears in **Settings → Voice** and in the chat route picker next to
OpenAI Realtime; nothing in the composer changes.

### 1. API key and Base URL

Create an API key in the Deepgram console; a key with the default *Member* role is enough for live
transcription. Store the connection in **Settings → Voice** (or `voice.create` with
`provider: "deepgram"`, as in the OpenAI example above). The key is sent only as the header
`Authorization: Token <key>`, never in the URL, and is never returned.

`baseUrl` defaults to `https://api.deepgram.com`. For the EU endpoint use
`https://api.eu.deepgram.com`; the destination is then shown as `Configured endpoint
(api.eu.deepgram.com)`. The same rules as for OpenAI apply: HTTPS only (plain HTTP only on numeric
loopback for tests), no credentials, query or fragment.

### 2. Options

| Field | Type | Meaning |
| --- | --- | --- |
| `apiKey` | secret, required | Deepgram API key. Never returned. |
| `baseUrl` | url, default `https://api.deepgram.com` | Credential-free HTTPS base URL; the adapter appends `/v1/listen`. |
| `languages` | text | Comma-separated language tags such as `ru`, `en`, `en-US`, `zh-Hans`. One tag sends `language=<tag>`. No tag or several tags send `language=multi` (multilingual code switching), with one `language_hint` per tag. The service rejects unsupported tags when the stream opens (`socketError`, `http_400`). |
| `keyterms` | text | Comma-separated terms on one line, at most 100 terms of up to 100 characters. Each term becomes one `keyterm` parameter; a comma always separates terms. |
| `smartFormat` | boolean, default on | Sends `smart_format=true` with `no_delay=true` (punctuation, numerals; no holding back of results). Off sends neither. |
| `mipOptOut` | boolean, default off | Sends `mip_opt_out=true`, which opts the audio out of Deepgram's Model Improvement Program. **Deepgram bills opted-out audio at a higher rate.** |

Per-chat `languages` and `keywords` replace the connection's lists. The adapter always requests
`encoding=linear16`, `sample_rate=16000`, `channels=1`, `interim_results=true` and
`endpointing=false`; the browser resamples to 16 kHz.

Keyterms travel in the request URL, so they can appear in Deepgram's usage logs and request
history. Do not put secrets into keyterms.

### 3. Test the connection

The check opens the live socket with the saved settings, sends `CloseStream` and waits up to 5 s
for the service to close. **No audio is sent.** It verifies the key, the language tags and the
route in one step and needs no management scopes. A refused key reports `bad-key`, a missing close
`timeout`, anything else `unreachable`.

### 4. Network route

All upstream sockets go through the connection's route, so **Direct**, **SOCKS5 proxy** and **SSH
tunnel** work as described in [Network route](#network-route). A broken route fails the check or
the session without a direct connection.

### 5. How the adapter handles the stream

- **Phrases.** Core's voice-activity detection decides phrase boundaries. Each commit sends one
  `Finalize`; a commit without new audio settles an empty phrase locally without `Finalize`.
- **Attribution.** Deepgram results carry no phrase ID. The adapter counts the audio bytes it sent
  and assigns each result to the oldest pending commit whose audio end lies after the result's
  start (50 ms tolerance). Results for audio after the last commit wait for the next commit.
- **Settlement.** A commit settles on a final result marked `from_finalize`, when final results
  cover all of its audio, or after 2 s without any result for it (the text so far, possibly
  empty). Phrases always settle in commit order. Revisions show the final segments plus the
  current interim hypothesis; the final joins the final segments with single spaces.
- **Framing.** Audio is re-framed into 50 ms binary frames (1600 bytes); the remainder is flushed
  before `Finalize` and `CloseStream`. An empty binary frame is never sent.
- **Idle and finish.** `KeepAlive` is sent after 4 s without any frame. Finish settles all phrases,
  sends `CloseStream`, waits up to 5 s for the close and reports the closing `Metadata.duration`
  as usage. Cancel closes the socket at once.
- **Failures.** A refused upgrade reports `socketError` with `http_<status>` (401/403 as
  `providerAuth`, 429 as rate limit); a socket closed by the service reports `socketClosed` with its
  close code; a service `Error` message reports `serviceError`; an unreadable frame reports
  `malformedMessage`. No close reason, service text or frame content is kept. A dropped stream is
  not reconnected: start dictation again.

Not supported in this provider: Flux (`/v2/listen`) and other models, Deepgram endpointing,
temporary tokens, diarization, redaction and dictation mode.

## What stays local and what is the provider's

Guaranteed by the code documented here and covered by the tests under [Verification](#verification):

- audio is relayed through the server in memory only — no file is written, no frame, transcript or
  key is logged, and nothing is added to chat history or the queue;
- a saved key is never sent back to the browser, and dictation traffic between the browser and the
  server carries no key (a key typed into the settings form travels once to the server to be stored);
- origin, owner and chat editability are checked at start and re-checked while the session runs;
  losing edit access ends the session with `readOnly`;
- vendor events are normalized (`phrase` revisions, single `final`, `phraseFailed`), and service
  errors and disconnects become sanitized session errors;
- a route is resolved once and never silently replaced.

Not promised, because it is on the provider's side:

- recognition quality and language coverage for your audio, including the absence of timestamps,
  confidence or speaker labels in the normalized output;
- for Deepgram, how keyterms in the request URL are shown in its usage logs, and the higher price of
  the Model Improvement Program opt-out;
- availability, rate limits, latency and any outage of the vendor endpoint;
- how the vendor stores, retains or reviews submitted audio — governed by your agreement with the
  vendor, not by MauzCode;
- the final bill.

## Declare your own provider

A provider is one declarative file; no composer or session code has to change for it to appear next
to the built-in one.

### Name and placement

- File name `<namespace>/$voiceProvider_<id>.ts`, where `<id>` is lowercase kebab-case (`acme-voice`,
  not `Acme` or `acme_voice`) and must equal the declaration's `id`.
- Put it in a namespace directory of a mounted core module (the built-in adapter lives at
  `src/voice/$voiceProvider_openai-realtime.ts`) or of a mounted plugin's source namespace. The loader
  records the mounted owner of each declaration, so ownership and lifecycle follow the mount rather
  than the file path alone.
- Default-export a `types.voice.ProviderDefinition`. It is a declarative kind: boot registers it
  automatically, and a namespace hot reload (`procs.repl.load`) re-registers the declarations it finds.

### Required members

| Member | Purpose |
| --- | --- |
| `id` | Lowercase kebab-case id; must match the file name. |
| `label` | Human-readable provider name. |
| `description` | Optional safe explanation; never a credential. |
| `destination` | `{ kind: "cloud" \| "host", label }` — where audio is processed, disclosed before capture. |
| `destinationFor` | Optional `(config) => Destination \| undefined`: the destination one stored connection actually uses, from its non-secret configuration (for example `Configured endpoint (host:port)`). Core shows it in Settings → Voice, in the chat route picker and in `ready`; it falls back to `destination` if absent, throwing, or if the label is blank, longer than 160 characters, or contains `/`, `@`, `?`, `#`, `\` or control characters. Name only a host and port — never userinfo, a path, a query, a fragment or other configuration. |
| `transports` | Optional non-empty list of distinct route kinds the provider supports: `"direct"`, `"socks"`, `"ssh-tunnel"`. Absent means `["direct"]`. See [Network routes](#network-routes). |
| `fields` | Connection field schema: `text`, `url`, `select`, `secret`, `number`, `boolean`; keys safe and unique; `secret` fields may declare no default. |
| `models` and/or `listModels` | At least one source: static `VoiceModel[]` and/or `(ctx, conn) => Promise<VoiceModel[]>` discovery. |
| `validateConfig` | Optional synchronous check of non-secret values; return `{ field, reason? }` with a reason from the closed set (`keywordList`, `languageList`, `httpsEndpoint`, `headerIdentifier`), never free text. |
| `test` | `(ctx, conn) => Promise<TestResult>`; must send **no user audio**. |
| `open` | `(ctx, conn, session) => Promise<VoiceStream>`; resolves only after the upstream session accepted the transcription intent. |

A model declares `id`, optional `label`/`description`, and `capabilities`:

- `turnDetection`: `"client"` — the model has no server-side segmentation, so core commits phrases
  (energy VAD plus a finish commit); `"server"` — the provider cuts turns and reports boundaries.
- `sampleRates`: non-empty list of unique positive integers; core negotiates the first entry and the
  browser must use exactly the rate announced in `ready`.
- `languages`, `keywords`, `prompt`, `delay`: booleans that allow the matching per-session option.

### Secrets

`conn.secret(key)` reads one **declared** secret field of that connection and returns `undefined` when
nothing is stored or when the key is not a declared secret field. Providers must never log, return,
embed or forward a secret value, and must never put one into an error message. Core stores secrets
itself, so a provider never writes to the secret store.

### Network routes

A connection's route is chosen by the user from the kinds the provider declares in `transports`; the
catalogue (`voice.providers`) reports them, `["direct"]` when undeclared, so existing providers and
connections keep working unchanged. Declaring `socks` or `ssh-tunnel` is a promise: **every** upstream
request and socket of `listModels`, `test` and `open` must go through the connection-bound clients
on `conn`, never through `globalThis.fetch`, `new WebSocket` or another network client. Core cannot
enforce this — a provider is trusted code, not a sandbox — so a provider that uses its own client must
stay direct-only.

- `conn.transport` — the saved route (`{ kind: "direct" }` for older connections), for diagnostics only.
- `conn.fetch(url, init?)` — HTTP over the route. Non-direct routes require HTTPS, `GET`/`POST` and at
  most eight MiB of body; they carry the whole exchange through the saved SOCKS5 proxy or a leased SSH
  tunnel with remote DNS and a certificate verified for the destination host. Redirects fail. It aborts
  with `conn.signal`; errors carry `code: "TRANSPORT"` and a fixed message.
- `conn.openWebSocket(url, { headers?, protocols? })` — a `WebSocket`-like client (`readyState`,
  `bufferedAmount`, `send`, `close`, `terminate`; `open`, `message`, `error`, `close` events) that
  starts connecting immediately. Non-direct routes require `wss:`: the proxy or tunnel connects to the
  destination host, TLS is verified for that host, and the upgrade and every later frame run on that
  same stream. A refused or redirected upgrade fails with `Expected 101 status code: <status>`; the
  socket ends with `conn.signal`.

Routes are resolved again at use time, so a saved proxy or SSH instance removed after the connection
was saved fails the operation safely. There is never a direct retry. Tunnel leases are released exactly
once, when the response body or socket ends, fails, is cancelled or times out — including a lease that
arrives after cancellation. Saving rejects a kind the provider does not declare, inline credentials
(any property beyond the reference) and unknown references; an unrelated edit keeps the saved route.

A provider that streams over WebSocket and discovers models over HTTP:

```ts
export default {
    id: "acme-stream",
    label: "Acme Stream",
    destination: { kind: "cloud", label: "Acme (stream.acme.example)" },
    transports: ["direct", "socks", "ssh-tunnel"],
    fields: [{ key: "apiKey", label: "API key", type: "secret", required: true }],
    async listModels(_ctx, conn) {
        const response = await conn.fetch("https://stream.acme.example/v1/models", {
            headers: { Authorization: `Bearer ${await conn.secret("apiKey")}` },
        });
        if (!response.ok) throw new Error("model list failed");
        const { models } = await response.json() as { models: { id: string }[] };
        return models.map(m => ({ id: m.id, capabilities: { turnDetection: "client", sampleRates: [16000] } }));
    },
    async test(_ctx, conn) {
        const ws = conn.openWebSocket("wss://stream.acme.example/v1/live", {
            headers: { Authorization: `Bearer ${await conn.secret("apiKey")}` },
        });
        const ok = await new Promise<boolean>(resolve => {
            ws.addEventListener("open", () => { ws.close(1000); resolve(true); }, { once: true });
            ws.addEventListener("close", () => resolve(false), { once: true });
        });
        return ok
            ? { status: "available", reason: "voice-ok", message: "ok", checkedAt: Date.now() }
            : { status: "unavailable", reason: "unreachable", message: "failed", checkedAt: Date.now() };
    },
    async open(_ctx, conn, session) {
        const ws = conn.openWebSocket("wss://stream.acme.example/v1/live", {
            headers: { Authorization: `Bearer ${await conn.secret("apiKey")}` },
        });
        // …wait for "open", stream PCM with ws.send(pcm), report session.emit(...) from "message" events…
        return { async append(pcm) { ws.send(pcm); }, async commit() {}, async finish() { ws.close(1000); }, async cancel() { ws.terminate(); } };
    },
} satisfies types.voice.ProviderDefinition;
```

`src/voice/transport.it.test.ts` exercises both clients over direct, SOCKS5 and SSH-tunnel routes
against a local TLS fixture, including the observed dial target, TLS and redirect failures, absence of
a direct retry and lease cleanup.

### The stream contract

`open` returns a `VoiceStream`:

- `append(pcm)` — mono PCM16 LE at `session.sampleRate`;
- `commit(order)` — one requested phrase boundary; `order` is assigned by **core**, never by the
  provider;
- `finish()` — settle every committed phrase and release upstream resources;
- `cancel()` — idempotent release; events after cancel are dropped by core.

Report through `session.emit`:

- `{ type: "revision", order, text }` with the **complete** text of the phrase so far, then exactly
  one `{ type: "final", order, text }`; core assigns stable ids and increasing revision numbers;
- `{ type: "failed", order, message }` for one phrase whose recognition failed — the session
  continues and later phrases are still delivered. The client receives `phraseFailed` with a closed
  reason (`provider`), never the provider's own text.
- `{ type: "usage", audioSeconds }` if the upstream reports billable audio (counted in memory only);
- for `turnDetection: "server"`, first a `{ type: "committed", turnId, endByte }` boundary per turn
  and then that turn's revisions/final with the same `turnId`.

A draft boundary is **not** `VoiceStream.finish()`. The adapter must report finals while the
stream is open; waiting until `finish()` would make the first dedicated Send time out. Core
flushes a client-detected speech tail, not silence, and waits for outstanding phrase orders. For
provider-detected turns, a missing boundary notification is not evidence of uncommitted speech:
a turn may already be closed upstream. Report `endByte` and the final even if they arrive after
Send. Without confirmed coverage before the deadline, the relay cannot acknowledge success.

Terminal failures go through `session.fail({ code, message })` with a code from the closed set.
Core sanitizes the message before any client sees it. For the owner's error journal a failure (passed
to `fail` or thrown from `open`/`append`/`commit`/`finish`) may also carry `diagnosticCause`
(`authentication`, `rateLimit`, `timeout`), `diagnosticReason` (`socketClosed`, `socketError`,
`serviceError`, `malformedMessage`, `sequenceMismatch`, `sendFailed`, `setupTimeout`, `finishTimeout`;
anything else is stored as `other`) and `diagnosticDetail` — a WebSocket close code `1000`–`4999` or a
lowercase identifier matching `^[a-z][a-z0-9_.]{0,63}$`. Any other detail is dropped; never put close
reason text, upstream messages or payloads there. Clean up the upstream socket on
`session.signal`, on `cancel`, and on `finish`; a provider that ignores the abort signal is still cut
off by the session deadlines.

### Minimal example

```ts
export default {
    id: "acme-voice",
    label: "Acme Voice",
    description: "Fixture recognizer that finalizes every commit with fixed text.",
    destination: { kind: "host", label: "Acme local recognizer" },
    fields: [
        { key: "apiKey", label: "API key", type: "secret", required: true },
        { key: "baseUrl", label: "Base URL", type: "url", default: "https://acme.invalid/v1" },
    ],
    models: [{
        id: "acme-live",
        label: "Acme Live",
        capabilities: { turnDetection: "client", sampleRates: [24000], languages: true, prompt: true },
    }],
    async test(_ctx, conn) {
        return (await conn.secret("apiKey"))
            ? { status: "configured", reason: "configured", message: "Fixture only", checkedAt: Date.now() }
            : { status: "unavailable", reason: "bad-key", message: "Fixture only", checkedAt: Date.now() };
    },
    async open(_ctx, _conn, session) {
        return {
            async append() {},
            async commit(order) {
                session.emit({ type: "final", order, text: `phrase ${order + 1}` });
            },
            async finish() {}, // No outstanding recognition or external resources in this fixture.
            async cancel() {},
        };
    },
} satisfies types.voice.ProviderDefinition;
```

Note that the reason a provider returns in a `TestResult` is filtered by core: an unknown reason is
replaced by the fixed default of its status, so vendor text can never become a public reason. A
`configured` status means "the declaration is satisfied without a network check"; the built-in
adapter performs a real connect and returns `available`.

### Test it against a fake upstream

Providers must be testable without a paid call. `src/voice/contract/` contains the tooling:

- `providerContract.entry.ts` — `runVoiceProviderContract({ name, setup })`, the shared conformance
  suite every provider runs. It drives the real session core and asserts the normalized guarantees:
  the selected route and destination before any transcript, increasing revisions with one final,
  out-of-order finals keeping commit order, a failed phrase not blocking later ones, a disconnect
  producing a sanitized error plus released resources, cancel dropping late events, finish timing out
  on an unacknowledged phrase, and finish committing one remaining turn.
- `sessionFixture.entry.ts` + `contractRecorder.entry.ts` — an in-process fixture with a scriptable
  fake transport, for a provider without a wire protocol.
- `openaiRealtimeFake.entry.ts` + `openaiRealtimeDriver.entry.ts` — a controllable fake Realtime
  WebSocket server on numeric loopback and the wire driver that maps the same scenarios onto native
  events, used by `src/voice/openaiRealtime.it.test.ts` with the adapter's real client.
- `deepgramFake.entry.ts` + `deepgramDriver.entry.ts` — the same for Deepgram `/v1/listen`: the fake
  records binary frames and control messages, the driver answers with time-ranged `Results`. Used
  by `src/voice/deepgram.it.test.ts`. A provider whose protocol has no per-phrase failure passes
  `phraseFailures: false`, which skips that one contract scenario.

A binding test supplies `setup()` returning `{ ctx, route, upstream }`, where `upstream` implements
`acceptCommit`, `reportTurn`, `revise`, `finalize`, `failPhrase`, `disconnect` and `expectClosed` by
sending native wire events — never by calling `session.emit` and never by replacing the adapter's
stream. `src/voice/$voiceProvider_openai-realtime.ts` is the reference implementation, and
`src/voice/providers.test.ts` covers declaration validation and registry behavior.

### Ownership and reload

- The first mounted owner claims a provider id; another owner cannot replace it, even with an equal
  file path.
- The same owner may reload its declaration, which replaces the definition.
- An invalid declaration is rejected with a diagnostic naming its file and the shape that failed —
  never a value — while other declarations in the same batch still register.
- Unmounting a plugin drops its providers immediately; a full boot pass also drops files deleted
  from a still-mounted owner.

## Verification

This page was checked against the code, not only against the design notes:

- the minimal provider example above was transpiled and registered through the real
  `$loader_voiceProvider.ts`, then driven: two commits produced two finals on the same open stream,
  and a declaration with an invalid `destination` was rejected with a shape message containing no value;
- the setup snippet above was executed against an isolated test database: `voice.create` returned a
  view where the secret field appears only as present, and `voice.resolveRoute` returned the route,
  the `cloud` destination label and sample rate 24 kHz without any key material;
- `voice.defaultRoute` was confirmed to be a declared `string` setting on the owner-only declared
  settings page, to store a valid route and to reject a credential-bearing URL;
- `bun test ./src/voice/providers.test.ts ./src/voice/openaiRealtime.unit.test.ts` tests the
  provider declaration and the built-in adapter;
- `bun test ./src/voice/openaiRealtime.it.test.ts` runs the provider contract against the fake
  Realtime server and checks a connection without sending audio;
- `bun test ./src/voice/deepgram.unit.test.ts ./src/voice/deepgram.it.test.ts` covers the Deepgram
  declaration, validation and query building, then the contract, framing, settlement, keep-alive,
  usage, failures and the no-audio check against the fake Deepgram server;
- `bun test ./src/voice/socket.test.ts` checks access and takeover races, frame and queue limits,
  age versus idle time with a fake clock, repeated boundaries, ordered acknowledgements and cleanup;
- `bun test src/voice/registryReload.test.ts` — 2 pass for real boot discovery, isolation of a broken
  declaration in the same pass, and unload when the last declaration disappears;
- `bun test src/voice/httpApi.test.ts` — 10 pass for the settings API: owner/CSRF/origin refusals,
  secret-free CRUD and test, default and per-chat route save/reset, an unavailable selection kept
  rather than replaced, foreign and archived chats, no provider session opened, the built-in
  adapter's per-connection destination (`api.openai.com` by default, `host:port` of a custom Base
  URL, the same in the chat view and in `voice.resolveRoute`), fallback from an unsafe disclosure,
  and a streamed body without `Content-Length` cut off at 64 KiB;
- `bun run frontend:test -- frontend/src/test/settings-voice.test.tsx frontend/src/test/composer-footer.test.tsx`
  — the Voice tab and chat selector, including the unconfigured state, with spies proving that
  neither `getUserMedia` nor a `WebSocket` is called;
- `bun run frontend:test -- frontend/src/test/voice-panel.test.tsx frontend/src/test/inline-dictation.test.ts`
  — keyboard, focus, mute/unmute, word and full dictation deletion without touching typed text,
  corrections or attachments, and accessible panel state on fine and coarse pointers;
- `bun run frontend:test -- frontend/src/test/voice-submission.test.tsx` — both entry points through
  `LiveComposer`, synthetic media, a local voice socket double and mocked HTTP: final words and
  attachments, ordinary send vs queue, duplicate Enter, stale sessions, failed recognition, stable
  retries, dedicated Send staying connected, and terminal finish for a legacy relay;
- `bun test ./src/voice/composer.browser.it.test.ts` exercises Chromium, the real AudioWorklet,
  relay and OpenAI adapter against two editable fixture chats and a loopback provider. It counts
  ordinary submissions and live streams, and checks the actual PCM for muted microphone samples.

These frontend checks use neither a real microphone nor a live provider.

## Related

- [Models provider SDK](models-providers.md) — chat and inference routing; a different SDK.
- [Settings](settings.md) — declared keys, instance files and how `voice.defaultRoute` resolves.
- [Runtime authoring](runtime-authoring.md) — procedure contract, file grammar and reload.
- Source: `src/voice/` (SDK, adapter, contract tests), `src/$ws_voice_session.ts` (endpoint).
- The `whisper` plugin remains a separate local speech-to-text integration.
