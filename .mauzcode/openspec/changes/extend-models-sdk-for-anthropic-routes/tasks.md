# Tasks

Deliver sections 1, 2 and 3 as separate steps, each with its part of section 4 (see design, decision 9).

## 1. Reasoning flags and Anthropic request

- [ ] 1.1 Add optional `adaptive` and `effort` to `types.models.ReasoningCapabilities`, `ModelInfo.reasoning` and `ReasoningResolution`; validate and propagate them in `models/inference/resolveReasoning`
- [ ] 1.2 Add optional `serverMaxTokens` and `origin` to `ProtocolRoute`/`ProtocolEndpoint`; per-protocol owned body keys and forwarding in `models/inference/streamRoute`
- [ ] 1.3 `models/protocol/anthropic/stream`: adaptive thinking, effort-less reasoning, no `max_tokens` with `serverMaxTokens`, merge `endpoint.body`

## 2. Reasoning block replay

- [ ] 2.1 `anthropic/stream`: capture `thinking`/`redacted_thinking` blocks with `signature_delta`; add optional `reasoningBlocks` to `types.models.StreamResult`
- [ ] 2.2 `agent/run`: store `reasoning_blocks` and `reasoning_origin` on the first tool call of tool-call turns, with the size cap
- [ ] 2.3 `anthropic/toAnthropicMessages`: replay blocks with matching origin when `replayReasoning`; drop them otherwise
- [ ] 2.4 `openaiChat`, `openaiResponses`, `gemini` conversions ignore `reasoning_blocks` without failing

## 3. Failures and token counting

- [ ] 3.1 `ProviderDefinition.classifyFailure`; bounded failed-body parse in `protocol/common/streamFetch` with status fallback, wired through `streamRoute`
- [ ] 3.2 `ProviderDefinition.countTokens` and public `models.countTokens` returning `number | null`
- [ ] 3.3 `agent/contextTokens`: use `models.countTokens` when provider usage is stale, cache keyed by transcript index, connection, model and an instructions+tools hash, fall back to the estimate

## 4. Tests

- [ ] 4.1 Fixture route provider covering every spec scenario: count cache invalidation on changed tools, flags, body merge and reserved keys, `serverMaxTokens`, capture/store/replay/origin mismatch, other protocols ignoring blocks, classifier hit/miss/throw, counting hit/null/no provider
- [ ] 4.2 Regression: `zaiCoding`, `providers`, `protocolRoute`, `protocolStream`, `claudeProtocol`, agent run, `architecture`, `selfContained`; update `public-contract` baseline

## 5. Validation

- [ ] 5.1 Hot-reload, `runtime.docs.validate` per changed function, one `procs.dev.typecheck`
