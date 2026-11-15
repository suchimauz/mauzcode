# agent-model-inference Specification

## Purpose
Guarantee that agent turns, context compaction, one-shot model calls and reasoning selection reach providers only through stored model connections, with failures and quota limits reported in the models failure vocabulary.

## Requirements

### Requirement: Agent turns stream through model connections
An agent turn SHALL resolve the agent's model route and stream the request through the resolved connection, passing instructions, transcript, tool definitions in the provider-neutral models format, reasoning preference, session id and cancellation signal. Streamed text, reasoning and tool-call deltas MUST reach the UI as before. A failed resolution MUST fail the turn with the resolution error and no provider request.

#### Scenario: Turn with a tool call
- **GIVEN** an agent on `claude/2yfl55fsh:claude-opus-5-5`
- **WHEN** the agent runs a turn whose answer calls a tool
- **THEN** the request is sent through that claude connection with the tools converted by the claude provider to its wire format, and the tool call is recorded in the transcript

#### Scenario: Agent on a legacy route
- **GIVEN** an agent whose model is a legacy route
- **WHEN** the agent runs a turn
- **THEN** the turn fails with `LEGACY_ROUTE`, is not retried, and no provider request is sent

### Requirement: Provider-declared system preamble
When route resolution reports a system preamble, the agent request SHALL place it first in the system instructions, separated from the rest of the prompt and not duplicated in it. Agent code MUST NOT decide the preamble or tool dialect by provider id; a newly registered provider MUST work without agent changes.

#### Scenario: Claude agent
- **WHEN** an agent on a `claude` route sends a turn
- **THEN** the system text is the Claude Code identity line declared by the claude provider and the remaining prompt follows in the transcript

#### Scenario: Provider without a preamble
- **WHEN** an agent on a `custom` route sends a turn
- **THEN** no preamble is added

### Requirement: Failure and quota handling
Turn failures SHALL be classified by stable machine codes from the model connection's failure information, or from structured transport error codes when none is attached. Message text MUST NOT be parsed. `QUOTA_EXHAUSTED` parks the agent until the reported reset time, or a bounded default. A failure that is not retryable, or whose code `agent.retryPolicy` does not allow, MUST stop the turn without retrying.

#### Scenario: Retry eligibility
- **WHEN** a failure's code is allowed by `agent.retryPolicy` and its source did not mark it non-retryable
- **THEN** it is retried with the policy's backoff, jitter, maximum retry count and per-provider overrides

#### Scenario: Retry of an interrupted generation
- **WHEN** a streamed response breaks with a retryable code after text deltas were received
- **THEN** the request is retried like a clean failure, because retry eligibility MUST NOT depend on SDK `replaySafe` or `acceptance`

#### Scenario: Partial output during a retry
- **WHEN** a retry follows a failure that had already streamed partial output
- **THEN** that partial output is discarded before the replay, while the continuation state of the last successful response is kept

#### Scenario: Retry-After beyond maximum delay
- **WHEN** a throttled failure reports a Retry-After longer than the policy `maxDelayMs`
- **THEN** only this agent is parked until the Retry-After moment, capped at 30 minutes, no retry is sent before it, no error is recorded, and the agent resumes the same work automatically after the wake

#### Scenario: Quota exhausted with reset time
- **WHEN** a turn fails with `QUOTA_EXHAUSTED` and a reset time
- **THEN** the agent is parked until that time and resumes automatically afterwards

#### Scenario: Model disabled mid-session
- **WHEN** the owner disables the agent's model and the agent runs again
- **THEN** the turn fails with `MODEL_DISABLED_BY_USER` and is not retried

#### Scenario: Transport failure without SDK failure metadata
- **WHEN** a model request fails with a transport error carrying code `TRANSPORT` and no failure information
- **THEN** a durable retry event is recorded and the request is retried after the policy backoff

#### Scenario: Claude stream line cannot be parsed
- **WHEN** a Claude stream fails with `PROXY_PROTOCOL` because a stream line is not valid JSON
- **THEN** the request is retried like `PROXY_CONNECTION_LOST`

#### Scenario: Source marks a retryable code non-retryable
- **WHEN** a failure has code `SERVER` but the provider reports `retryable: false`
- **THEN** no retry is scheduled

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

### Requirement: Reasoning selection from the model catalogue
Reasoning levels offered for an agent's model SHALL come from the model catalogue of its connection, and the agent's chosen reasoning preference MUST be passed to the connection, which applies its normalization. Selecting a level the model does not support MUST fail without changing the agent.

#### Scenario: Supported level
- **WHEN** the owner sets reasoning `high` on a model whose catalogue lists `high`
- **THEN** the agent stores `high` and the next request carries it

#### Scenario: Unsupported level
- **WHEN** the owner sets a level the model does not list
- **THEN** the request fails with a validation error and the agent's reasoning is unchanged

### Requirement: Model changes validated against connections
Changing an agent's model SHALL accept only routes that resolve to an enabled connection and enabled model. The route MUST be stored in canonical form.

#### Scenario: Switch to a disabled model
- **WHEN** the owner switches an agent to a model disabled on its connection
- **THEN** the change fails with `MODEL_DISABLED_BY_USER` and the agent keeps its model

### Requirement: Context compaction through model connections
Compaction SHALL use the connection's native compaction when route resolution reports that the provider supports it, and otherwise a summarizing one-shot call through the same connection. The choice MUST NOT depend on provider ids. The context window used for compaction thresholds MUST come from the model catalogue, with a documented default when the catalogue does not report one.

#### Scenario: Codex agent compacts
- **WHEN** a codex agent exceeds its compaction threshold
- **THEN** the context is compacted through the codex connection's native compaction

#### Scenario: Custom agent compacts
- **WHEN** an agent on a `custom` connection exceeds its threshold
- **THEN** a summary is produced by a one-shot call through that connection

### Requirement: One-shot calls through model connections
Every non-agent model request in the product SHALL use the models one-shot call with a model route. This covers goal checks, summarize, text autocomplete, web search answers and page reading, and documentation/plugin localization. A route that fails to resolve MUST fail the call with the resolution error. Calls MUST NOT fall back to another model.

#### Scenario: Goal check
- **WHEN** a goal completion check runs on the agent's model
- **THEN** the request is sent through that model's connection

#### Scenario: Primary model fails
- **WHEN** a one-shot call fails with a quota error after its same-connection retries
- **THEN** the error is returned to the caller and no other model is tried

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

### Requirement: Reasoning kept on tool-call turns
When an agent turn ends with tool calls and the stream returned non-empty reasoning, the agent SHALL store that reasoning as `reasoning_content` on the first tool call of the persisted assistant message, so it survives saves and forks and protocols that request replay can send it back. Turns without tool calls or without reasoning SHALL be stored unchanged.

#### Scenario: Tool-call turn with reasoning
- **WHEN** a turn streams reasoning `inspect config` and calls two tools
- **THEN** the persisted assistant message's first tool call carries `reasoning_content: "inspect config"` and the second carries none

#### Scenario: Final answer with reasoning
- **WHEN** a turn streams reasoning and answers with text only
- **THEN** the persisted assistant message has no `reasoning_content`

#### Scenario: Forked session
- **GIVEN** a parent session whose assistant tool-call turn stored reasoning
- **WHEN** a fork continues the conversation
- **THEN** the effective transcript keeps that stored reasoning
