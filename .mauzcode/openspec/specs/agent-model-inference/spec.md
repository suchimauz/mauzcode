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

When an agent turn ends with tool calls and the stream returned reasoning, the agent SHALL store it on the first tool call of the persisted assistant message, so it survives saves and forks and replay-capable protocols can send it back. Native reasoning blocks SHALL be stored on the same tool call together with the connection and model that produced them. Turns without tool calls or reasoning SHALL be stored unchanged.

#### Scenario: Tool-call turn with reasoning
- **WHEN** a turn streams reasoning `inspect config` and calls two tools
- **THEN** the persisted assistant message's first tool call carries `reasoning_content: "inspect config"` and the second carries none

#### Scenario: Tool-call turn with signed blocks
- **WHEN** an `anthropic` route turn with replay on connection `c1` returns one signed thinking block and calls a tool
- **THEN** the first tool call also stores that block with origin connection `c1` and the model id

#### Scenario: Final answer with reasoning
- **WHEN** a turn streams reasoning and answers with text only
- **THEN** the persisted assistant message has no `reasoning_content` and no stored blocks

#### Scenario: Forked session
- **GIVEN** a parent session whose assistant tool-call turn stored reasoning
- **WHEN** a fork continues the conversation
- **THEN** the effective transcript keeps that stored reasoning and blocks

### Requirement: Exact context measurement
When no fresh provider-reported prompt usage exists for the agent's next request and its connection offers exact token counting, context measurement for compaction thresholds and context indicators SHALL use the provider count instead of the local estimate. A failed or unavailable count SHALL fall back to the calibrated local estimate without failing the turn, and the count SHALL be cached only while the transcript, connection, model, instructions and tools are unchanged.

#### Scenario: Measurement after compaction
- **GIVEN** an agent whose connection offers exact counting and whose last provider usage predates the active compaction checkpoint
- **WHEN** the context is measured
- **THEN** the provider token count is used and reported as provider-sourced

#### Scenario: Changed tools invalidate the cached count
- **GIVEN** a cached provider count for the current transcript
- **WHEN** the instructions or the tool set change without new messages
- **THEN** the context is counted again instead of reusing the cached count

#### Scenario: Counting unavailable
- **WHEN** the count request fails
- **THEN** the calibrated local estimate is used and the turn continues

### Requirement: Route-aware controls in the chat model picker
The chat SHALL offer speed and response verbosity next to model selection only when the selected route advertises an alternative; it MUST distinguish these controls from reasoning and indicate that accelerated tiers may consume additional quota. Choices MUST be keyboard accessible and derived from the cached catalogue without network access. The owner MUST only be able to select currently supported overrides.

#### Scenario: Only actionable choices
- **WHEN** the owner opens the picker for a route with Fast and `max` reasoning but no verbosity support
- **THEN** the chat offers Standard/Fast with a quota notice, lists `max` separately under reasoning, and does not show Ultrafast or a verbosity selector

#### Scenario: Owner chooses the next response's settings
- **WHEN** the owner selects an advertised speed and verbosity for the chat
- **THEN** the next chat model request uses both settings; a request already dispatched is not changed or replayed

### Requirement: Chat-local response preferences
Speed and verbosity SHALL be scoped to chat, connection, authenticated Codex account and native model. Reopening that route SHALL restore valid choices. Logout, account replacement or loss of verified identity MUST invalidate them and visibly report the reset once per affected chat. New chats, forks and children MUST NOT inherit choices. Without a saved choice, speed SHALL be Standard and verbosity model-default.

#### Scenario: Same model name, different account
- **WHEN** a chat using Fast on connection A switches to the same slug on B or a different model on A with no saved choices
- **THEN** it uses defaults; returning to the original route after reload restores Fast if still supported

#### Scenario: Same connection, different subscription
- **GIVEN** a chat selected Fast and high verbosity for account A and the same connection signs into B, which also advertises both choices
- **WHEN** the chat sends its first request for B without making a fresh selection
- **THEN** it sends neither `service_tier` nor `text.verbosity`, even if B's catalogue has already refreshed
- **AND** saving from A's stale picker is rejected; only a new selection for B can enable either override

#### Scenario: Logout versus routine renewal
- **WHEN** the account token is renewed without logout or a change of account
- **THEN** valid selections survive; logging out and signing back in instead starts at defaults even for the same account

#### Scenario: New chat, fork or delegate
- **WHEN** another chat, fork or child is created from a conversation with explicit speed or verbosity
- **THEN** the new session starts with Standard and model-default verbosity even if it uses the same connection and model

### Requirement: Invalidate removed choices on catalogue publication
Publishing a successful catalogue refresh SHALL clear any saved overrides it no longer supports in every affected chat, including closed chats. Supported choices and choices on other routes MUST be preserved. A later refresh MUST NOT restore a cleared choice without a new explicit selection.

#### Scenario: Fast disappears and returns while the chat is closed
- **GIVEN** a closed chat has saved Fast and high verbosity
- **WHEN** a successful refresh removes Fast but retains high verbosity, and another successful refresh restores Fast before the chat reopens
- **THEN** the reopened chat reports the reset to Standard once, and its first request sends high verbosity without `service_tier`
- **AND** Fast remains unselected until the owner selects it again

#### Scenario: Reject a stale explicit edit
- **WHEN** the owner explicitly submits a value no longer advertised, including through a stale picker
- **THEN** the edit is rejected without storing the new value; the chat can still send using its valid preferences or defaults

### Requirement: Consent applies only to the user-facing chat response
Only requests generating the existing chat's assistant response, including tool continuations, SHALL use saved speed and verbosity. Background work, file summaries, compaction and independent SDK calls MUST NOT inherit them from a session ID. The new-session draft SHALL NOT offer or persist these controls.

