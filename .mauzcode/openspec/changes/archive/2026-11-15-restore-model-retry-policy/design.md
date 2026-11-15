# Design

## Context

The retired legacy runtime decided retries in `llm.retryDecision` (reference only: `git show b2a2049e^:src/llm/retryDecision.ts`, `$setting_retryPolicy.ts`, `proxyFailure.ts`, `retryDelay.ts`), using stable codes and a configurable policy. The Models migration (78608ff8) replaced this with a fixed policy gated by SDK `replaySafe`/`acceptance`. Most transport failures are not classified in that vocabulary, so they bypass retry entirely.

## Goals / Non-Goals

Goals:
- Restore the old configurable, code-based retry behavior for agent turns and compaction.
- Retry transport/stream interruptions, including after partial output.

Non-goals:
- Restoring `src/llm` or reading/migrating `llm.retryPolicy`.
- An `always` (unbounded) mode.
- Changing the `models` SDK failure contract: the SDK keeps honestly reporting `acceptance: uncertain` and `replaySafe: false` where applicable.
- Retrying one-shot `models.call` callers outside agent turns and compaction.

## Decisions

### Policy setting `agent.retryPolicy`

A JSON setting declared in `src/agent/$setting_retryPolicy.ts`, global scope, with these defaults:

```
{ maxRetries: 5, initialDelayMs: 1000, maxDelayMs: 60000, jitterRatio: 0.2,
  retryableCodes: [RATE_LIMIT, RATE_LIMITED, THROTTLED, SERVER, PROVIDER_UNAVAILABLE, PROVIDER_ERROR, TIMEOUT,
    TRANSPORT, STREAM_INTERRUPTED, EMPTY_RESPONSE, SSH_TRANSPORT,
    PROXY_DNS, PROXY_CONNECT, PROXY_TIMEOUT, PROXY_CONNECTION_LOST, PROXY_PROTOCOL],
  providers: {} }
```

`providers` maps a connection's provider id (for example `claude`, `codex`, `custom`) to partial overrides that are merged over the global values. Numeric values are clamped to sane bounds, and invalid values fall back to the defaults. `retryableCodes` can only narrow the built-in allowed set; a code outside that set is never retried, even if configured. `PROVIDER_ERROR` is allowed because Codex (5xx/408) and Claude (`claudeWireFailure`: SERVER/TIMEOUT/EMPTY_RESPONSE) report transient failures with it and `retryable: true`; in-stream provider errors (`streamInterrupted`) carry `retryable: false` and are not retried.

The settings layer has no write-time warnings: `descriptor.validate` can only reject. The descriptor's `validate` therefore rejects unknown codes in `retryableCodes` with a clear error on `settings.set`. A value already stored in an instance settings file is read leniently: unknown codes are ignored and logged once through `procs.log.warn`.

### `agent.retryDecision({ error, provider, retry })`

This is a pure decision function that returns `{ retry, delayMs, maxRetries, parkUntil? }`. It normalizes the thrown error:

1. If `error.failure` (an SDK FailureInfo) is present, use `failure.code`, `failure.retryable` and `failure.retryAfterMs`. `replaySafe` and `acceptance` are deliberately ignored for generation.
2. Otherwise, if `error.transportFailure.kind === 'ssh_transport'`, a transient phase gives `SSH_TRANSPORT` (retryable) and the `permanent` phase gives no retry.
3. Otherwise, use `error.code` (`TRANSPORT`, `PROXY_*`) and `error.retryable`. Configuration errors raised before any request is sent (`validateTransport`: transport not allowed, missing/unknown proxy or SSH instance, unpinned host key; `transport/fetch` pre-dispatch checks: invalid timeout, URL, unknown transport, HTTPS required) are marked `retryable: false` at their source. Network failures and timeouts during the request keep no flag and stay retryable.
4. Anything else is not retried. Message text is never parsed.

A failure is retried only when BOTH hold: its code is in the effective `retryableCodes`, AND the source did not mark it non-retryable (`failure.retryable === false` or `error.retryable === false`). The provider knows details the code does not carry (for example `SERVER` with 501 Not Implemented).

`PROXY_PROTOCOL` is in the allowed set, but the retryable flag decides per source. `claudeStream` raises it when a stream line is not valid JSON, which is in practice a broken connection; it changes to `retryable: true`. SOCKS negotiation errors (`socksProxy.transportError`) keep `retryable: false`, so a misconfigured proxy is still not retried.

