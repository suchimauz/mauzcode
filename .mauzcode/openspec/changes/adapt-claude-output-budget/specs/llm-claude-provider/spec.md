## MODIFIED Requirements

### Requirement: Thinking and output limits
Streaming requests SHALL set `stream: true` and select `max_tokens` by model unless the caller sets it explicitly. For reasoning effort `auto` no thinking field SHALL be sent. For low, medium, high or xhigh the request SHALL send `thinking: { type: "adaptive" }` and `output_config.effort` with xhigh mapped to `max`. For `off` the request SHALL send `thinking: { type: "disabled" }`, except for Claude 5 models (Opus, Sonnet, Haiku and Fable), where no thinking field is sent.

#### Scenario: High effort
- **WHEN** reasoning effort is `xhigh`
- **THEN** the body has adaptive thinking and effort `max`

#### Scenario: Off on Claude 5
- **WHEN** reasoning effort is `off` for a Claude 5 Opus, Sonnet, Haiku or Fable model
- **THEN** the body has no `disabled` thinking field

#### Scenario: Model defaults
- **WHEN** the caller omits an output limit
- **THEN** Fable 5.2, Opus 5.5, Sonnet 5.5 and Haiku 5.5 start at 128000 tokens; unrecognized model IDs start at 64000

#### Scenario: Caller limit
- **WHEN** the caller supplies `maxTokens`
- **THEN** the adapter sends that value unchanged and does not negotiate a replacement

## ADDED Requirements

### Requirement: Claude output limit negotiation
The provider SHALL reduce an automatic budget only after an HTTP 400 explicitly rejects `max_tokens` as too large, before streaming starts. It SHALL try only strictly smaller budgets from 64000, 32000 and 16384, once each, leaving all other request fields unchanged. Other failures and exhausted negotiation SHALL retain normal error classification and redaction.

#### Scenario: Step down only as needed
- **WHEN** Fable's 128000 and 64000 budgets are rejected as too large and 32000 is accepted
- **THEN** exactly those three requests are sent and the accepted stream is consumed once

#### Scenario: No duplicate or irrelevant retries
- **WHEN** a 64000 default is rejected as too large at each step
- **THEN** the provider tries 32000 then 16384 and surfaces the final rejection without resending any budget

#### Scenario: Fail without renegotiating
- **WHEN** a request fails with a different status, an unrelated invalid parameter, a cancellation or an error after acceptance
- **THEN** the output budget mechanism does not replay the request

### Requirement: Bounded Claude agent recovery before tool use
For consecutive Claude replies stopped by the output token limit before any tool call, the agent SHALL request a shorter reply at most twice, without dispatching tools or delivering partial text as a final answer. A third cutoff SHALL surface the output-limit error. An uninterrupted reply resets the consecutive count. This recovery SHALL NOT apply to other providers or batches containing tool calls.

#### Scenario: Retry and complete
- **WHEN** a Claude reply is truncated with no tools and the next reply completes
- **THEN** the agent requests a smaller response and delivers only the completed reply as final

#### Scenario: Bounded retries
- **WHEN** three successive Claude replies end at the length limit before tool use
- **THEN** the third ends the run with the output-limit error and no fourth request

#### Scenario: No execution of truncated tools
- **WHEN** a Claude response ends at the length limit with tool calls, including a valid-looking call
- **THEN** no tool in that batch executes and the no-tool retry path is not used
