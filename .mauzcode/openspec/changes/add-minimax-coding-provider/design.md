# Design

## Context

Models providers either stream themselves (`codex`, `claude`) or declare `route` and let `models.inference.streamRoute` stream through a shared protocol (`zai-coding`, `opencode-go`, `custom`). Sources:

- Legacy reference (behaviour, not code to copy): `legacy/src/llm/resolveEndpoint.ts`, `streamAnthropic.ts` (MiniMax block), `reasoningCapabilities.ts`, `minimaxCodingModels.ts`, `minimaxCodingUsage.ts` and their tests.
- MiniMax documentation, read in this change (platform.minimax.io/docs `*.md`): Anthropic SDK + Create Message reference, M Plan intro/FAQ/usage, prompt caching, error codes, models list.

Key documented facts that differ from or extend legacy:

- The Anthropic endpoint supports only `MiniMax-M3.1-Flash` and `MiniMax-M3` (1M context, image and video input); M Plan includes M3.1-Flash; tiers Go/Explore/Build (and legacy Token Plan).
- `thinking`: Flash always thinks (`disabled` → 400, code 2013); M3 is off by default and on with `adaptive`. `output_config.effort` exists for Flash only: `low|medium|high|xhigh|max`, default `max`.
- `service_tier` `standard|priority`, unsupported on Flash. `temperature`, `top_p`, `top_k`, `stop_sequences` are ignored (temperature always 1). `tool_choice` only `auto`.
- `max_tokens` includes thinking; too small yields `stop_reason: "max_tokens"` with no text.
- Thinking blocks (with `signature`) must be returned unchanged in later turns, especially with tool use.
- `POST /anthropic/v1/messages/count_tokens` gives exact input tokens.
- Caching is automatic; `cache_control` is not supported; `usage.input_tokens` is new tokens, `cache_read_input_tokens` hits.
- Errors: 1002/1039/1041/1045/2045–2047/2062 rate-type, 2056/2067 usage limit, 2061/2068 model not in plan, 1004/2057 key problems; HTTP 429 covers several of them.

Gaps in the shared stack, closed by `extend-models-sdk-for-anthropic-routes`: `anthropic/stream` cannot send adaptive thinking, always sends `max_tokens`, ignores body fields, does not capture `signature_delta`/thinking blocks, and `toAnthropicMessages` cannot replay them; `streamFetch` classifies only by HTTP status; there is no provider token counting.

Depends on `extend-models-sdk-for-anthropic-routes`.

Live check with an M Plan key (2026-11-16):

- `/v1/models` lists M3.1-Flash, M3 and M2.x (M2.7, M2.5, M2.1, M2, `-highspeed`); M2.7 answers on the M Plan key and always thinks.
- Remains: one `general` entry, fields as in legacy, no tier name. A wrong key returns HTTP 200 with `base_resp.status_code` 1004.
- Messages: wrong key → HTTP 401 `authentication_error`; Flash with `thinking: disabled` → 400 code 2013; M3 without `thinking` does not think, with `adaptive` it does; `service_tier: "priority"` on M3 is echoed in `usage.service_tier`; `cache_control` is accepted and ignored; caching is automatic (`cache_read_input_tokens` > 0).
- Stream: `thinking_delta` then one `signature_delta`, then text; a too small `max_tokens` (20) ends with `stop_reason: "max_tokens"` and only a thinking block.
- `count_tokens` works (`{"input_tokens": N}`).
- No `max_tokens` (2026-11-17): M3 and M3.1-Flash answer HTTP 200 with `stop_reason: "end_turn"`, both non-streaming and streaming (`message_stop` arrives), so `serverMaxTokens` is safe.
- Replay: full signed blocks are counted as input; dropped, corrupted or unsigned blocks and blocks from another model are accepted silently (corrupted ones apparently discarded). The origin check stays as a safety rule, not as an upstream requirement.

## Goals / Non-Goals

**Goals:**
- A core `minimax-coding` provider on the shared `anthropic` protocol, matching the documentation.
- Keep the reasoning chain on tool loops, classify usage limits correctly, measure context exactly.

**Non-Goals:**
- China endpoint, pay-as-you-go and OpenAI-compatible endpoints, server `web_search`, video input.
- Importing legacy settings; removing legacy code.

## Decisions

