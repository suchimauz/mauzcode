# Tasks

## 0. Prerequisite

- [x] 0.1 `extend-models-sdk-for-anthropic-routes` is implemented and its tests pass

## 1. MiniMax M Plan provider

- [x] 1.1 `src/models/$modelProvider_minimax-coding.ts`: label, description, icon `brand:minimax`, priceVendor and catalog `minimax`, fields `apiKey`/`serviceTier`, transports, `capabilities: { reasoning, structuredOutput }` (no sampling), adapters
- [x] 1.2 `provider/minimaxCoding/headers`: `x-api-key`; missing key fails without network
- [x] 1.3 `provider/minimaxCoding/reasoning`: family detection and profile `minimax-2026-11` (Flash, M3, none)
- [x] 1.4 `provider/minimaxCoding/route`: base, `serverMaxTokens`, `replayReasoning`, `service_tier` except Flash
- [x] 1.5 `provider/minimaxCoding/listModels`: all valid ids, `display_name`, catalogue order, reasoning per family, safe errors
- [x] 1.6 `provider/minimaxCoding/usage`: `general` entry, two windows, plan `M Plan`, unavailable on unrecognized
- [x] 1.7 `provider/minimaxCoding/test`: quota endpoint, auth for 401/403/1004/2057
- [x] 1.8 `provider/minimaxCoding/failure`: code table, `resetAt` only from a cached window at 100% with a future reset
- [x] 1.9 (optional for the first release; the local estimate works without it) `provider/minimaxCoding/countTokens`: `/v1/messages/count_tokens`, 10 s timeout
- [x] 1.10 Safe-message redaction everywhere; check logo, model mark, display names, tokenizer and SSH policy for `minimax-coding`

## 2. Tests

- [x] 2.1 Provider fixtures (port legacy models/usage tests): headers, missing key, discovery (duplicates, invalid ids, unknown family, HTTP error), usage (`general`, windows, `M Plan`, unrecognized, out-of-range), test (200, 401, 200+1004, 2057), redaction
- [x] 2.2 Wire: Flash auto/xhigh/off→low, M3 on/off without effort, M2/unknown without controls, tier except Flash, no `max_tokens`/`temperature`, `ignored` in `models.call`, images, no `cache_control`, cache-read usage, final `message_delta`
- [x] 2.3 Replay end to end on MiniMax: Flash tool loop sends the signed block back; switch to M3 sends none
- [x] 2.4 Failures: 2056 → quota with resetAt, 2056 with stale usage → quota without resetAt, 1002/429 → throttled, 2068 → unsupported, unknown body → status rules, no body text in messages
- [x] 2.5 Counting: MiniMax count request body matches inference, timeout returns null
- [x] 2.6 Run `architecture`, `selfContained`, `providers`, `protocolRoute`, `protocolStream`, `zaiCoding`, `claudeProtocol` and agent run tests

## 3. Validation

- [ ] 3.1 Hot-reload, `runtime.docs.validate` per changed function, one `procs.dev.typecheck`
- [ ] 3.2 Manual check with a real M Plan key: connection, test, models, usage windows, Flash tool loop with replay, M3 on/off, count_tokens, a usage-limit or rate-limit error if reproducible
