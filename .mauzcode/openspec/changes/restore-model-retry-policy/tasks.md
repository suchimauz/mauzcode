# Tasks

## 1. Policy

- [x] 1.1 Declare the `agent.retryPolicy` JSON setting (`src/agent/$setting_retryPolicy.ts`) with defaults maxRetries 5, initialDelayMs 1000, maxDelayMs 60000, jitterRatio 0.2, the default retryableCodes (including `PROVIDER_ERROR`), and empty providers. Its `validate` rejects unknown codes in `retryableCodes` on `settings.set`; values read from instance files ignore unknown codes and log them via `procs.log.warn`. Document it in docs/settings.md.
- [x] 1.2 Create `agent.retryDecision` via `procs.dev.createFunction`. It normalizes the error from `failure`, SSH transportFailure, or `code`, applies the never-retry list, the AND rule (allowed code and source not `retryable: false`), the provider overrides, clamping, backoff with jitter, and Retry-After (returning `parkUntil = now + min(retryAfterMs, 30 min)` above maxDelay). Add unit tests for each code class, the AND rule, overrides, Retry-After above and below maxDelay, the 30-minute park cap, and the retry limit.

## 2. Agent turns

- [x] 2.1 `agent.retrySchedule` delegates to `retryDecision`. Remove the fixed 5×1–16 s policy and the replaySafe/acceptance check. The payload carries the effective maxRetries and mode `normal`. The return type becomes `{ scheduled: boolean; parkUntil?: number }`; update every caller and test stub found via `code.callers` (stubs currently return `false`).
- [x] 2.2 `run.ts`: remove the `!receivedDelta`/replaySafe/acceptance gate and the stale "always mode" comment at `turns--`. Keep `continuationState`/`continuationKey` (they are set only after success); keep persisting interrupted thinking spans.
- [x] 2.3 `workerLoop.ts`: keep the manual-continuation terminal message for permanent SSH failures only; transient SSH transport goes through the policy.
- [x] 2.4 `run.ts` rethrows the model error with `parkUntil` attached; `workerLoop.ts` + parking: when the error carries `parkUntil`, park only this agent (reason `retry_after`, wake at parkUntil + jitter, `parked` event, keep the user's own wake, no `last_error`, reset the retry counter).
- [x] 2.5 `claudeStream.ts`: `PROXY_PROTOCOL` from an unparsable stream line becomes `retryable: true`; SOCKS `PROXY_PROTOCOL` stays non-retryable.
- [x] 2.6 `models/transport/validateTransport.ts` and the pre-dispatch checks in `models/transport/fetch.ts` (invalid timeout, URL, unknown transport, HTTPS required) set `retryable: false` on their `TRANSPORT` errors; network failures and timeouts during the request stay unflagged.

## 3. Compaction

- [x] 3.1 `$compaction_default.ts`: bounded retry (per model call) around `models.compact` and the summarization model calls, with a cancellable wait and a transient UI status (not persisted); overflow handling is unchanged.

## 4. Tests

- [x] 4.1 Run tests: `TRANSPORT` without failure (custom/Claude mocks), Codex `TRANSPORT`/`STREAM_INTERRUPTED`, Codex 503 `PROVIDER_ERROR` retried and in-stream `PROVIDER_ERROR` (`retryable: false`) not retried, `TRANSPORT` configuration errors ("Proxy not found") not retried while a connection reset is, partial-stream retry with partial text discarded, non-retryable codes, Stop during the retry wait, provider override counts, Retry-After parking and wake-up, a 2-day Retry-After parked for at most 30 minutes, Claude `PROXY_PROTOCOL` retry, and continuation state unchanged after a failed Codex request.
- [x] 4.2 Compaction retry tests: transient success, per-call limit, transient status shown and cleared, and cancellation during the wait.
- [x] 4.3 Regression: retryLifecycle, run.sshRetry, sshRecovery, parking, transientStream, and the compaction suites.

## 5. Verification

- [x] 5.1 Hot-reload, strictly validate each changed runtime function's docs, run one full project typecheck compared with the baseline, run `code.quality`, and run `openspec validate restore-model-retry-policy --strict`.
