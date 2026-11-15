# Design

## Context

Route providers (`zai-coding`, `opencode-go`, `custom`) stream through shared protocols via `models.inference.streamRoute`. The previous Z.ai change added route `body` and `replayReasoning` for `openai-chat` only. The shared `anthropic` protocol (`models/protocol/anthropic/stream`) today: sends `output_config.effort` or `thinking: disabled`, always sends `max_tokens` (default 4096), ignores body fields, keeps only joined thinking text, and `toAnthropicMessages` cannot replay signed blocks. `protocol/common/streamFetch` classifies failures by HTTP status only. There is no provider token counting; `agent/contextTokens` uses provider usage or a calibrated local estimate.

The first consumer is MiniMax M Plan (`add-minimax-coding-provider`, depends on this change); its documented behaviour drove every item here.

## Goals / Non-Goals

**Goals:** generic, optional SDK additions; existing providers unchanged; each feature testable with a fixture route provider.

**Non-Goals:** any concrete provider; replay for `claude` (it streams itself); Gemini/Responses replay of foreign blocks.

## Decisions

1. **Reasoning flags.** `ReasoningCapabilities`/`ModelInfo.reasoning` gain `adaptive?: boolean` and `effort?: boolean` (default true). `resolveReasoning` validates both as booleans and copies them to `ReasoningResolution` for a concrete applied level other than `off`. `anthropic/stream`: `adaptive` → `thinking: {type: "adaptive"}`; `output_config.effort` unless `effort === false`. Other protocols ignore both.
2. **Anthropic body fields.** `streamRoute` uses an owned-key set per protocol (`openai-chat` unchanged; `anthropic`: `model, messages, system, stream, tools, max_tokens, temperature, thinking, output_config`). `anthropic/stream` merges `endpoint.body` after its own fields.
3. **Server-chosen budget.** `ProtocolRoute.serverMaxTokens?: boolean` forwarded on `ProtocolEndpoint`; with it `anthropic/stream` sends no `max_tokens`. Providers that also want callers' budgets reported as ignored simply do not declare `sampling` (existing behaviour of `models.call`).
4. **Block capture.** `anthropic/stream` tracks `content_block_start` of type `thinking`/`redacted_thinking` by index, appends `thinking_delta` and `signature_delta`, and returns optional `StreamResult.reasoningBlocks: { type: "thinking" | "redacted_thinking"; thinking?: string; signature?: string; data?: string }[]` in order.
5. **Block storage.** `agent/run` stores them on the first tool call beside `reasoning_content` as `reasoning_blocks` plus `reasoning_origin: { connectionId, model }`, only on tool-call turns, skipped when the serialized blocks exceed 200 000 characters.
6. **Block replay.** `streamRoute` sets `ProtocolEndpoint.origin = { connectionId, model }`. `toAnthropicMessages({ replayReasoning, origin })` prepends stored blocks to that assistant message only with replay on and a matching origin, and only blocks with a signature (thinking) or data (redacted). Signatures are model-bound, hence the check. `openai-chat`, `openai-responses`, `gemini` drop `reasoning_blocks`; Gemini must not throw on it.
7. **Failure classification.** `ProviderDefinition.classifyFailure?(ctx, conn, { status, body, model })` → `{ code, classification, retryable, retryAfterMs?, resetAt?, message } | null`. `streamRoute` passes it as a callback to the protocol's `streamFetch`; on a failed response `streamFetch` reads at most 16 KiB, parses JSON (else `null`), calls it, catches errors, and falls back to status rules. The message comes from the classifier's fixed strings, never from the body.
8. **Token counting.** `ProviderDefinition.countTokens?(ctx, conn, { model, messages, instructions?, tools? })` → `number`. Public `models.countTokens({ connectionId, model, messages, instructions?, tools?, timeoutMs? })` → `number | null`: checks enabled state, returns `null` without network when unsupported, never throws on provider failure. `agent/contextTokens` calls it only when provider usage is not fresh, caches the result per agent, connection, model, last message index and a hash of the instructions and tool schemas (a changed system prompt or tool set must not reuse an old count), and reports source `provider`.

9. **Delivery order.** Three independently mergeable steps, each with its tests: (a) tasks 1.x — reasoning flags, body fields, `serverMaxTokens`; (b) tasks 2.x — block capture, storage and replay, the riskiest part because it changes stored transcripts; (c) tasks 3.x — failure classification and token counting. MiniMax can start after (a) and (b); (c) improves it but is not required for a working provider.

## Risks / Trade-offs

- [Stored blocks grow transcripts] → tool-call turns only, size cap.
- [Replay to a different model fails upstream] → origin check.
- [Reading failed bodies] → bounded, JSON only, never copied to messages.
- [Extra counting request] → only on stale usage, cached, timeout, never fails the turn.
- [Public contract grows] → optional fields only; baseline updated.

## Migration Plan

Additive; nothing changes until a provider opts in. Rollback: remove the optional fields; stored `reasoning_blocks` are ignored by every protocol.
