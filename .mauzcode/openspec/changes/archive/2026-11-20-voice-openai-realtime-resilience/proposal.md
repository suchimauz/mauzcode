# Proposal

## Why

Voice dictation on the `openai-realtime` provider breaks at random during streaming. The error journal shows `sequenceMismatch` and other streaming-stage failures. On 2026-11-19 we compared the provider with the OpenAI Realtime transcription docs and ran live probes on the saved connection. They show that the provider treats normal `gpt-live-transcribe` behaviour as protocol violations and closes the whole session:

- `gpt-live-transcribe` streams `conversation.item.input_audio_transcription.delta` events for an item **before** the client commits the buffer. The `input_audio_buffer.committed` event that names that `item_id` arrives only after our commit. The provider treats any delta for an unknown item as `sequenceMismatch` and fails the session. This happens on almost every phrase longer than about two seconds.
- The Realtime docs say most `error` events are recoverable and the session stays open. Committing less than 100 ms of audio gives `invalid_request_error` / `input_audio_buffer_commit_empty`, and the socket stays usable. Live probes confirmed this. The provider treats every `error` event as fatal. A short trailing tail at finish ends the session instead of one phrase.
- The provider sends commits without an `event_id`, so it cannot match a commit-level error to the phrase it belongs to. The FIFO of pending commits then loses sync.
- `previous_item_id` is used as a hard consistency check. The docs describe it as optional and nullable. The live service sent correct values, but the check adds no safety beyond the FIFO binding and stays a fragile failure path.

## What Changes

- Buffer transcription deltas (and early `completed` / `failed` events) for item IDs that have no `input_audio_buffer.committed` yet. Replay them in order when the commit acknowledgement binds the item to its core order. Bound the buffer by item count and bytes.
- Stop using `previous_item_id` as a failure condition. Commit acknowledgements bind FIFO to pending core commits. `sequenceMismatch` is reserved for an acknowledgement that has no pending commit, a duplicate item ID, or buffered early events that overflow their bound.
- Send every client event that can fail (`session.update`, `input_audio_buffer.commit`) with a unique `event_id`. An `error` event whose `event_id` names a pending commit fails only that phrase (`phraseFailed`) and removes it from the FIFO. The session continues.
- Classify the remaining `error` events. Authentication, permission, rate-limit, server and session-expiry errors, and any error during setup, stay terminal. An uncorrelated `invalid_request_error` after setup also stays terminal (conservative), but is reported with its safe `code` as detail.
- Guarantee that a commit is sent only when the buffer holds at least 100 ms of audio since the previous commit. A shorter non-empty tail is padded with PCM silence up to 100 ms. An empty buffer sends no commit, and the order is settled as an empty phrase without a network round trip.
- Append only whole PCM16 samples. An odd trailing byte is carried over to the next append; the docs reject non-sample-aligned audio with `invalid_value`.
- Extend the fake Realtime server and unit tests with the observed live sequences: early deltas, a commit-empty error with `event_id`, an empty-transcript completion for silence, and a recoverable error mid-session.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `voice-openai-realtime-provider`: event normalization accepts pre-commit deltas, error events are correlated and classified, commits satisfy the 100 ms minimum, appends stay sample-aligned, and `sequenceMismatch` gets narrower conditions.

## Impact

- `src/voice/$voiceProvider_openai-realtime.ts` (event state machine, send path, error classification).
- `src/voice/openaiRealtime.unit.test.ts`, `src/voice/contract/openaiRealtimeFake.entry.ts`, `src/voice/contract/openaiRealtimeDriver.entry.ts`, `src/voice/openaiRealtime.it.test.ts`.
- `docs/voice-providers.md` (OpenAI Realtime notes).
- No change to the browser `/voice/session` protocol, the Voice SDK core contract, the error-journal schema or stored connections.
