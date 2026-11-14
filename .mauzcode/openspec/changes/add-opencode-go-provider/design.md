## Context

Providers stream either through their own code (codex, claude) or, for `custom`, through the shared protocol registry inside `src/models`. Plugins may only call the public `models` facade (enforced by `architecture.test.ts`), so a plugin provider cannot reuse protocols. Shared protocols ignore `StreamRequest.reasoning`, and SDK reasoning requires a default. The legacy `llm` implementation (`legacy/src/llm/opencode*`, `docs/opencode.md`) documents the verified Go behavior (endpoints, usage JSON, effort mapping, session header) and is used as reference only.

## Goals / Non-Goals

Goals: a generic, declarative way for any provider (core or plugin) to stream through shared protocols per model; reasoning on the wire for opted-in providers; OpenCode Go as an official plugin.

Non-Goals: PAYG Console, budgets, migrating or removing legacy/SSH-provider OpenCode code, counting `opencode.allowance`, thinking-token budgets, compaction.

## Decisions

1. **`route` instead of exposing protocols to plugins.** `ProviderDefinition.route(ctx, conn, {model, info, sessionId}) → ProtocolRoute {protocol, baseUrl, headers}`. `models.inference.stream` performs header merge, base validation and dispatch. Alternative — making `models.protocol` public — widens the facade and lets providers bypass gating; rejected.
2. **Per-model protocol in `ModelInfo.protocol`.** Discovery is the only place that knows the native API; caching it keeps inference network-free before the request. Fallback `openai-chat` relies on Console translation.
3. **Reasoning wire metadata in capabilities** (`wire`, `disable`) rather than per-provider body hooks: providers describe values, protocols own field placement. `default` optional; `applied: "auto"` means omit. Existing consumers (codex requires a level, claude uses its own resolver, frontendBridge.modelEffort, agent.setReasoningEffort) are checked; codex/claude profiles always supply defaults, so they never see `auto`.
4. **Gemini thinking level** only for low/medium/high, matching legacy caution.
5. **Plugin layout**: `plugins/opencode-go/src/opencodeGo/*` one function per file, `$modelProvider_opencode-go.ts` dispatching through `ctx.fns.opencodeGo.*`.
6. **Test via usage endpoint**: authenticated, read-only, free; `/v1/models` is public and cannot verify the key.

## Risks / Trade-offs

- [Discovery schema drift] → tolerant parsing, malformed fields dropped, fixture tests.
- [Translated APIs differ subtly] → native protocol preferred whenever reported.
- [`applied` type widening breaks consumers] → typecheck plus explicit review of each consumer.
- [Plugin name collides with legacy `opencode` SSH provider] → different id (`opencode-go`) and namespace (`opencodeGo`).

## Migration Plan

Additive. Enabling the optional plugin registers the provider; disabling it removes it. Rollback: disable plugin; SDK additions are optional fields.