The following are never retried, whatever the settings say: `QUOTA_EXHAUSTED` (it keeps the existing parking path), `AUTH`, `INVALID_INPUT`, `OVERFLOW`, `CANCELLED`, `MODEL_DISABLED_BY_USER`, `CONNECTION_DISABLED`, `MODEL_NOT_SELECTED`, `PROXY_AUTH`, `PROXY_CONFIG`, `PROXY_TLS`, `PROXY_DENIED`, `SSH_PERMANENT`, and aborts.

The delay is `min(maxDelayMs, initialDelayMs·2^retry)` with ±jitter. A finite `retryAfterMs` is honored as a lower bound. If `retryAfterMs` exceeds `maxDelayMs`, the decision is `{ retry: false, parkUntil: now + min(retryAfterMs, 30 min) }` instead of retrying early. The 30-minute cap is a fixed constant (not a setting): after the wake the request is sent again; if it gets the same long hint it parks again for at most 30 minutes. There is no separate cap for `PROXY_*` codes; `maxRetries` (globally or per provider) applies to every code. The decision is also no retry when `retry >= maxRetries`.

### Agent turns

`agent.retrySchedule` keeps its row lock, lease/Stop checks, durable `llm_retry_attempt` counter and `llm_retry` event. It delegates eligibility and delay to `retryDecision`, and the payload carries the effective `maxRetries` and `mode: 'normal'`. Its return type changes from `boolean` to `{ scheduled: boolean; parkUntil?: number }`; every caller and test stub (found through `code.callers`) is updated. In `run.ts`, the gate `!receivedDelta && replaySafe && acceptance ∈ {none, rejected}` is removed. Before a replay, the partial stream is cleared (as now). The run-local `continuationState`/`continuationKey` are NOT reset: they are assigned only after a successful sample, so after a failure they still point to the last confirmed response and remain valid. Resetting them would resend the whole transcript and lose the prompt cache. A test asserts that a failed Codex request leaves the continuation state unchanged.

Thinking spans of a failed attempt are persisted as today (`status: 'interrupted'`, timing and public summary only). The partial text is discarded. Thinking summaries are never sent back to the model, so they do not affect the replay. Completed tool results remain durable, and only sampling is replayed. A successful sample resets the counter, as it does today.

### Retry-After beyond the maximum delay: parking

When `retryDecision` returns `parkUntil`, `retrySchedule` returns `{ scheduled: false, parkUntil }` without scheduling a retry. `run.ts` rethrows the model error with `parkUntil` attached, and workerLoop detects it. workerLoop then parks ONLY this agent, not the whole credential group: rate limits can be per-request or per-key, and a group park would stop agents that are not throttled. It reuses the existing parking mechanism (`scratchpad.parked` with reason `retry_after`, a durable wake at `parkUntil` plus small jitter, the `parked` event, preservation of a user's own wake, no `last_error`). The retry counter is reset. The run cursor does not advance, so the agent resumes the same work automatically after the wake. Stop clears the parking as usual. Compaction does not park: there the decision simply fails the compaction.

### SSH transport in workerLoop

The "automatic replay is unsafe; manual continuation required" terminal message remains only for permanent SSH failures. Transient SSH transport failures are retried in `run.ts` through the policy before they reach workerLoop.

### Compaction

`$compaction_default.ts` wraps the native `models.compact` call and each summarization model call in a bounded loop. The loop uses `retryDecision` and a cancellable wait that honors the compaction signal. Overflow handling in the summarization loop (trimming history) is unchanged, and `OVERFLOW` is not retried. The limit applies per model call: each `models.compact` call and each summarization call has its own `maxRetries` budget. No durable `llm_retry` events are emitted for compaction; instead, while waiting, a transient live status ("compaction: retry N/M in X s") is published to the agent's UI and cleared when the wait ends, succeeds or is cancelled. It is not written to the transcript.

## Risks / Trade-offs

- **Duplicate billing.** A replay after acceptance can bill twice. This is accepted: generation has no side effects, and the alternative is a failed turn.
- **Retry storms.** Many agents may retry against the same provider at once. Jitter and the bounded count mitigate this.
- **Divergence from the SDK flags.** The agent intentionally overrides `replaySafe` for generation only. The SDK contract (llm-provider-sdk) stays truthful for other consumers.
