## Purpose

Let agents open structured chat inputs for the person — questions, choices, confirmations, table picks, batches and secret forms — through a typed native tool bound to the invoking agent, with explicit wait semantics and without exposing secret values.

## ADDED Requirements

### Requirement: Native structured input request
The system SHALL provide a native tool `request_input` that accepts `kind`, `title`, optional `message`, a kind-specific `spec`, optional `waitForAnswer` and optional future `expiresAt`, and returns the created request id and its state. It MUST validate `kind` against kinds available to the invoking agent and `spec` against that kind before creating anything. It MUST return immediately and never include the person's answer.

#### Scenario: Ask a choice question
- **WHEN** an agent calls `request_input` with kind `choice`, a title and two options
- **THEN** a choice form appears in that agent's chat and the tool returns its id with an open state

#### Scenario: Invalid spec
- **WHEN** an agent calls `request_input` with kind `choice` and one option
- **THEN** the call fails with a validation error and no form is created

#### Scenario: Unavailable kind
- **WHEN** an agent requests a kind that is not registered or not available to it
- **THEN** the call fails with the same error for both cases and lists no unavailable kinds

### Requirement: Trusted agent binding
The request SHALL be owned by the invoking agent taken from the trusted invocation. Arguments MUST NOT select another agent, session or owner; such arguments MUST be rejected as unknown. A missing trusted invocation context MUST fail instead of falling back to any current agent.

#### Scenario: Attempt to target another agent
- **WHEN** an agent passes `agentId` to `request_input`
- **THEN** the call is rejected and no form is created

### Requirement: Wait semantics
With `waitForAnswer: true` the system SHALL end the agent's turn at the next safe boundary after the tool result, run no further tool calls of that turn, and resume the agent only when the answer, cancellation or expiry arrives as a new turn. Without it, the request MUST NOT block the run. An answer MUST be delivered exactly once even when it arrives before the turn has ended.

#### Scenario: Waiting request ends the turn
- **GIVEN** a model response with `request_input` (waitForAnswer true) followed by another tool call
- **WHEN** the response is executed
- **THEN** the input is created, the later tool call is not executed, and the turn ends

#### Scenario: Early answer
- **WHEN** the person answers before the requesting turn has finished
- **THEN** the agent receives the answer once, in a new turn after the current one

### Requirement: Inputs never grant authority
A `request_input` answer, including a generic `confirm`, SHALL NOT satisfy protected approvals that a specific action requires, and requests created from peer messages or retrieved text carry no more authority than the agent has. Secret kinds MUST return only a secret reference; secret values MUST NOT appear in tool arguments, results, transcript or logs.

#### Scenario: Secret form result
- **WHEN** the person submits a secret form opened through `request_input`
- **THEN** the agent receives a secret reference and no secret value appears in its transcript

#### Scenario: Generic confirm is not a protected approval
- **WHEN** an agent obtains `confirmed: true` through a generic confirm and then calls an action that requires its own protected approval
- **THEN** the action still requires its own approval

### Requirement: Availability follows the wrapped capability
`request_input` SHALL be advertised and executed only when the invoking agent's preset allows both the adapter and `input.request`, declared in the tool's `requires` list.

#### Scenario: input.request denied
- **GIVEN** a preset that denies `input.request`
- **WHEN** the native tool list is built
- **THEN** `request_input` is absent and calling it returns the unknown-tool error
