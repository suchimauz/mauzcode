# Design

## Context

See proposal.md (Why). The provider (`src/voice/$voiceProvider_openai-realtime.ts`) is a single state machine that:

- binds `input_audio_buffer.committed` to a FIFO of core orders;
- rejects any transcription event for an unknown item;
- treats every `error` frame as terminal.

Live probes on 2026-11-19 against the saved `openai-realtime` connection (SSH-tunnel route) recorded the following:

| Probe | Observed |
| --- | --- |
| Two TTS phrases (≈5 s and ≈4 s) streamed at real time, commit after each | Deltas for item A from t≈2.3 s; `committed` for A only after our commit at t≈5.7 s. Same for item B. `previous_item_id` was correct (null, then A). |
| Commit with an empty buffer | `error` `invalid_request_error` / `input_audio_buffer_commit_empty`, carrying our `event_id`; socket stays open. |
| Commit after 40 ms | Same error, "Expected at least 100ms". |
| Commit after exactly 100 ms of silence | Accepted; `completed` with `transcript: ""`. |
| 1 s of silence | `completed` with `transcript: ""`, `usage.seconds: 1`. |
| Append of 4801 bytes | `error` `invalid_value`, `param: audio.audio`, no `event_id` even though one was sent; socket stays open. |
| `session.update` with a `<` keyword, with `server_vad`, with language `xx-YY` | `error` `invalid_value` each; previous config kept; socket stays open. Only the language error echoed `event_id`. |
| Phrase after all of these errors | Transcribed normally. |
| 70 s idle with an open socket | No close, no event; the next commit works. |

## Goals / Non-Goals

**Goals:** no session failure for documented normal behaviour; per-phrase failure for commit-level errors; deterministic binding of text to core orders.

**Non-Goals:**
- reconnect or resume after a real disconnect;
- tuning delay or prompt;
- a `gpt-transcribe` model;
- changing the Voice SDK core VAD (the provider enforces the 100 ms floor itself, because the floor is an OpenAI-specific rule);
- `session.close` graceful drain (documented for translation and GPT-Live sessions, not for transcription sessions).

## Decisions

1. **Pre-ack buffer keyed by `item_id`.** Unknown-item events go to `early: Map<itemId, Event[]>`, bounded (for example 8 items and 1 MiB). On `committed` the item binds to `pending.shift()`, then its early events replay through the normal handler. Alternative considered: emit early text into the *next pending* order. Rejected, because deltas can start before core has requested the commit, so no order may exist yet. The docs also say to reconcile by `item_id`.
   - Consequence: revisions for a phrase appear only after its commit, not while the user is still speaking. This matches today's visible behaviour (today the session dies instead). Showing live partials before the commit would need a provider-assigned turn ID, which the SDK forbids for client-turn models. That is out of scope.
2. **Drop `previous_item_id` checks.** FIFO plus a unique item ID is the documented binding. Keeping a hard check adds a failure mode and no safety.
3. **`event_id` correlation.** Format `mc_<n>` with a per-session counter. A map from `event_id` to order is kept for pending commits only. A correlated commit error removes that order from `pending` (by value, not by shifting) and emits `failed`. The live probe showed that append errors carry no `event_id`, so append validation must be local (decisions 5 and 6).
4. **Terminal vs recoverable.** Recoverable only when correlated to a pending commit. Everything else stays terminal (conservative), keeping today's diagnostic classification. Setup errors are always terminal because `ready` has not resolved.
5. **100 ms floor in the provider.** Track `bytesSinceCommit`. At commit: if it is 0, emit `final` with "" locally; if it is below 4800, append zero samples to reach 4800, then commit. Silence padding costs at most 100 ms of billed audio. It is preferred over merging the tail into the next commit, because the core expects one phrase per commit order.
6. **Sample alignment.** Hold one carry byte. The core already forwards PCM16 frames, so this is a cheap guard.

## Risks / Trade-offs

- [The service may never acknowledge an item whose early deltas were buffered (for example, the commit failed)] → The early buffer is bounded and cleared on finish. Entries for unbound items are dropped when the session ends; overflow is a `sequenceMismatch` failure with a clear reason.
- [Silence padding could make the model hallucinate text on a tiny tail] → The core flush already drops silence-only tails. Padding applies only to tails that contain speech, and the observed result for pure silence is an empty transcript.
- [An unknown error code that is actually recoverable stays terminal] → Kept on purpose. The journal detail now includes the code, so we can widen the recoverable set from evidence.
- [Docs say completions across turns may arrive out of order] → Binding is by `item_id`, so order is preserved; `finish` already waits until every order is settled.

## Migration Plan

Code-only change in one provider file and its tests; no data or API migration. Rollback by reverting the commit.

## Open Questions

- Exact bounds for the early buffer (item count and bytes); set them during implementation from the existing 1 MiB limit.
