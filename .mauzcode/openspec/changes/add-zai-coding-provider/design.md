# Design

## Context

Models providers either stream themselves (`codex`, `claude`) or declare `route` and let `models.inference.streamRoute` stream through one of the four shared protocols (`opencode-go`, and `custom` internally). The legacy Z.ai implementation is reference only: `legacy/src/llm/zaiCodingModels.ts` (discovery), `zaiCodingUsage.ts` (quota), `resolveEndpoint.ts` (base URL), `streamOpenAI.ts` (thinking body and `reasoning_content` replay) and `reasoningCapabilities.ts` (GLM-5.3 levels).

Two legacy behaviors have no SDK equivalent today: `openai-chat` sends only `reasoning_effort` (no extra fields such as `thinking`), and `toOpenAIMessages` drops reasoning, so it cannot be replayed on tool-call turns. `agent/run` stores assistant turns without reasoning, and `gemini/toGeminiContents` rejects a tool call carrying `reasoning_content`.

## Goals / Non-Goals

**Goals:**
- A core `zai-coding` provider usable from the Models screen with the user's Coding Plan key.
- Reuse shared protocols through `route`; no provider-owned stream.
- Legacy parity for discovery, quota windows and GLM-5.3 reasoning on `openai-chat`.
- Small, generic SDK additions that any route provider can use.

**Non-Goals:**
- Importing the legacy key, SSH instance setting or agent routes (handled separately later).
- China endpoint, pay-as-you-go API, reasoning controls or thinking signatures on `anthropic`.
- Removing or changing legacy code.

## Decisions

1. **Core provider, not a plugin.** `src/models/$modelProvider_zai-coding.ts` dispatches to `src/models/provider/zaiCoding/*` (one function per file, like `provider/custom`). Being core lets it use internal helpers directly. Alternative — an official plugin like `opencode-go` — rejected by the owner.
2. **Provider id `zai-coding`.** Matches the legacy provider id, the existing logo mapping and tokenizer comments; routes become `zai-coding/<account>:<model>`.
3. **Fields.** `apiKey` (secret, required; a Coding Plan key, not a standard API key) and `protocol` (select `openai-chat` | `anthropic`, default `openai-chat`). Unknown fields are rejected by core validation.
4. **Routing by connection protocol.** `openai-chat` → base `https://api.z.ai/api/coding/paas/v4`, header `Authorization: Bearer <key>`. `anthropic` → base `https://api.z.ai/api/anthropic` (the protocol appends `/v1`), headers `Authorization: Bearer <key>` and `x-api-key: <key>`. The protocol is a connection setting rather than per-model metadata because discovery does not report a native API. Alternative — fixed `openai-chat` — rejected: the owner wants the Anthropic-compatible endpoint available.
5. **Discovery, test and usage.** Discovery reads `GET /api/coding/paas/v4/models` for either protocol, keeps ids matching `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`, de-duplicated in catalogue order. Test and usage read `GET https://api.z.ai/api/monitor/usage/quota/limit` (explicit GET, `redirect: "error"`, bounded timeout): it is authenticated, read-only and free. Usage maps `CREDIT_LIMIT` entries `unit 3, number 5` → `fiveHour` (id `zai:five_hour`) and `unit 6, number 1` → `weekly` (id `zai:weekly`), scope `account`, reset from `nextResetTime` (ms), plan from `data.level`. All traffic goes through `conn.fetch`.
6. **Reasoning metadata from discovery.** `capabilities.reasoning: true`, no `reasoningProfile` (it receives no connection, so it cannot see the protocol). Discovery attaches `ModelInfo.reasoning` only when the connection protocol is `openai-chat` and the model matches `^glm-5\.3(-flash|-flashx)?$`: supported `auto, low, high, xhigh`, default `xhigh`, wire `{ xhigh: "max" }`. Other models, and every model on an `anthropic` connection, have no reasoning metadata and therefore stream without reasoning fields (existing route-provider rule). Changing the protocol requires a model refresh to update this metadata, like any other discovery-derived field.
7. **`ProtocolRoute.body` and `ProtocolRoute.replayReasoning` (SDK).** `body?: Record<string, unknown>` holds provider extra fields merged into the request body; keys owned by the protocol (`model`, `messages`, `stream`, `stream_options`, `tools`, `max_tokens`, `temperature`, `response_format`, `reasoning_effort`) are rejected with `INVALID_INPUT` before any request. `replayReasoning?: boolean` asks the protocol to replay stored reasoning. Only `openai-chat` implements both in this change; other protocols ignore them. `streamRoute` forwards both through `ProtocolEndpoint` (new optional fields), so protocols still never see the connection. Alternative — a per-provider body hook or own stream — rejected: duplicates the protocol and bypasses its failure handling.
8. **Z.ai thinking body.** For GLM-5.3 models on `openai-chat` with reasoning applied other than `auto`, the route returns `body: { thinking: { type: "enabled" } }` and `replayReasoning: true`; `reasoning_effort` is sent by the protocol from the resolved wire value. Legacy always sent effort for these models; with default `xhigh` the SDK resolves `auto` to `xhigh`, preserving that.
9. **Canonical reasoning storage.** `agent/run` stores the turn's streamed `thinking` as `reasoning_content` on the first tool call of an assistant message that has tool calls (the shape legacy used), only when non-empty. `openai-chat` with `replayReasoning` copies it to the wire message's `reasoning_content`; without the flag it is ignored. `anthropic`, `openai-responses` and `gemini` ignore it; Gemini no longer throws for `reasoning_content` (it still rejects foreign `thought_signature`).
10. **Presentation.** Reuse `ui.modelLogo` (`zai-coding` → Z.ai mark), GLM display names and the GLM tokenizer; icon `brand:zai`, price vendor `zai`.

## Risks / Trade-offs

- [Monitoring endpoint is undocumented and may change] → strict parsing; unrecognized responses report usage unavailable, never zero usage; fixture tests.
- [Coding Plan terms restrict usage to supported tools] → label and help text state it is a Coding Plan key; no fallback to standard billing.
- [Anthropic-compatible endpoint differs subtly from Anthropic] → no reasoning controls there; owner selects it explicitly per connection.
- [Model list schema drift] → tolerant parsing, invalid ids dropped.
- [Stored reasoning grows transcripts] → only on tool-call turns, as legacy did; other protocols ignore it.
- [Body extension could override protocol fields] → reserved keys rejected before any request.
- [Protocol switched to `anthropic` while the cache still holds GLM reasoning metadata] → the route ignores reasoning-only additions (`thinking`, replay) on `anthropic`; the stale effort may still be sent as `output_config.effort` until the owner refreshes models. Documented in the provider field help.

## Migration Plan

Additive. The provider appears after reload; users create connections manually. SDK fields are optional, so existing providers and protocols behave unchanged. Rollback: remove the provider file and the optional fields; stored `reasoning_content` is ignored by every protocol.
