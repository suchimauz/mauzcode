# Proposal

## Why

The MiniMax M Plan (MiniMax's coding subscription) is only reachable through the retired legacy `llm` module (`legacy/src/llm/minimaxCoding*`, `streamAnthropic`, `reasoningCapabilities`), which the runtime no longer loads. Users of the new Models screen cannot connect it, see its quota or control MiniMax reasoning. The legacy code and the current MiniMax documentation (platform.minimax.io/docs: Anthropic-compatible API, M Plan, prompt caching, error codes) describe the endpoints, quota format and model rules, so the provider can be rebuilt on the Models SDK through the shared `anthropic` protocol instead of a bespoke stream. The documentation also shows gaps the legacy code had: thinking blocks must be returned unchanged on later turns, `MiniMax-M3` has no effort control, `temperature` is ignored, and usage-limit errors are distinguishable from rate limits.

## What Changes

Depends on `extend-models-sdk-for-anthropic-routes`, which adds the generic SDK and `anthropic` protocol features this provider uses.

- New core Models provider `minimax-coding` ("MiniMax M Plan") in `src/models`: required M Plan API key, admission tier `serviceTier` (`standard` default or `priority`) per connection, direct, SOCKS and SSH-tunnel transports.
- Inference through a protocol route on the shared `anthropic` protocol at `https://api.minimax.io/anthropic`, key in `x-api-key`. No fallback to the pay-as-you-go API.
- Model discovery lists everything the M Plan models endpoint returns; reasoning rules are applied only to known families.
- Reasoning per documentation: `MiniMax-M3.1-Flash` always thinks with levels `low`…`xhigh` sent natively (auto lets MiniMax use its own default, `max`); `MiniMax-M3` only switches thinking on or off, without effort; other models get no controls. `thinking: {type: "disabled"}` is never sent.
- Thinking blocks with their signatures are stored on tool-call turns and replayed unchanged to the same connection and model, as MiniMax requires.
- No sampling: MiniMax ignores `temperature` and counts thinking in `max_tokens`, so the provider does not declare sampling; callers' `temperature`/`maxTokens` are reported as ignored and the protocol sends no default `max_tokens`.
- Five-hour and weekly quota windows from the token-plan remains endpoint; connection test on the same endpoint.
- MiniMax failures classified from the error body: usage limit → quota exhausted (with reset time), rate/concurrency limits → throttled, model not in plan → unsupported, non-M-Plan key → auth.
- Exact token counting through MiniMax `count_tokens` for context measurement when no fresh provider usage exists.
- Image input and automatic prompt caching are verified and accounted (cache-read tokens, no `cache_control`).
- Out of scope: China endpoint (`api.minimaxi.com`), pay-as-you-go and OpenAI-compatible endpoints, server-side `web_search`, video input, importing legacy settings, deleting legacy code.

## Capabilities

### New Capabilities
- `llm-minimax-coding-provider`: MiniMax M Plan connection, routing, admission tier, discovery, reasoning, thinking replay, quota usage, failure classification, token counting, media and caching behavior.

### Modified Capabilities

None (SDK changes are in `extend-models-sdk-for-anthropic-routes`).

## Impact

- New: `src/models/$modelProvider_minimax-coding.ts`, `src/models/provider/minimaxCoding/*` (route, headers, reasoning, listModels, usage, test, failure, countTokens) with tests and fixtures.
- Uses SDK features from `extend-models-sdk-for-anthropic-routes`: reasoning `adaptive`/`effort`, anthropic body fields, `serverMaxTokens`, anthropic reasoning replay, `classifyFailure`, `countTokens`.
- Reused: MiniMax logo (`brand:minimax`), MiniMax tokenizer, display names, price vendor `minimax`, existing SSH policy entry for `minimax-coding`.
- External: HTTPS to `api.minimax.io` and `www.minimax.io` only, through the connection's saved transport.
