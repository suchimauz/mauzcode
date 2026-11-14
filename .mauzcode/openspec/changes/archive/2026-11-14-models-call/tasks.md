## 1. Types and capabilities

- [x] 1.1 Add `temperature`, `maxTokens`, `responseFormat`, `providerOptions` to `types.models.StreamRequest`; add `types.models.ResponseFormat`, `CallRequest`, `CallResult`
- [x] 1.2 Add `sampling` and `structuredOutput` to `ProviderDefinition.capabilities` and the loader's known flags

## 2. Core call

- [x] 2.1 Add pure `models.inference.retryDecision` with unit tests
- [x] 2.2 Add `models.inference.call` (validation, option gating, `ignored`, retries, deadline, sessionId) and root `models.call` facade entry
- [x] 2.3 Gate `sampling`/`structuredOutput` fields in `models.inference.stream`

## 3. Structured output

- [x] 3.1 Add `models.inference.structured` (fallback instruction and normalization) and wire it into the call
- [x] 3.2 Tests: fences, required/additionalProperties violations, native vs fallback

## 4. Protocol streaming

- [x] 4.1 Add `stream` to `types.models.Protocol` and a shared HTTP failure helper
- [x] 4.2 Implement `stream` for `openai-chat`, `openai-responses`, `anthropic`, `gemini`
- [x] 4.3 Add `stream` and capabilities to the `custom` provider; reject `providerOptions`
- [x] 4.4 Protocol stream and custom stream tests with local HTTP fixtures

## 5. Claude and Codex

- [x] 5.1 Claude: declare `sampling`, apply `maxTokens`/`temperature`; reject `providerOptions`
- [x] 5.2 Codex: declare `structuredOutput`, map to `text.format`; reject `providerOptions`
- [x] 5.3 Run existing Claude/Codex/compatibility tests unchanged

## 6. Finish

- [x] 6.1 Update facade baseline and compatibility tests to 14 entries
- [x] 6.2 Update `docs/models-providers.md`
- [x] 6.3 Typecheck, code quality, `openspec validate models-call --strict`
