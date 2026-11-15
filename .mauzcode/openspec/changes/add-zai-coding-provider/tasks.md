# Tasks

## 1. SDK and shared protocol

- [x] 1.1 Add optional `body` and `replayReasoning` to `types.models.ProtocolRoute` and `types.models.ProtocolEndpoint`, with JSDoc
- [x] 1.2 In `models/inference/streamRoute`, validate `body` as a JSON object, reject protocol-owned keys with `INVALID_INPUT` before any request, and forward `body`/`replayReasoning` on the endpoint
- [x] 1.3 In `models/protocol/openaiChat/stream`, merge endpoint body fields after protocol fields without overriding them
- [x] 1.4 In `models/protocol/openaiChat/toOpenAIMessages`, add an opt-in replay of the first tool call's non-empty `reasoning_content` onto assistant tool-call wire messages; pass the flag from `stream`
- [x] 1.5 In `models/protocol/gemini/toGeminiContents`, ignore `reasoning_content` instead of throwing; keep rejecting `thought_signature`
- [x] 1.6 Confirm `anthropic` and `openai-responses` conversions ignore `reasoning_content`

## 2. Agent turn

- [x] 2.1 In `agent/run`, store non-empty streamed `thinking` as `reasoning_content` on the first tool call of the persisted assistant message when the turn has tool calls

## 3. Z.ai Coding Plan provider

- [x] 3.1 Create `src/models/$modelProvider_zai-coding.ts` (label, description, icon `brand:zai`, priceVendor `zai`, fields `apiKey` and `protocol`, transports, `capabilities: { reasoning, sampling, structuredOutput }`, test/listModels/usage/route adapters)
- [x] 3.2 `provider/zaiCoding/headers`: Bearer auth for `openai-chat`; Bearer plus `x-api-key` for `anthropic`; fail without network when the key is missing
- [x] 3.3 `provider/zaiCoding/route`: base URL per connection protocol; for GLM-5.3 models on `openai-chat` with applied reasoning other than `auto` add `thinking: {type: "enabled"}` and `replayReasoning: true`
- [x] 3.4 `provider/zaiCoding/listModels`: GET Coding Plan models, id validation, de-duplication, catalogue order; attach GLM-5.3 reasoning metadata only on `openai-chat` connections
- [x] 3.5 `provider/zaiCoding/usage`: parse quota limit response into `fiveHour`/`weekly` account windows and plan; unrecognized → unavailable
- [x] 3.6 `provider/zaiCoding/test`: quota endpoint check with authentication/unavailable classification
- [x] 3.7 Ensure all errors pass through safe-message redaction and never include the key or upstream body
- [x] 3.8 Check `frontendBridge.modelMark`, display names and tokenizer resolve `zai-coding` routes; fix gaps only if any

## 4. Tests

- [x] 4.1 Provider tests with fixtures: route/headers per protocol, discovery (duplicates, invalid ids, HTTP error), usage (both windows, unrecognized, out-of-range), test (200, 401), key redaction, missing key
- [x] 4.2 Reasoning tests: default `xhigh` → `max`, `medium` → `low`, non-GLM model without reasoning, `anthropic` without thinking/replay
- [x] 4.3 Protocol tests: body merge, reserved key rejection, replay on/off, Gemini tolerance and `thought_signature` rejection, unchanged bodies without new fields
- [x] 4.4 Agent run test: reasoning stored only on the first tool call of tool-call turns
- [x] 4.5 Run existing `architecture`, `selfContained`, `providers`, `protocolRoute`, `protocolStream` and `public-contract` baseline tests; update the baseline for the new optional fields

## 5. Validation and docs

- [x] 5.1 Hot-reload changed namespaces, run `runtime.docs.validate` on each changed function and one `procs.dev.typecheck`
- [x] 5.2 Manually verify with a real Coding Plan key: create connection, test, refresh models, usage windows, one GLM-5.3 tool-call turn on `openai-chat` and one turn on `anthropic`
