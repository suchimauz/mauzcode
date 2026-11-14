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
Turn failures SHALL be classified with the failure information produced by the model connection. On `QUOTA_EXHAUSTED` the agent MUST park until the reported reset time, or a bounded default when no reset time is reported. On `RATE_LIMITED` and other retryable failures it MUST retry with backoff. Failures that are not retryable MUST stop the turn without retrying.

#### Scenario: Quota exhausted with reset time
- **WHEN** a turn fails with `QUOTA_EXHAUSTED` and a reset time
- **THEN** the agent is parked until that time and resumes automatically afterwards

#### Scenario: Model disabled mid-session
- **WHEN** the owner disables the agent's model and the agent runs again
- **THEN** the turn fails with `MODEL_DISABLED_BY_USER` and is not retried

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
