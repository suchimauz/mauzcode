# Proposal

## Why

Live dictation currently has a single built-in provider, OpenAI Realtime. Deepgram's Nova-3 live
transcription (`/v1/listen` over WebSocket) supports multiple languages, keyterm biasing and explicit
flushing at a lower per-minute price. Adding it gives the owner a second cloud option without any
change to the composer or the session protocol, and it exercises the provider SDK with a second real
adapter.

## What Changes

- Add a built-in voice provider `deepgram` declared in `src/voice/$voiceProvider_deepgram.ts`. It
  streams mono PCM16 at 16 kHz from the MauzCode server to `wss://<base>/v1/listen` with
  `model=nova-3`, `encoding=linear16`, `interim_results=true`, `endpointing=false` and, with smart
  formatting, `no_delay=true`. It sends audio in 50 ms frames and authenticates with
  `Authorization: Token <API key>`.
- Phrase boundaries stay client-driven (`turnDetection: "client"`): each core commit sends one
  `Finalize` control message. The provider maps Deepgram `Results` back to the committed phrase by
  audio time, emits revisions from interim text and exactly one final per commit.
- Connection fields: API key (secret), Base URL (default `https://api.deepgram.com`, HTTPS only,
  numeric loopback HTTP for tests), languages, keyterms (up to 100), smart formatting (default on) and a Model
  Improvement Program opt-out (default off, because Deepgram bills it at a higher rate).
- Language handling: no language or several languages use `language=multi` with one `language_hint`
  per configured language; exactly one language uses `language=<code>`.
- `KeepAlive` while no audio flows, `CloseStream` on finish, usage reported from the closing
  `Metadata.duration`.
- Connection test opens the WebSocket with the saved settings, sends `CloseStream` and waits for the
  socket to close. It sends no audio.
- All upstream sockets go through `conn.openWebSocket`, so the provider advertises `direct`, `socks`
  and `ssh-tunnel` routes.
- Failures are classified for the voice error journal using the existing closed reason set.
- Documentation: a "Set up Deepgram" section in `docs/voice-providers.md`.

Out of scope: Flux (`/v2/listen`) and other Deepgram models, server-side endpointing, temporary
JWT tokens, diarization, redaction, dictation mode and transparent reconnection.

## Capabilities

### New Capabilities
- `voice-deepgram-provider`: the built-in Deepgram Nova-3 live transcription provider for the Voice
  SDK. Covers connection fields, the stream protocol mapping, phrase settlement, the connection test,
  routing and failure classification.

### Modified Capabilities
<!-- None: the Voice SDK contract, the session protocol and the composer are unchanged. -->

## Impact

- New file `src/voice/$voiceProvider_deepgram.ts`, plus unit tests and integration tests against a fake
  Deepgram WebSocket server (`src/voice/contract/deepgramFake.entry.ts`, `deepgramDriver.entry.ts`),
  run through the shared provider conformance suite.
- `docs/voice-providers.md`: implementation status and setup guide.
- No migrations, no new dependencies, no browser or `/voice/session` changes. Settings → Voice and the
  chat route picker show the provider automatically from the registry.
