# Proposal

## Why

The owner has a Qwen subscription (chat.qwen.ai member plan for Qwen Code) and wants its models in MauzCode next to Codex, Z.ai and OpenCode Go. Qwen Code now authenticates subscriptions with an OAuth 2.0 device-authorization flow against `auth.qwen.ai` and serves an OpenAI-compatible gateway at `api.qwen.ai`; the older `chat.qwen.ai` PKCE flow backed a free tier that was discontinued on 2026-04-15, so only the subscription flow is worth supporting.

## What Changes

- Move the existing Add connection control and its provider-selection/form block to the beginning of Settings → Models, before the existing connections, for all providers (not only Qwen).
- Add a built-in `qwen` model provider ("Qwen Subscription") to the Models module, next to `codex`, `zai-coding` and `minimax-coding`, with no credential fields: the owner logs in from the connection instead of pasting a key.
- Device-code login (RFC 8628) against `https://auth.qwen.ai/api/oauth/*` with public client id `qwen-code-cli` and scopes `model:invoke profile:read`; the owner opens the `chat.qwen.ai/authorize` link with the user code. All login traffic goes through the connection transport. Login status, cancel and logout actions follow the Codex pattern.
- Encrypted per-connection token storage with proactive refresh, single-flight refresh, `invalid_grant` → login required, and best-effort token revocation on logout.
- Account name defaulting from `userinfo` (name/email) and the plan (`member_type`) shown as safe connection status.
- Model discovery from `GET https://api.qwen.ai/compatible-mode/v1/models` (ids, input modalities, context window).
- Inference as a protocol-route provider on OpenAI Chat Completions at `https://api.qwen.ai/compatible-mode/v1`, with a fresh bearer token per request.
- Quota/429 and subscription errors from the gateway classified into the existing provider failure codes; no usage windows (Qwen exposes no usage endpoint).
- Out of scope: the discontinued free-tier PKCE flow (`chat.qwen.ai/api/v1/oauth2/*`), DashScope / Alibaba Coding Plan API keys, Qwen web-search MCP, reading `~/.qwen` credential files.

## Capabilities

### New Capabilities

- `llm-qwen-subscription-provider`: the Qwen subscription model provider — device-code login through the transport, login secrecy, token storage/refresh/revocation, model discovery, Chat Completions routing and failure classification.

### Modified Capabilities

- `models-settings-ui`: place connection creation before the connection list in visual and keyboard navigation order, preserving the existing add/edit flow.

## Impact

- Reorder the existing `AddConnection` block in `frontend/src/components/settings/ModelsPanel.tsx`; preserve existing forms, styling and empty-state behavior.
- New `src/models/$modelProvider_qwen.ts` declaration and `src/models/provider/qwen/` adapters (auth store, login, route, listModels, test, classifier), plus `src/models/qwen.test.ts`.
- Uses existing `local_secrets` encryption, `models.ResolvedConnection.fetch` transports, `LoginFlow` and the Models settings login UI; no schema migration.
- Updates shared `src/models/protocol/common/streamFetch.ts` to preserve `Retry-After` on classified failures without changing the provider SDK signature, with regression tests for other protocol-route providers.
- Coordinates logout with pending login token writes so late device-code responses cannot restore deleted credentials.
- Pricing: subscription models are flat-rate; no catalogue vendor price unless one appears later.
- Depends on undocumented Qwen endpoints observed in QwenLM/qwen-code (commit `10cab840`, 2026-11-16); they may change without notice.