1. **Core provider `minimax-coding`.** `src/models/$modelProvider_minimax-coding.ts` dispatching to `src/models/provider/minimaxCoding/*`, like `zaiCoding`. Id matches legacy, logo mapping, SSH policy entry (`sshProvider/policy.ts` already lists the four MiniMax destinations) and tokenizer rule.
2. **Fields.** `apiKey` (secret, required) and `serviceTier` (`standard` | `priority`, default `standard`) on the connection, agreed with the owner: providers keep settings on connections.
3. **Routing.** `anthropic`, base `https://api.minimax.io/anthropic`, header `x-api-key` only. Route returns `serverMaxTokens: true`, `replayReasoning: true`, and `body: { service_tier }` except for `MiniMax-M3.1-Flash*`.
4. **No sampling (agreed).** MiniMax ignores temperature, so `capabilities.sampling` is not declared: `models.inference.call` already reports `temperature`/`maxTokens` in `ignored`, `models.stream` drops them. `serverMaxTokens` then only removes the protocol's 4096 default. Rejected alternative: keep sampling and drop the caller budget silently.
5. **Discovery lists everything (agreed).** All valid ids from `/v1/models`, catalogue order, `display_name` as label. Reasoning attached per family by `provider/minimaxCoding/reasoning` (`source: "profile"`, `profile: "minimax-2026-11"`); unknown families get none. `contextWindow` comes from the catalogue sections (`modelsDev: ["minimax"]`), not hard-coded.
6. **Reasoning profiles (agreed: M3 on/off, xhigh native).**
   - Flash: `supported [low, medium, high, xhigh]`, no default, `adaptive: true`; no wire map (names are native). `auto` sends nothing → MiniMax default `max`. MiniMax's `max` is reachable only through `auto`; an SDK level above `xhigh` is not added.
   - M3: `supported [off, high]`, `default off`, `adaptive: true`, `effort: false`. `high` is the "thinking on" level.
   - The SDK's nearest-level rule (lower-or-equal first, else the lowest higher) maps `off` on Flash to `low`, and `low`/`medium` on M3 to `off`, `xhigh` on M3 to `high`; documented in the model help.
7. **SDK features used.** Adaptive/effort flags, anthropic body fields, `serverMaxTokens`, signed-block capture/storage/replay with origin check, `classifyFailure`, `countTokens` — all specified and implemented in `extend-models-sdk-for-anthropic-routes`. This change only declares and uses them.
8. **Failure classification.** `provider/minimaxCoding/failure` (the SDK `classifyFailure`) reads `base_resp.status_code` or `error.type`/code; for 2056/2067 it takes `resetAt` from the cached usage of the connection, no extra request: the window reported at 100% (five-hour first, then weekly) whose reset time is still in the future. If no cached window is at 100% or its reset time has passed, the cache is stale and `resetAt` is omitted; the failure stays `QUOTA_EXHAUSTED` and the core's default backoff applies. Messages are fixed strings per code.
9. **Token counting.** `provider/minimaxCoding/countTokens` (the SDK `countTokens`) builds the same body as inference (via the anthropic conversion helpers) and POSTing `/v1/messages/count_tokens` with a 10 s timeout.
10. **Images and cache.** `toAnthropicMessages` already emits image blocks and adds `cache_control` only when `cacheableMessageCount` is passed; `anthropic/stream` does not pass it, so nothing changes — covered by tests. Pricing uses `cache_read_tokens` from usage with the `minimax` catalogue.
11. **Usage tier.** The remains response has no tier field (checked with a live key and in the official `mmx-cli` 1.0.29, which also shows no tier), so `plan` is always `M Plan`. From `mmx-cli`: an entry with both statuses 3 and zero totals means "not in plan".

## Risks / Trade-offs

- [Quota endpoint undocumented] → strict parsing; unrecognized → unavailable, never zero; fixtures.
- [Stored signed blocks grow transcripts] → only tool-call turns; size cap owned by `extend-models-sdk-for-anthropic-routes` (200 000 serialized characters), oversize blocks are not stored (replay then simply omits them).
- [Signature replay to a different model fails upstream] → origin check per connection and model.
- [Classifier reads failed bodies] → bounded read, JSON only, never copied into messages.
- [count_tokens adds a request] → only when usage is stale, cached, 10 s timeout, never blocks the turn.
- [Nearest-level mapping on M3 hides medium/low] → help text; selector shows only off/high.
- [New optional SDK fields] → all optional; existing providers unchanged; public-contract baseline updated.

## Migration Plan

Additive. Provider appears after reload; the owner creates a connection and enters the key. Existing transcripts have no stored blocks and behave as before. Rollback: remove provider files and optional fields; stored `reasoning_blocks` are ignored by every protocol.