#### Scenario: Same correlation ID, different callers
- **WHEN** a chat with Fast generates a reply, summarizes a file internally and makes an independent SDK call with the chat's session ID
- **THEN** only the reply uses saved Fast; the other calls use defaults unless the independent caller supplies its own valid options

#### Scenario: First message submitted from a draft
- **WHEN** the owner creates a chat and submits its first message in one action
- **THEN** that request uses Standard and model-default verbosity; controls become available in the created chat and never carry over from a previous draft

### Requirement: Unsent requests respect current consent and support
The last admission check before a Codex request is handed to transport SHALL order dispatch against catalogue publication, account changes and saved preference edits. Saved overrides no longer authorized at admission MUST be reconciled individually. An explicit unsupported SDK override MUST fail without inference, never silently downgrade. Admission MUST NOT replay a request already handed to transport.

#### Scenario: Fast is revoked after preparation
- **GIVEN** a chat request and an explicit SDK request were prepared for Fast and high
- **WHEN** a same-generation refresh removing Fast publishes before either request is handed to transport
- **THEN** the chat sends high without a tier and records one reset; the SDK request fails as INVALID_INPUT with no inference request
- **AND** a concurrent stale save cannot restore Fast after that publication

### Requirement: Owner-controlled edits and reset notices
Only the chat owner SHALL read saved overrides and pending notices, update choices or acknowledge notices. Browser mutations MUST require CSRF protection. Writes MUST reject obsolete route, account or preference revisions even when the submitted choice is supported. Each reset SHALL create one durable notice, not a transient broadcast; background reads MUST NOT acknowledge it.

#### Scenario: A stale tab tries to re-enable paid speed
- **WHEN** the owner chooses Standard and another tab submits Fast from the preceding revision, even if no preference row remains
- **THEN** the stale edit fails; Standard is retained until a fresh owner selection

#### Scenario: Notice survives absence and acknowledgment is idempotent
- **WHEN** a background projection reads a pending notice, delivery is interrupted, or another participant opens the chat
- **THEN** it remains pending for the owner; the other participant cannot read the choices or notice, set overrides or acknowledge it
- **AND** the active owner view acknowledges only after presentation; repeated reads use the same notice ID, and after acknowledgment neither tab nor reload presents it as new

### Requirement: Strictly offline control discovery in the picker
Opening the picker SHALL initiate no external request, including background label, pricing, credential or provider fetches. Local bridge reads are permitted. Missing external data MUST use local names/IDs or an empty state with a path to explicit catalogue refresh. This MUST NOT disable scheduled refresh or normal refresh in Models settings.

#### Scenario: All external caches are cold
- **WHEN** the owner opens the picker without a model list or external label snapshot, including with an unresolved current route or manual ID
- **THEN** there are zero outgoing external requests; any local choices remain usable and the owner can reach explicit refresh without it running automatically

### Requirement: Provider diagnostics on failed model calls
For every core, custom and plugin model route, a terminal inference failure SHALL identify the provider and failure stage, retain the observed HTTP status if known, and include safely extractable upstream code, reason and message in the provider's own words. Local classifications SHALL remain distinct from upstream statements and keep their existing retry semantics.

#### Scenario: Antigravity rejects the request
- **WHEN** Google returns HTTP 400 with RPC status `INVALID_ARGUMENT` and message `Unknown field: example` for an Antigravity agent turn
- **THEN** the operator sees Antigravity, HTTP 400, `INVALID_ARGUMENT` and `Unknown field: example` together, not just a generic bad-request label

#### Scenario: A different provider rejects a call
- **WHEN** a plugin model route returns HTTP 503 with a safe provider message but no provider code and the retry policy is exhausted
- **THEN** the final failure shows that provider, HTTP 503 and its wording without inventing a provider code; the same diagnostic rules apply whether or not the adapter supplies a classifier

#### Scenario: Provider error after stream acceptance
- **WHEN** a model returns a successful HTTP handshake and subsequently emits a structured error frame with code and message
- **THEN** the diagnostic identifies an in-stream failure and includes its safe code and message; the handshake is not reported as an HTTP rejection

#### Scenario: Response without a usable explanation
- **WHEN** an upstream rejection has an empty, unrecognized or unsafe error payload
- **THEN** the diagnostic reports the known status and indicates that no safe provider explanation is available; it does not substitute raw body data

#### Scenario: No upstream response
- **WHEN** a connection fails before a provider response arrives
- **THEN** the diagnostic identifies a transport failure before response and the safe transport code if known, without attributing a status or explanation to the provider

### Requirement: Safe persistence and readback of model errors
The affected agent's owner SHALL be able to read the same bounded, redacted diagnostic in the failed run's history after reloading the chat. Only diagnostic fields SHALL be retained, not raw payloads, request content, credentials or personal verification links. Provider text SHALL be displayed as untrusted text.

#### Scenario: Readback after a later successful turn
- **WHEN** the operator reloads the chat after a terminal failure and a later successful turn
- **THEN** the earlier run still shows its diagnostic, independently of the agent's current status or last-error field

#### Scenario: Provider echoes sensitive or oversized data
- **WHEN** an error contains credentials, a verification URL, quoted prompt content, markup, or an oversized message
- **THEN** only safe bounded diagnostic content reaches storage, logs and the chat; markup cannot execute, and unsafe excerpts are withheld rather than stored as raw data

#### Scenario: Recovery without a terminal failure
- **WHEN** a retry succeeds or the existing quota policy parks the agent without recording an error
- **THEN** the diagnostic feature does not create a terminal error or change retries, quota handling or replay decisions
