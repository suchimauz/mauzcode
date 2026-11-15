# Proposal

## Why

Since the runtime moved to Models, automatic model retries almost never fire, and users see `Model transport failed` and similar errors end an agent turn. `agent/run.ts` replays a request only when the thrown error carries SDK `failure` metadata with `replaySafe: true`, acceptance `none`/`rejected`, and no streamed delta yet. In practice:

- `models/transport/fetch.ts` throws `Model transport failed` with only `code: TRANSPORT` and no `failure`, so custom/OpenAI (`streamFetch`) and Claude (`claudeRequest`) network errors are never retried.
- Claude stream breaks (`PROXY_CONNECTION_LOST` / `PROXY_PROTOCOL` from `claudeStream`) carry no `failure`, so they are never retried. `claudeStream` also marks `PROXY_PROTOCOL` (an unparsable stream line, in practice a cut connection) as `retryable: false`.
- Codex `TRANSPORT` and shared-protocol `STREAM_INTERRUPTED` report `replaySafe: false` or acceptance `uncertain`, so they are never retried.
- A break after partial output is never retried.
- The configurable legacy `llm.retryPolicy` was retired with nothing to replace it. `agent.retrySchedule` hardcodes 5 retries with a 1–16 s backoff, and model compaction has no retry at all.

Model generation has no side effects: tools run only after a complete response is received, and a partial response is discarded. Repeating an interrupted generation only costs tokens. Stopping the turn costs the user's work.

## What Changes

- Add an agent-owned, configurable retry policy setting `agent.retryPolicy`. Its fields and defaults follow the retired `llm.retryPolicy`: `maxRetries`, `initialDelayMs`, `maxDelayMs`, `jitterRatio`, `retryableCodes`, and `providers` overrides. Only normal (bounded) mode is supported; there is no `always` mode.
- Add `agent.retryDecision`. It classifies any thrown model error by stable machine code (SDK `failure.code`, transport `code`, SSH transport phase) and computes the delay. It never parses message text. A failure is retried only if its code is allowed by the policy AND its source did not mark it non-retryable.
- Agent turns retry eligible failures even after partial output and regardless of SDK `replaySafe`/`acceptance`. The partial stream is discarded before the replay; the continuation state from the last successful response is kept.
- A Retry-After longer than the policy `maxDelayMs` parks the single agent until that moment (at most 30 minutes) instead of failing the turn; it resumes automatically.
- `claudeStream` reports `PROXY_PROTOCOL` as retryable, so a stream cut in the middle of a line is retried like `PROXY_CONNECTION_LOST`.
- Transport configuration errors (`validateTransport` and the pre-dispatch checks in `transport/fetch`) are marked `retryable: false`, so a misconfigured connection fails at once instead of being retried.
- `PROVIDER_ERROR` is in the default retryable codes; the source's `retryable` flag decides per failure.
- Model compaction (native `models.compact` and summarization calls) retries eligible failures under the same policy with a cancellable in-memory wait and a transient UI status.
- Legacy `src/llm` is not restored. Old `llm.retryPolicy` values are neither read nor migrated.

## Capabilities

### New Capabilities

### Modified Capabilities

- `agent-model-inference`: configurable code-based retry policy for agent turns, including retry after partial output; compaction retries.

## Impact

`src/agent/$setting_retryPolicy.ts` (new), `src/agent/retryDecision.ts` (new), `src/agent/retrySchedule.ts`, `src/agent/run.ts`, `src/agent/workerLoop.ts`, `src/agent/parkOnUsageLimit.ts` (or a sibling single-agent park), `src/models/provider/claude/claudeStream.ts`, `src/models/transport/validateTransport.ts`, `src/models/transport/fetch.ts`, `src/compaction/$compaction_default.ts`, agent/compaction tests, and test stubs of `agent.retrySchedule` (its return type changes to `{ scheduled, parkUntil? }`). The `models` SDK failure contract (`replaySafe`, `acceptance`) is unchanged. The `llm_retry` event shape and `RetryRow` UI are unchanged; `maxRetries` now reflects the policy and `mode` stays `normal`. There are no database migrations.
