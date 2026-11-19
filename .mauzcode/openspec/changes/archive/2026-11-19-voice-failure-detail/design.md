# Design

## Context

`voice.journal.record` stores `{provider, model, stage, cause}` with `cause ∈ {authentication, rateLimit, timeout, unknown}`. `session/open.ts` derives `cause` from the provider error's `diagnosticCause`. The OpenAI Realtime adapter creates `failure("provider")` for disconnects, malformed frames, sequence errors and send failures without any extra data, and its `onClose` handler ignores the `CloseEvent`. The bound WebSocket already dispatches a real `CloseEvent` with `code`.

## Goals / Non-Goals

**Goals:** make the reason of a `streaming/unknown` failure identifiable from the journal alone; keep the privacy contract (no free text, payloads, URLs, credentials, audio or transcripts).

**Non-Goals:** changing user-facing error codes/messages, the browser protocol, retries/reconnects, or server logging.

## Decisions

1. **Two new nullable columns** `reason TEXT` and `detail TEXT` on `voice_error_journal` via a new migration, with `CHECK` constraints mirroring validation (`reason` in the closed set; `detail` `~ '^([1-4][0-9]{3}|[a-z][a-z0-9_.]{0,63})$'`). Existing rows stay `NULL` and render as unknown. Nullable columns keep the migration non-destructive.
2. **Provider contract:** extend the failure object accepted by `StreamSession.fail` and thrown from `open` with optional `diagnosticReason` and `diagnosticDetail`, alongside the existing `diagnosticCause`. Providers may supply them; core never trusts them.
3. **Normalization in `journal.record`:** unknown `reason` → `other`; `detail` kept only if it is an integer 1000–4999 (stored as its decimal string) or matches the identifier pattern; otherwise `NULL`. Validation lives in one place so third-party providers cannot bypass it.
4. **Session propagation:** `open.ts` passes `reason`/`detail` from the error to `record`. Core-originated failures set their own reason: setup/finish deadlines (`setupTimeout`/`finishTimeout`), the server-commit `endByte` check (`sequenceMismatch`), backpressure (`sendFailed`).
5. **OpenAI adapter mapping:** `onClose(e)` → `socketClosed` + `e.code`; `onError` → `socketError` (detail = HTTP status only when it is the fixed `Expected 101 status code: NNN` form — stored as the identifier `http_NNN`); `type: "error"` → `serviceError` + `error.code ?? error.type`; JSON/shape errors → `malformedMessage`; predecessor/item mismatches → `sequenceMismatch`; `send` failures → `sendFailed`; open/finish timers → `setupTimeout`/`finishTimeout`.
6. **UI:** `read.ts` returns `reason` and `detail`; `VoiceErrors.tsx` renders `Reason: … · Detail: …` with `unknown`/`—` fallbacks.

## Risks / Trade-offs

- A service error code could in theory carry identifying data → mitigated by the strict lowercase identifier pattern and 64-char cap.
- Close code 1006 (abnormal, no close frame) will remain ambiguous between tunnel drop and upstream drop; still a clear improvement over `unknown`.
- `onError` is normally followed by `close`; the first terminal event wins in `cleanup`, so the error reason (not the following close) is recorded.

## Migration Plan

Deploy migration, then code. Rollback: drop the two columns (migration `down`); old code ignores them.
