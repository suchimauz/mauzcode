# Design

## Context

The Voice SDK (`src/voice`) loads `$voiceProvider_<id>.ts` declarations. Core owns VAD, phrase order,
revisions, deadlines and the browser protocol. A provider only maps its upstream to `VoiceStream`
(`append`, `commit(order)`, `finish`, `cancel`) and `session.emit`. The single existing adapter,
`$voiceProvider_openai-realtime.ts`, is the reference. It uses routed sockets
(`conn.openWebSocket`), fixed sanitized messages, classified failures and a fake upstream with a
driver for the shared conformance suite (`contract/providerContract.entry.ts`).

The Deepgram `/v1/listen` stream differs from OpenAI in ways that shape the adapter:

- Audio goes in as raw binary frames. Control messages are JSON text (`Finalize`, `KeepAlive`,
  `CloseStream`). There is no session-update handshake, so a successful upgrade means the stream is
  ready.
- Results carry no item or commit ID. Each `Results` has `start`/`duration` in stream seconds,
  `is_final`, `speech_final` and `from_finalize`. One utterance can produce several `is_final`
  segments.
- `Finalize` does not always produce a `from_finalize` answer, for example when little or no audio
  was buffered.
- The service closes the socket after about 10 s without audio or `KeepAlive` (`NET-0001`). Fatal
  errors close the socket with a close frame. The text `Error` message is used only for recoverable
  schema errors.

## Goals / Non-Goals

**Goals:**
- Follow the OpenAI adapter's structure, safety rules and test layout so both providers are reviewed
  the same way.
- Attribute text to core commits deterministically, without IDs from upstream.

**Non-Goals:**
- No changes to the core, the session protocol or the provider SDK types.
- No model discovery through `/v1/models`: the catalogue is the static `nova-3` entry.

## Decisions

### Client turns with `Finalize`, not Deepgram endpointing
`endpointing=false` keeps segmentation in core's VAD, which every other provider path already uses.
Each `commit(order)` sends `Finalize`. Server turn detection (`UtteranceEnd`/`speech_final`) would need
`turnId`/`endByte` reporting and gives core less control over the Send boundary. The owner chose
the client option.

### Attribute results by audio time
The adapter counts the bytes it has sent and records each pending commit's end offset
(`endSec = bytes / (16000 * 2)`). A `Results` frame belongs to the oldest pending commit whose
`endSec` is greater than the result's `start` plus a small tolerance. Results that start at or after
the last commit belong to the open (uncommitted) phrase buffer and are attributed when the next commit
arrives. FIFO-by-arrival was rejected: Deepgram may emit an `is_final` segment for audio before the
`Finalize` that closes it, and arrival order alone cannot tell which commit a segment belongs to.

A commit settles when one of these happens first:
1. a final result with `from_finalize: true` arrives while it is the oldest pending commit;
2. final results reach `start + duration >= endSec - tolerance`;
3. a quiet timer expires, measured from its `Finalize` (2 s, as in Pipecat's Deepgram integration, refreshed by any
   result for that commit). The final then uses the text gathered so far.

Settlement is strictly in commit order. A later commit cannot settle before an earlier one, so emitted
orders stay monotonic even though core would tolerate reordering.

### Revisions
Revision text is the final segments joined by spaces plus the latest interim hypothesis that belongs
to the commit. The adapter emits a revision only when the text changes, so core's revision counter
does not grow on duplicates.

### 16 kHz sample rate
Deepgram accepts any `linear16` rate. 16 kHz halves upstream bandwidth compared with 24 kHz and is
Deepgram's recommended rate for speech. Core negotiates `sampleRates[0]`, so the browser resamples.

### Language mapping
Language mapping is pure: zero languages give `multi`, one gives `<tag>`, two or more give `multi`
with one `language_hint` each. The tag pattern allows a primary subtag with optional subtags
(`en`, `en-US`, `zh-Hans`, `nl-BE`). The service rejects unsupported tags at upgrade time. That
failure is classified as `socketError` with detail `http_400`.

### Smart formatting with `no_delay`
`smart_format=true` may hold results back until a number or similar entity looks complete. With
dictation, a held segment can delay a phrase past the quiet timer. `no_delay=true` turns that
waiting off, as LiveKit's Deepgram plugin does by default. Dictation mode (`dictation=true`, spoken
punctuation for English only) was considered and is not offered.

### 50 ms audio frames
Browser chunk sizes vary. The adapter re-frames audio into 1600-byte (50 ms at 16 kHz) binary frames,
following LiveKit's plugin, and flushes the remainder before `Finalize`/`CloseStream`. This makes
upstream pacing predictable and keeps whole samples. Empty frames are never sent, because Deepgram
treats an empty binary message as a close signal.

### Keepalive
A timer sends `{"type":"KeepAlive"}` when 4 s have passed since the last audio or control frame.
Core's VAD forwards silence as audio too, so the timer mainly fires during browser stalls or
backpressure. The timer is cleared on finish, cancel and abort.

### Connection test
The test opens the real `/v1/listen` socket with the saved query, sends `CloseStream` and waits for
the close (5 s limit). This checks the key, the model, the language tags and the route in one step
without sending audio and without needing management scopes. `GET /v1/projects` was rejected
because it needs key scopes unrelated to transcription.

### Base URL
The default is `https://api.deepgram.com`. The same validator rules as for OpenAI apply (HTTPS,
numeric-loopback HTTP, no credentials/query/fragment). The path becomes `<base path>/v1/listen` and
the scheme becomes `wss:`/`ws:`. Shared helpers are not extracted from the OpenAI file: provider files
must be self-contained (`selfContained.test.ts`), so the small validator is duplicated on purpose.

### Reconnection
Deepgram recommends reconnecting on long streams. This change keeps the SDK behaviour, as for
OpenAI: an upstream drop fails the session with a classified error, and the user starts dictation
again. Dictation sessions are short, and a transparent reconnect would need audio buffering in core.

## Risks / Trade-offs

- [Deepgram `start`/`duration` drift from our byte count, for example after resampling rounding] →
  use a tolerance (≈ 50 ms) and the `from_finalize`/quiet-timer fallbacks. A unit test covers results
  that straddle a commit boundary.
- [The quiet timer finalizes text that arrives later] → late segments for an already settled commit
  are dropped. The timer is refreshed by every result for the commit, and the default leaves margin
  over Deepgram's typical Finalize latency (< 500 ms).
- [`mip_opt_out` costs more] → off by default, with help text that states the trade-off.
- [A keyterm containing commas is accepted by Deepgram silently and boosts nothing] → keyterms are
  split on commas into separate `keyterm` parameters, at most 100 (Deepgram's limit).
- [Keyterms in the URL can show up in Deepgram usage logs] → documented. `redact_usage` was not chosen
  in this change.
