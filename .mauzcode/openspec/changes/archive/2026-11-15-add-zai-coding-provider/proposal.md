# Proposal

## Why

The Z.ai Coding Plan (GLM models) is only reachable through the retired legacy `llm` module (`legacy/src/llm/zaiCoding*`), which the runtime no longer loads. Users of the new Models screen cannot connect it, see its quota, or use GLM reasoning. The legacy code already documents the working endpoints, quota format and GLM thinking behavior, so the provider can be rebuilt on the Models SDK with shared protocols instead of a bespoke stream.

## What Changes

- New core Models provider `zai-coding` ("Z.ai Coding Plan") declared in `src/models`, with a required Coding Plan API key, a per-connection protocol choice (`openai-chat` default or `anthropic`) and direct, SOCKS and SSH-tunnel transports.
- Inference through a protocol route (no provider-owned stream): `openai-chat` on `https://api.z.ai/api/coding/paas/v4`, `anthropic` on `https://api.z.ai/api/anthropic`. Never falls back to the metered standard API.
- Model discovery from the Coding Plan models endpoint, connection test and five-hour/weekly quota windows from the Z.ai monitoring endpoint.
- GLM-5.3 reasoning parity with legacy on `openai-chat`: effort levels from discovery metadata (`xhigh` sent as `max`), `thinking: {type: "enabled"}`, and replay of the model's reasoning on assistant tool-call turns.
- SDK extension: a protocol route MAY add provider body fields and MAY request reasoning replay; the `openai-chat` protocol honors both. Agent turns keep streamed reasoning on assistant tool-call messages in a provider-neutral field; other protocols ignore it.
- Out of scope: importing the legacy key, SSH instance or agent routes; the China (`open.bigmodel.cn`) endpoint; the pay-as-you-go API; reasoning controls on the `anthropic` protocol; deleting legacy code.

## Capabilities

### New Capabilities
- `llm-zai-coding-provider`: Z.ai Coding Plan connection, protocol routing, model discovery, quota usage, connection test and GLM reasoning behavior.

### Modified Capabilities
- `llm-provider-sdk`: protocol routes gain optional provider body fields and a reasoning-replay flag.
- `llm-model-protocols`: `openai-chat` merges provider body fields and replays stored reasoning as `reasoning_content`; other protocols ignore stored reasoning.
- `agent-model-inference`: agent turns persist streamed reasoning on assistant tool-call messages.

## Impact

- New: `src/models/$modelProvider_zai-coding.ts`, `src/models/provider/zaiCoding/*` (route, listModels, usage, test, headers) with tests.
- Modified: `types.models.ProtocolRoute`, `models/inference/streamRoute`, `models/protocol/openaiChat/{stream,toOpenAIMessages}`, `models/protocol/gemini/toGeminiContents`, `agent/run` (assistant message persistence), `frontendBridge.modelMark` if provider `zai-coding` is not yet mapped.
- Reused: Z.ai logo, GLM display names, GLM tokenizer, price vendor `zai`.
- External: HTTPS to `api.z.ai` only through the connection's saved transport.
