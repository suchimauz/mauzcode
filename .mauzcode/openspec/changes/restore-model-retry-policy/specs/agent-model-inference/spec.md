## MODIFIED Requirements

### Requirement: Failure and quota handling
Turn failures SHALL be classified by stable machine codes from the failure information produced by the model connection, or from structured transport error codes when no failure information is attached. Message text MUST NOT be parsed. On `QUOTA_EXHAUSTED` the agent MUST park until the reported reset time, or a bounded default when no reset time is reported. Failures whose code is retryable under the configurable `agent.retryPolicy` setting MUST be retried with exponential backoff and jitter, up to the policy's maximum retry count. Per-provider overrides MUST apply by the connection's provider id. Retry eligibility for model generation MUST NOT depend on SDK `replaySafe` or `acceptance`, and an eligible failure MUST be retried even after partial output was streamed. In that case the partial output MUST be discarded before replay, while the continuation state of the last successful response MUST be kept. A failure MUST be retried only when its code is allowed by the policy and its source did not mark it non-retryable. A Retry-After delay MUST be honored; when it exceeds the policy maximum delay, the agent MUST be parked until the Retry-After moment, capped at 30 minutes, and resume automatically, without a retry before that moment. Transport configuration errors raised before a request is sent MUST be marked non-retryable at their source. Failures that are not retryable MUST stop the turn without retrying.

#### Scenario: Quota exhausted with reset time
- **WHEN** a turn fails with `QUOTA_EXHAUSTED` and a reset time
- **THEN** the agent is parked until that time and resumes automatically afterwards

#### Scenario: Model disabled mid-session
- **WHEN** the owner disables the agent's model and the agent runs again
- **THEN** the turn fails with `MODEL_DISABLED_BY_USER` and is not retried

#### Scenario: Transport failure without SDK failure metadata
- **WHEN** a model request fails with a transport error carrying code `TRANSPORT` and no failure information
- **THEN** a durable retry event is recorded and the request is retried after the policy backoff

#### Scenario: Stream interrupted after partial output
- **WHEN** a streamed response breaks with a retryable code after text deltas were received
- **THEN** the partial text is not persisted, the continuation state of the last successful response is kept, and the request is retried

#### Scenario: Claude stream line cannot be parsed
- **WHEN** a Claude stream fails with `PROXY_PROTOCOL` because a stream line is not valid JSON
- **THEN** the request is retried like `PROXY_CONNECTION_LOST`

#### Scenario: Source marks a retryable code non-retryable
- **WHEN** a failure has code `SERVER` but the provider reports `retryable: false`
- **THEN** no retry is scheduled

#### Scenario: Retry-After beyond maximum delay
- **WHEN** a throttled failure reports a Retry-After longer than the policy `maxDelayMs`
- **THEN** only this agent is parked until the Retry-After moment, no retry is sent before it, no error is recorded, and the agent resumes the same work automatically after the wake

#### Scenario: Retry-After longer than the park cap
- **WHEN** a throttled failure reports a Retry-After of 2 days
- **THEN** the agent is parked for at most 30 minutes and then sends the request again

#### Scenario: Transport configuration error
- **WHEN** a model request fails with `TRANSPORT` because the configured proxy is not found
- **THEN** no retry is scheduled and the turn stops with the error

#### Scenario: Transient provider error
- **WHEN** Codex answers HTTP 503 and the failure is `PROVIDER_ERROR` with `retryable: true`
- **THEN** the request is retried after the policy backoff

#### Scenario: Non-retryable failure
- **WHEN** a turn fails with `AUTH` or `INVALID_INPUT`
- **THEN** the turn stops and no retry is scheduled

#### Scenario: Provider override
- **WHEN** `agent.retryPolicy.providers.codex.maxRetries` is 2 and a codex turn keeps failing with `TRANSPORT`
- **THEN** exactly 2 retries are scheduled before the turn stops

#### Scenario: Retry limit exhausted
- **WHEN** a retryable failure persists past the policy `maxRetries`
- **THEN** the turn stops with the last error

#### Scenario: Counter reset after success
- **WHEN** a sample succeeds after one or more retries
- **THEN** the retry counter is reset to zero

## ADDED Requirements

### Requirement: Compaction retry
Native compaction through `models.compact` and the model calls used for summarization compaction SHALL retry failures that are eligible under `agent.retryPolicy`, using the same codes, limits and delays as agent turns. The retry limit MUST apply per model call. The wait between attempts MUST end immediately when the compaction is cancelled. Overflow failures MUST keep their existing handling and MUST NOT be retried as transient failures.

#### Scenario: Transient compaction failure
- **WHEN** native compaction fails once with `TRANSPORT` and then succeeds
- **THEN** compaction completes with the successful result

#### Scenario: Cancelled during retry wait
- **WHEN** compaction is cancelled while waiting for a retry
- **THEN** the wait ends immediately and no further model request is sent

### Requirement: Compaction retry status
While compaction waits for a retry, a transient status with the attempt number and remaining delay SHALL be shown in the agent UI. It MUST be cleared when the wait ends and MUST NOT be written to the transcript.

#### Scenario: Status during compaction retry wait
- **WHEN** compaction waits before retry 1 of 5
- **THEN** the agent UI shows the retry status until the next attempt starts, and the transcript contains no retry entry
