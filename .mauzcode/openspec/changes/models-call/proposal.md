## Why

One-shot (non-agent) LLM requests still go through `llm.call`, which selects provider behaviour through long chains of `if (provider === …)` and string model routes. The `models` module is the future primary inference stack with a provider SDK and shared protocol strategies, but it only offers `models.stream` and `models.compact`, so there is no way to make a one-shot request through it yet.

## What Changes

- Add `models.call({ connectionId, model, user, system?, temperature?, maxTokens?, reasoningEffort?, responseFormat?, providerOptions?, sessionId?, timeoutMs?, signal? })` to the public model facade (now 14 entries). It is implemented in the core over the provider's `stream` operation, so providers need no new operation.
- Add `models.inference.call` (implementation) and `models.inference.retryDecision` (pure retry policy): bounded retries on the same connection only for retryable, replay-safe failures that the upstream did not accept.
- Add core structured output: native `responseFormat` for providers that declare it, an instruction fallback otherwise, and a single normalization step (fence stripping, JSON parsing, basic schema checks) failing with `INVALID_OUTPUT`.
- Extend `StreamRequest` with optional `temperature`, `maxTokens`, `responseFormat` and `providerOptions`; extend `ProviderDefinition.capabilities` with `sampling` and `structuredOutput` flags. Parameters a provider does not declare are dropped and reported in `CallResult.ignored`.
- Add `stream` to the shared `Protocol` strategy for `openai-chat`, `openai-responses`, `anthropic` and `gemini`; the built-in `custom` provider gains `stream` that delegates to the selected protocol strategy without branching on the protocol id.
- Claude declares `sampling` (output token budget and temperature when thinking is not enabled); Codex declares `structuredOutput` through `text.format` (its subscription API accepts neither temperature nor output limits).
- `llm.call` and its callers are unchanged; switching callers is a later change.

## Capabilities

### New Capabilities

- `llm-model-call`: the one-shot model call contract — addressing, validation, option capability gating, retries on the same connection and structured output normalization.

### Modified Capabilities

- `llm-provider-sdk`: optional inference operations accept the new optional request fields, and providers can opt into `sampling` and `structuredOutput`.
- `llm-model-protocols`: every shared protocol additionally implements streaming generation.
- `llm-custom-provider`: the custom provider supports streaming inference through the selected protocol.
- `models-module-boundaries`: the minimal public facade includes `models.call`.

## Impact

- Code: new `src/models/call.ts`, `src/models/inference/{call,retryDecision,structured}.ts`, new types `CallRequest`, `CallResult`, `ResponseFormat`; new `src/models/protocol/<id>/stream.ts` for four protocols; changes to `Protocol.ts`, `StreamRequest.ts`, `ProviderDefinition.ts`, `$loader_modelProvider.ts`, `$modelProvider_{custom,claude,codex}.ts`, `provider/claude/claudeStream.ts`, `provider/codex/codexStream.ts`.
- Tests: new `call.test.ts`, protocol stream tests, custom stream test, facade baseline updated to 14 names. No paid calls.
- Docs: `docs/models-providers.md`.
- No change to `llm.*`, HTTP API, UI, storage or migrations.
