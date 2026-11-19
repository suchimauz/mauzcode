# Tasks

## 1. Storage

- [x] 1.1 Add migration adding nullable `reason` and `detail` columns with CHECK constraints to `voice_error_journal`
- [x] 1.2 Extend `voice.journal.record` with optional `reason`/`detail`, normalizing unknown reasons to `other` and unsafe details to `NULL`
- [x] 1.3 Return `reason` and `detail` from `voice.journal.read`

## 2. Provider contract and session

- [x] 2.1 Add optional `diagnosticReason`/`diagnosticDetail` to the `StreamSession.fail` error type and document them for providers
- [x] 2.2 Propagate reason/detail from provider errors in `session/open.ts`; set core reasons for deadlines, `endByte` mismatch and backpressure

## 3. OpenAI Realtime adapter

- [x] 3.1 Map close (with close code), socket error (with `http_NNN`), service error (code/type), malformed frame, sequence mismatch, send failure and timers to reasons
- [x] 3.2 Ensure no close reason text, message or frame content reaches the error object

## 4. UI and docs

- [x] 4.1 Show reason and detail in Settings → Voice → Errors with fallbacks for old records
- [x] 4.2 Update `docs/voice-providers.md` with the new diagnostic fields

## 5. Tests

- [x] 5.1 Journal tests: normalization of reason/detail, rejection of unsafe details, old rows readable
- [x] 5.2 OpenAI unit tests: close 1006/1011, service error with sensitive message, malformed frame, sequence mismatch
- [x] 5.3 Session tests: reason/detail reach the journal for streaming failures
- [x] 5.4 Run voice test suite and `openspec validate voice-failure-detail --strict`
