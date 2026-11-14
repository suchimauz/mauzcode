# Proposal

## Why

Agents, one-shot calls, compaction, model pickers, usage and pricing still run on the legacy `llm`/`llms`/`node` stack, while connections, providers and per-model availability already live in `models`. Keeping two routing systems means two credential stores, two policies and two failure models. The runtime should depend only on `models`, and `llm` should be retired as inert code that is kept for later salvage but not loaded.

## What Changes

- A new model route string `<provider>/<accountName>:<modelId>` addresses one model of one stored `models` connection. A resolver maps it to the connection without any network request. `(provider, account_name)` becomes unique.
- Agents and compaction never branch on provider ids. The system preamble, native-compaction support and price vendor come from the provider declaration via route resolution. Tools are passed to `models` in one neutral format (name, description, JSON Schema), and each provider converts them to its own wire format.
- `agent.run`, request building, context budget, model/reasoning selection, goal capability checks, retry/park-on-limit and compaction use `models.stream`, `models.compact` and `models.inference.*` instead of `llm.*`.
- One-shot callers (goal check, summarize, autotext, websearch plugin, default compaction, doc/plugin localization) use `models.call`.
- New settings: `models.localizationModel` and usage alert thresholds. There is no default-model setting: `settings.modelDefault` returns the last used model (`kv.last-model`) when it resolves, otherwise the first enabled model of the earliest enabled connection, otherwise it fails with `NO_MODEL`. The legacy `llm.defaultModel` setting and the `MODEL` env fallback stop applying. New facade procedures: `models.resolveRoute` and `models.tokenPrice`. Localization moves to `runtime.localize` and the aggregated usage view to `frontendBridge.modelUsage`, both on top of the facade.
- The UI model catalogue (new session, chat header, navigation, stats, new-agent options) is built from `models` connections. The legacy "LLM Connections", LLMs and model-policy settings surfaces are hidden.
- Secret settings that other modules borrowed from `llm` (OpenAI key for embeddings/decision, OpenRouter key for jev) move to their own modules, and their values are migrated.
- Connection account names may no longer contain `/` or `:`, so every route stays parseable.
- Active agents are migrated to the new route format. **BREAKING**: archived agents have their model selection cleared permanently, without backup or rollback restoration. Restoring one requires explicit model selection before it can run; no automatic model fallback is allowed.
- **BREAKING**: the `llm`, `llms` and `node` namespaces are no longer loaded. Their HTTP routes disappear, including `/node/v1/*`. The legacy fallback model chain and `llm.modelPolicy` stop applying. Providers other than claude, codex and custom are unavailable until they are reintroduced as `models` providers.
- Quotas, provider icons and settings status are rebuilt on `models`. The Codex account reset and node settings controls are removed, and links to legacy LLM pages open Models.
- Prices are only reported for providers that declare a price vendor; otherwise they are unknown.
- A guard test forbids `ctx.fns.llm.*`, `ctx.fns.llms.*` and `ctx.fns.node.*` calls in loaded code.

Out of scope: fallback models, MauzCode node (host and client), moving legacy accounts/credentials, providers other than claude/codex/custom, dropping legacy tables.

## Capabilities

### New Capabilities
- `model-routing`: the route string format, connection uniqueness by provider and account name, and resolution of a route to a connection and model with no-network failures.
- `agent-model-inference`: agent turns, compaction, one-shot calls, reasoning selection and failure/quota classification running exclusively through `models`.
- `model-defaults-and-pricing`: default and localization model settings, token price lookup and aggregated connection usage with alert thresholds.
- `legacy-llm-retirement`: unloading `llm`/`llms`/`node`, the no-legacy-call guard, migration of active agents, failure of unmigrated routes and relocation of borrowed secret settings.

### Modified Capabilities
- `models-module-boundaries`: the public facade gains `models.resolveRoute` and `models.tokenPrice`. Outside consumers may use only the facade. Models writes only model-owned data and announces connection renames by event.
- `llm-provider-sdk`: providers declare inference descriptors (system preamble, price vendor) and convert provider-neutral tool definitions themselves, so callers never branch on provider ids.
- `llm-model-availability`: per-connection disabled models and connection enablement become the only model policy. The isolation-from-legacy-policy requirement is replaced.
- `models-settings-ui`: the Models tab becomes the only model settings surface. Legacy LLM tabs are hidden.

## Impact

- Code: `src/agent/*` (run, buildLlmRequest, contextBudget, setModel, setReasoningEffort, recommendModel, retrySchedule, parkOnUsageLimit, checkGoal, readAndSummarize, contextDetails, createFromValues), `src/compaction/*`, `src/goal/nativeCapability`, `src/frontendBridge/*`, `src/api/$route_v1_new-agent-options_GET`, `src/api/$route_v1_quotas_GET`, `src/frontendBridge/providerIcons`, `src/settings/status`, `src/autotext`, `src/settings/modelDefault`, `src/ui/createAgent`, `src/plugins/index`, `src/runtime/docs/index`, `src/embeddings/openai`, `src/decision/engine{Openai,Jev}`, `src/jev/health`, `src/sshAccount/startKimiLogin`, `plugins/websearch`, `src/models/*` (new procedures, settings, migration), frontend settings dialog, `CodexAccountReset`, `NodeSettings`, `ApplicationPages`, `SshInstancesPanel`.
- Removed from loading: `src/llm`, `src/llms`, `src/node`, moved to a non-scanned `legacy/` directory.
- Data: `agents.model` of active agents and `kv.last-model` rewritten (with backup), archived agents' model selections cleared without backup, a unique index on `llm_connections(provider, account_name)`, and settings values copied to new keys. Legacy tables stay.
- Tests that mock `llm.*` are rewritten against `models.*`. Node/SSH parity tests move with the legacy code.
