## Context

`llm.call` (444 lines) handles one-shot requests by branching on the provider string for authentication, transport, body fields, reasoning, retries and fallbacks. The `models` stack already resolves connections, enforces enabled checks (`models.inference.assertModelEnabled`, `checkInput`), resolves reasoning and dispatches to `ProviderDefinition.stream` through the provider registry. Custom connections choose a wire protocol through the closed `models.protocol.get` registry, which today covers only discovery and probing.

## Goals / Non-Goals

**Goals:** one-shot inference in `models` with no provider-id branching; reuse of `stream` as the single provider inference operation; protocol strategies own wire formats; same-connection retries; structured output.

**Non-Goals:** switching `llm.call` callers or `agent.run`; cross-connection or cross-model fallback; migrating legacy providers (OpenRouter, Groq, OpenCode, …); HTTP API, UI or storage changes.

## Decisions

1. **Call over stream, no `ProviderDefinition.call`.** Every provider already implements streaming; a second operation would duplicate wire code per provider. `models.inference.call` builds a `StreamRequest` with one user message and calls `models.inference.stream` (keeping one copy of enabled/capability/reasoning checks). Cost: buffering a stream instead of a JSON response, negligible for short calls.
2. **Capability flags gate options in the core.** `sampling` and `structuredOutput` join `capabilities`. The core removes undeclared fields from the request and lists them in `ignored`, so providers never see options they did not opt into and callers can observe the drop. Unknown flags stay rejected by the loader.
3. **`providerOptions` is opaque to the core.** It is the escape hatch for provider-specific knobs; validation belongs to the provider (custom/claude/codex accept none today and fail `INVALID_INPUT` for any key, before network).
4. **Retry policy as a pure function.** `models.inference.retryDecision({ failure, attempt })` → `{ retry, delayMs }` using the existing `FailureInfo` fields (`retryable`, `replaySafe`, `acceptance`, `retryAfterMs`). The call loop only applies the decision against the deadline and signal. Max 3 attempts; delays 500/2000 ms. Errors without `failure` are not retried (unknown replay safety).
5. **Structured output normalization in one place.** `models.inference.structured` provides `instruction(format)` and `normalize(text, format)`. Natively supporting providers still pass through `normalize`, so all callers get the same contract. Error messages never include response text.
6. **Protocol strategies gain `stream`.** `Protocol.stream(ctx, { fetch, endpoint, request, signal })` lives in `protocol/<id>/stream.ts`, uses `models.transport.parseSSE` and `models.inference.failure` for HTTP errors (classification from status: 401/403 auth, 429 throttled + `retry-after`, 400/404/422 invalid_input, ≥500 provider retryable; acceptance `rejected` for HTTP errors, `uncertain` for an interrupted stream). Message conversion is per protocol: OpenAI chat messages pass through; Responses converts to `input` items; Anthropic reuses `llm.toAnthropicMessages`; Gemini converts to `contents` (tool calls/results as `functionCall`/`functionResponse`). The custom provider's `stream` is `protocol.stream` with `customEndpoint` — no `if` on protocol id.
7. **Claude/Codex adjustments are additive.** Claude declares `sampling`: `maxTokens` overrides the 16384 default; `temperature` is sent only when thinking is not enabled (Anthropic rejects it with thinking), otherwise dropped. Codex declares `structuredOutput`: `responseFormat` maps to `text.format`; it does not declare `sampling` because the ChatGPT Codex backend rejects `max_output_tokens`/`temperature`. Requests without the new fields are byte-identical to today.

## Risks / Trade-offs

- [Gemini/Anthropic tool conversions are new code] → covered by SSE fixture tests; custom provider gets agent use only after this lands.
- [Claude silently drops temperature with thinking] → documented; `reasoningEffort: "off"` makes it apply.
- [No fallback chain] → callers needing fallback keep using `llm.call` until a follow-up change defines connection-based fallback settings.

## Migration Plan

Additive only. Deploy by hot-reloading the `models` namespace and regenerating types; rollback is removing the new files and flags. Callers move in a later change.
