# Voice providers (live dictation SDK)

The Voice SDK (`src/voice`, runtime namespace `ctx.fns.voice`) turns speech into text for chat
drafts. It has its own provider declarations, its own connections table and its own live session
protocol. It is **not** the Models SDK and it is **not** the Whisper plugin:

- Models (`docs/models-providers.md`) routes chat and inference requests. A Models connection and a
  voice connection are stored separately, even when both hold the same OpenAI key, and their routes
  are not interchangeable.
- The `whisper` plugin (`whisper.transcribe`, `/whisper`) transcribes an audio file or uploaded
  bytes locally with whisper.cpp. The Voice SDK does not import, call or adapt it.

One built-in provider ships today: **`openai-realtime`**, which streams audio from the MauzCode
server to the OpenAI Realtime transcription service. The rest of this page covers both using it and
declaring a different one.

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
  generation, remaining-time countdown, pause/resume and cleanup on navigation, read-only loss and
  socket loss;
- two entry points next to the route selector of an open editable chat, sharing that one capture
  controller: **inline voice input** at the caret of the ordinary editor and **voice mode**, a panel
  that temporarily replaces the editor (see [Dictate in a chat](#dictate-in-a-chat));
- explicit send from either entry point: stop capture, wait for the final words, then submit the
  draft and attachments using the ordinary send action (the ordinary queue when the chat is busy).
  Neither entry point sends on silence, pause, or stop.

### Public facade and internal namespaces

The public surface is a minimal facade of root procedures: `voice.providers`, `voice.list`,
`voice.get`, `voice.create`, `voice.update`, `voice.remove`, `voice.test`, `voice.resolveRoute` and
`voice.effectiveRoute`. Everything else lives in an implementation namespace and is called by full
name — `voice.connections.*` (CRUD, resolution, the connection check, schema validation),
`voice.route.*` (parsing, resolution, the per-chat override) and `voice.session.*` (the normalized
session core and its segmentation). `src/$ws_voice_session.ts` is the single transport into the
session core; an ordinary consumer should not open a session core directly.

## How a dictation session runs

```
browser  ──/voice/session (WebSocket)──▶  MauzCode server  ──wss──▶  OpenAI Realtime
         mono PCM16 LE 24 kHz             session core, VAD,           ?intent=transcription
         + 4-byte sequence header         provider adapter
```

- The browser sends no credentials and receives no vendor events. The API key is read on the server
  and only the server opens the vendor socket.
- Client to server: one text message `{ "type": "start", agentId, generation }`, then binary frames
  of mono PCM16 little-endian at the announced rate (24 kHz), 20–100 ms each, prefixed by a 4-byte
  little-endian sequence number; `{ "type": "finish" }` and `{ "type": "cancel" }` end the session.
- Server to client: `{ "type": "ready", sessionId, route, destination, sampleRate }` before any
  transcript, then `phrase` (`id`, `order`, `revision`, complete `text`, `final`), `phraseFailed`,
  `completed`, and `error` with a code from a closed set: `unauthorized`, `readOnly`,
  `superseded`, `unconfigured`, `routeUnavailable`, `providerAuth`, `provider`, `timeout`,
  `backpressure`, `protocol`. Error messages are one fixed sentence each; no vendor payload and no
  key material can appear in them.
- The endpoint requires the normal owner session cookie, an exact origin match, the `owner` role and
  an editable chat owned by that user. One session per owner and chat: a second tab supersedes the
  first, and a chat that becomes read-only ends the session with `readOnly`.
- Bounds: 5-minute session, 30-second idle timeout, 16 KiB frame, 1 MiB buffered upstream, 10-second
  finish deadline. Exceeding one ends the session with a visible error instead of dropping audio.

The browser client of this protocol is `useVoiceCapture`; the composer's entry points below are its
only consumers. A resume opens a new socket with a new `generation`, so events of a paused or
cancelled session can never reach the draft.

## Dictate in a chat

Dictation needs a configured route (Settings → Voice) and a page opened over HTTPS or on
`localhost`; otherwise the controls stay visible but disabled and say what is missing. Nothing
requests the microphone until you activate a control, and the footer tells you where the audio would
be processed before you do. Neither control is shown in a new-session or read-only composer.

**Inline voice input** (microphone icon after the context indicator). Click once to start dictating
at the caret of the message field; click again to stop. The last phrase is finalized, the text stays
editable and nothing is sent. Interim words are replaced in place as recognition improves; once you
edit a recognized word yourself, later corrections of that phrase are ignored.

**Voice mode** (waveform icon). Replaces the message field with a panel that shows the recording
state, the remaining time of the five-minute session and the message text, and starts recording at
the caret. It edits the same draft and keeps your attachments. While focus is inside the panel:

| Key | Button | Effect |
| --- | --- | --- |
| Space | Pause / Continue recording | Pause finalizes the current phrase and releases the microphone; continue starts a new session after the dictated text. |
| — | Clear dictation | Removes every phrase dictated into this draft that you have not edited — in voice mode or with inline input, including earlier visits; typed text, phrases you corrected and attachments stay. Sending the message starts a new draft. |
| Enter | Send | Finishes the last phrase, then sends the text and attachments once. On acknowledgement the panel stays open on pause with an empty draft. |
| Escape | Exit | Stops recording and returns focus to the message field with the visible text, without sending. Clicking the voice mode icon again does the same. |

If recognition fails during send, nothing is submitted. Review the visible text (Exit to edit),
then explicitly send again. If the message acknowledgement is lost, retrying the unchanged draft
uses the same request key and endpoint, including its attachments while the page stays open.

The shortcuts work only while focus is on the panel itself or its message text, never for typing
elsewhere. A focused button inside the panel keeps its own keys — Space and Enter press it and Escape
does nothing there; use the Exit button to leave. Text fields keep all their keys. Screen readers hear only state changes — recording, paused, a send acknowledgement, an error, dictation moved to
another tab, one minute and ten seconds left — never the recognized words; the text is readable by
moving through the panel. Opening dictation for the same chat in another tab stops this one with a
visible notice; the text stays and you can continue.

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
  confidence or speaker labels in this model's output;
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

Terminal failures go through `session.fail({ code, message })` with a code from the closed set.
Core sanitizes the message before any client sees it. Clean up the upstream socket on
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
        const pending: number[] = [];
        return {
            async append() {},
            async commit(order) { pending.push(order); },
            async finish() {
                for (const order of pending) session.emit({ type: "final", order, text: `phrase ${order + 1}` });
                pending.length = 0;
            },
            async cancel() { pending.length = 0; },
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
  `$loader_voiceProvider.ts`, then driven: one commit produced exactly one final, and a declaration
  with an invalid `destination` was rejected with a shape message containing no value;
- the setup snippet above was executed against an isolated test database: `voice.create` returned a
  view where the secret field appears only as present, and `voice.resolveRoute` returned the route,
  the `cloud` destination label and sample rate 24 kHz without any key material;
- `voice.defaultRoute` was confirmed to be a declared `string` setting on the owner-only declared
  settings page, to store a valid route and to reject a credential-bearing URL;
- `bun test src/voice/providers.test.ts src/voice/openaiRealtime.unit.test.ts` — 25 pass;
- `bun test src/voice/openaiRealtime.it.test.ts` — 17 pass, including the shared provider contract
  against the fake Realtime server and the connection test that sends no audio;
- `bun test src/voice/socket.test.ts` — 13 pass for the endpoint itself (origin and ownership
  refusals, read-only loss, frame and queue bounds, sequence gaps, idle and five-minute limits,
  takeover, sanitized provider errors);
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
  — voice mode through the real `LiveComposer` with a fake capture controller (no microphone,
  socket or network): one controller for both modes, focus into the panel and back to the editor,
  pause/resume with Space, late events of paused or cancelled generations ignored, selective clear
  keeping typed text, corrections and attachments, keys ignored outside the panel and on its
  buttons and text fields, one polite live region carrying only state changes and
  the 1 min / 10 s thresholds, read-only loss and chat switch;
- `bun run frontend:test -- frontend/src/test/voice-submission.test.tsx` — both entry points through
  `LiveComposer`, synthetic media, a local voice socket double and mocked HTTP: final words and
  attachments, ordinary send vs queue, duplicate Enter, stale sessions, failed recognition, stable
  retries and a paused panel after acknowledgement.

These frontend checks use neither a real microphone nor a live provider.

## Related

- [Models provider SDK](models-providers.md) — chat and inference routing; a different SDK.
- [Settings](settings.md) — declared keys, instance files and how `voice.defaultRoute` resolves.
- [Runtime authoring](runtime-authoring.md) — procedure contract, file grammar and reload.
- Source: `src/voice/` (SDK, adapter, contract tests), `src/$ws_voice_session.ts` (endpoint).
- The `whisper` plugin remains a separate local speech-to-text integration.
