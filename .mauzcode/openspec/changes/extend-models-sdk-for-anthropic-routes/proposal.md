# Proposal

## Why

Protocol-route providers can reach Anthropic-compatible gateways only with the features the shared `anthropic` protocol already has. Gateways such as the MiniMax M Plan (next change `add-minimax-coding-provider`) need more: adaptive thinking with or without an effort value, extra body fields (`service_tier`), a server-chosen output budget, signed thinking blocks returned unchanged on tool loops, failure codes carried in the error body, and exact token counting. Each of these is generic, so it belongs in the Models SDK and the shared protocol, not in one provider.

## What Changes

- Reasoning capabilities gain optional `adaptive` (send the native adaptive-thinking switch) and `effort` (`false` = on/off only, no effort value).
- `anthropic` protocol: adaptive thinking, effort-less reasoning, provider body fields with anthropic-owned keys reserved, and a route flag `serverMaxTokens` that sends no `max_tokens`.
- Native reasoning replay on `anthropic`: the protocol captures signed `thinking`/`redacted_thinking` blocks, agent turns store them on tool-call turns with their connection and model, and routes with `replayReasoning` get them back unchanged for the same connection and model only. Other protocols ignore them.
- Provider failure classification: a route provider may classify a failed response from its bounded, parsed error body (e.g. usage limit vs rate limit) with a reset time; status-based rules stay the fallback.
- Optional exact token counting: providers may declare `countTokens`; a public `models.countTokens` returns a count or `null`; agent context measurement uses it when provider usage is stale.
- No provider is added and existing providers keep their behavior: every new field is optional.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `llm-provider-sdk`: adaptive/effort reasoning flags, anthropic-owned body keys, anthropic replay, server-chosen output budget, provider failure classification, optional token counting.
- `llm-model-protocols`: anthropic adaptive thinking, body fields, output budget, reasoning block capture and replay; other protocols ignore stored blocks.
- `agent-model-inference`: tool-call turns keep native reasoning blocks with their origin; exact context measurement.

## Impact

- Modified: `types.models.{ReasoningCapabilities, ReasoningResolution, ModelInfo, ProtocolRoute, ProtocolEndpoint, StreamResult, ProviderDefinition}`, `models/inference/{resolveReasoning, streamRoute}`, `models/protocol/common/streamFetch`, `models/protocol/anthropic/{stream, toAnthropicMessages}`, `models/protocol/{openaiChat, openaiResponses, gemini}` conversions, new `models.countTokens`, `agent/run`, `agent/contextTokens`, public-contract baseline.
- Tests use a fixture route provider; no external service.
