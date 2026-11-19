# Tasks

## 1. Fake server and test fixtures

- [x] 1.1 Extend `src/voice/contract/openaiRealtimeFake.entry.ts` with these modes: deltas before `committed`; `input_audio_buffer_commit_empty` error echoing the commit `event_id`; empty-transcript completion; uncorrelated `invalid_request_error`. Verify that existing provider tests still pass with `bun test src/voice/openaiRealtime.unit.test.ts`.

## 2. Event binding

- [x] 2.1 Add a bounded pre-acknowledgement buffer keyed by `item_id`, with replay on `input_audio_buffer.committed`. Verify with a new unit test: deltas arrive before the ack and the phrase receives all text and the final.
- [x] 2.2 Remove the `previous_item_id` failure check and narrow `sequenceMismatch` to an ack with no pending commit, a duplicate item, or buffer overflow. Update the existing "wrong predecessor" tests to the new scenarios and verify with the unit test file.
- [x] 2.3 Verify that a completion with an empty transcript settles a final empty phrase (unit test).

## 3. Commit and append safety

- [x] 3.1 Track `bytesSinceCommit`. Skip upstream on an empty commit and emit a local empty final; pad tails under 4800 bytes with silence. Verify with unit tests for a 0-byte and a 40 ms commit (no `commit_empty` from the fake).
- [x] 3.2 Keep appends sample-aligned with a carry byte. Verify with a unit test that an odd-length frame yields only even-length upstream audio.

## 4. Error correlation

- [x] 4.1 Send `event_id` on `session.update` and every commit. Map a correlated commit error to `failed` for that order only, removing it from the FIFO. Verify with a unit test: the second phrase still binds correctly after the first fails.
- [x] 4.2 Keep auth, permission, rate-limit, server, `session_expired`, setup-time and uncorrelated errors terminal, with unchanged diagnostics. Verify with the existing classification tests plus a setup-rejection test.
- [x] 4.3 Update the OpenAI Realtime section of `docs/voice-providers.md` (early deltas, 100 ms floor, recoverable commit errors) and review the rendered text.

## 5. Integration checks

- [x] 5.1 Run `bun test src/voice` and the OpenAI Realtime integration test against the fake server. Expect all of them to pass.
- [x] 5.2 Run a live check on a saved connection with two real-time phrases, a short tail and an empty finish. The session ends cleanly with no new `voice_error_journal` rows.
- [x] 5.3 Run `openspec validate voice-openai-realtime-resilience --strict` and the project typecheck owner's full check once for the settled batch.
