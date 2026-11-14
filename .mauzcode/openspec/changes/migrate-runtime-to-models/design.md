# Design

## Context

See proposal.md for the motivation. Current state:

- `agents.model` holds legacy strings such as `[ssh/<host>:]<provider>/<account>:<model>`. There are 14 active agents: 11 on `ssh/aeza-criminal-amarant:codex/su4imauz:gpt-6-astra` and 3 on `ssh/aeza-criminal-amarant:claude-code/brailyndaishaun14091998:claude-opus-5-5`. About 240 archived agents use various legacy routes.
- `llm_connections` has three connections: `custom` "Asoft LLM Gate" (direct), `claude` "2yfl55fsh" (SOCKS) and `codex` "su4imauz" (ssh-tunnel aeza-criminal-amarant). Transports already cover what the legacy `ssh/` prefix did.
- The `models` architecture is fixed by `models-module-boundaries` and `llm-provider-sdk`:
  - a closed root facade;
  - implementation namespaces (`inference`, `connections`, `catalog`, `transport`, `protocol`, `provider.<id>`) that only `src/models` may call;
  - providers as `$modelProvider_<id>` declarations (`ProviderDefinition`) owning stream/compact/listModels/usage/actions;
  - shared protocols in `models.protocol`;
  - `FailureInfo` as the failure vocabulary.
- Outside `src/llm`, roughly 75 loaded files call `ctx.fns.llm.*`. Their decisions are keyed on provider ids (`ep.provider === 'claude-code'`, `api === 'anthropic'`, compactor per provider). `src/models/provider/claude/*` and `src/models/protocol/*/stream.ts` themselves borrow `llm.toAnthropicMessages`, `toOpenAIMessages`, `toGeminiContents`, `parseSSE`, `classifyError`, `anthropicOAuthConstants`, `claudeCodeCliVersion`, `parseAnthropicAuthorizationInput` and `resolveReasoningEffort`.
- `procs.migrate.up` iterates only the migration files it finds and skips applied ids. Applied migrations whose files disappear are ignored. Their `down` steps simply become unavailable.

## Goals / Non-Goals

**Goals:**
- Follow the models architecture exactly:
  - consumers use only the facade;
  - provider differences live in provider declarations;
  - models writes only model-owned data;
  - one function per file, calls only through `ctx.fns`.
- Make the `models` internals self-contained, with no `llm` calls inside `src/models`.
- Land each step and verify it while the legacy code still loads. The final step only stops loading it.

**Non-Goals:**
- No behavioural redesign of the agent loop, tool wiring or compaction policy beyond swapping the backend.
- No new providers. The legacy `mock` provider is not ported. Tests stub facade calls directly.
- No credential migration from legacy OAuth/keychain tables.

## Decisions

1. **Route string keyed by account name.** The format is `<provider>/<accountName>:<modelId>`. It is readable and close to the legacy shape. Uniqueness of `(provider, account_name)` is enforced in `models.connections.create/update` and by a unique index (a model-owned migration).
   - Account names MUST NOT contain `/` or `:` (validation error in create/update). The current three names already comply, so the index migration needs no data fix. Spaces stay allowed (`custom/Asoft LLM Gate:…`), so every route validator (for example the `agent.recommendModel` `allowedModels` regex) parses through `models.resolveRoute` instead of its own pattern.
   - Alternatives considered: `conn/<uuid>:<model>` is stable but opaque. A separate `agents.connection_id` column would change the schema across forks, queue and UI.

2. **Rename by event, not by cross-module writes.** `models.connections.update` changes only `llm_connections` and the model setting `models.localizationModel`. It then emits `models.connectionRenamed { provider, from, to }` through `procs.events`. A new `agent` subscriber (`agent.onConnectionRenamed`, registered in the agent module's start hook) rewrites matching `agents.model` rows and `kv.last-model`. Models never touches `agents`.

3. **Facade extension.**
   - `models.resolveRoute` and `models.tokenPrice` are added to the closed facade. Each delegates once to `models.inference.resolveRoute` / `models.catalog.tokenPrice`.
   - `internalCompatibility.test.ts` pins the new list.
   - Parsing and formatting stay internal (`models.inference.parseRoute`, `formatRoute`). `resolveRoute` returns the canonical `route` string, so consumers need no formatter.
   - Localization is not a model responsibility. It moves to `runtime.localize` (called by `runtime/docs/index` and `plugins/index`) on top of `models.resolveRoute` + `models.call`. The facade therefore gains only these two entries.

4. **Provider inference descriptors.** `ProviderDefinition` gains an optional `inference` block:
   - `systemPreamble?: string`;
   - `priceVendor?: string`.

   Declarations:
   - Claude declares the Claude Code identity line and `anthropic`.
   - Codex declares `openai`.
   - Custom declares no vendor.
   - Without the block, there is no preamble and no vendor.

   `resolveRoute` returns `{ route, connectionId, provider, accountName, model, systemPreamble, priceVendor, nativeCompaction: !!definition.compact, contextWindow?, maxOutputTokens? }`. Consumers never compare provider ids. A future provider works by declaration alone.

4a. **Models-owned tool format.** Callers no longer build provider-shaped tool schemas, and no tool dialect leaves `models`.
   - New type `types.models.ToolSpec = { name, description, parameters }` (plain JSON Schema). `StreamRequest.tools` and `models.stream`/`models.call` `tools` take `ToolSpec[]`. This is a breaking change of the models stream contract; the codex/claude/protocol tests are updated.
   - Each wire protocol converts them itself, one function per file: `models.protocol.anthropic.toTools` (`input_schema`), `models.protocol.openaiResponses.toTools` and `models.protocol.openaiChat.toTools` (with the recursive `strict` check moved from `tools.schemas`), `models.protocol.gemini.toTools` (`functionDeclarations`). Claude and codex providers call the matching converter; custom picks it from its configured protocol.
   - `agent.wireTools({ agent })` returns `ToolSpec[]` from `tools.list` filtered by `agent.tools`; its `api` option is removed. All callers (`agent.run`, `agent.contextBudget`, `goal/nativeCapability`, `run.test`) are checked with `code.callers` and switched. `goal/nativeCapability` compares the neutral specs and fingerprints by route instead of by dialect.
   - `tools.schemas({ api })` keeps its current shapes for non-model callers and tests, but no model path uses it.
   - `contextBudget` estimates tool tokens from the neutral specs.

5. **Resolution internals.** `models.inference.resolveRoute`:
   1. parses the route;
   2. finds the connection by provider and account through `models.connections.resolve`;
   3. checks enablement through `models.inference.assertModelEnabled`;
   4. reads limits from the cached `models.catalog.listModels` entry (no refresh, no network);
   5. reads descriptors from `ctx.state.models` provider definitions.

   Errors are `FailureInfo`-shaped: `INVALID_ROUTE`, `LEGACY_ROUTE`, `CONNECTION_NOT_FOUND`, `CONNECTION_DISABLED`, `MODEL_DISABLED_BY_USER`. None are retryable.

6. **Agent loop.**
   - `agent.run` calls `models.resolveRoute`, then `models.stream({ connectionId, model, instructions, messages, tools, reasoningEffort, sessionId: agent.id, promptCacheKey, runId, state, signal, onEvent })`.
   - `buildLlmRequest` returns `{ instructions, messages }`, with `systemPreamble` placed first and stripped from the prompt body.
   - `agent.wireTools` returns neutral `ToolSpec[]` (see 4a); the provider converts them.
   - Continuation `state` is kept on the run, not persisted.
   - `classifyError`/`proxyFailure` are replaced by `error.failure`. `retrySchedule` maps `retryable`/`retryAfterMs`, and `parkOnUsageLimit` uses `QUOTA_EXHAUSTED` with `resetAt`.
   - `llm.recordUsage` is dropped. Token counts from `StreamResult.usage` still go to session stats.

7. **Reasoning.** Levels come from `models.listModels` (`ModelInfo.reasoning`). Normalization stays inside `models.stream` (SDK-owned reasoning). Agent code only stores the preference and validates it against the listed levels. Legacy `reasoningCapabilities` tables are not ported.

8. **Compaction stays provider-neutral.** The per-provider `$compaction_<provider>` split is not used for models routes. `$compaction_default` resolves the route:
   - when `nativeCompaction` is true, it calls `models.compact`;
   - otherwise it summarizes through `models.call` on the same connection.

   `compaction.resolve`/`modelIdentity` stop inspecting provider names. `contextWindow` uses the resolved `contextWindow`, defaulting to 200k, which replaces `opencodeCatalog` and the kimi/minimax special cases. Legacy `$compaction_*` files leave with `src/llm`.

9. **One-shot calls.** Callers run `models.resolveRoute` then `models.call({ connectionId, model, … })`. There is no internal helper exposed to consumers and no fallback chain.

10. **Settings.**
    - `src/models/$setting_localizationModel` and `usage{Warn,Critical,Alert}Percent` are declared. Route syntax of `localizationModel` is validated on set (`parseRoute`, no network). There is no `models.defaultModel`.
    - `settings.modelDefault` (used by `ui.createAgent`, `agent.createFromValues`, `projects.createChat`, `sidebar/draft`, `plugins/startReview`, the websearch plugin and the UI pickers' preselection) returns `kv.last-model` when it resolves through `models.resolveRoute`; otherwise the first enabled, not disabled model of the earliest enabled connection from `models.list` + cached `models.listModels`; otherwise it fails with `NO_MODEL`. It never reads `llm.defaultModel` or `ctx.env.MODEL`.
    - Empty `models.localizationModel` means localization uses `settings.modelDefault`.
    - Borrowed keys become `embeddings.openaiApiKey`, `decision.openaiApiKey` and `jev.openrouterApiKey`, each declared and migrated in its own module, copying references and never values.

11. **Pricing.** `llm.modelTokenPrice` is ported to `models.catalog.tokenPrice`, with the same models.dev source and cache, keyed by `priceVendor` from the provider declaration. Without a vendor, or when the vendor does not list the model, the price is `null` (UI shows "—"). It never searches other vendors, because the same model id can carry a different price there.

12. **Usage view.** Aggregation is a consumer concern. A `frontendBridge.modelUsage` procedure iterates `models.list` + `models.usage` per connection and classifies windows with the `models.usage*Percent` settings. It replaces `llms` usage/mobileUsage/quota data. Models keeps its per-connection `usage` contract unchanged.
    - `api/$route_v1_quotas_GET` keeps its `{ updatedAt, accounts }` response (read by `useQuotas` and `agent-meta`), built from `frontendBridge.modelUsage`.
    - `frontendBridge.providerIcons` drops its hard-coded legacy provider list. Icons come from the `icon` field of registered `ProviderDefinition`s via `models.providers`.
    - `settings.status` keeps only env key presence. The `anthropicOAuth` and legacy kimi/codex login fields are removed; connection state comes from `models.list`/`test`, and logins run through provider actions.
    - `frontendBridge/llmConnections` (with `LlmConnectionsPanel` and `RemoteLoginDiagnostics`) stops loading and moves to `legacy/`.

13. **UI catalogue.**
    - `frontendBridge.modelData`, `newSession`, `navigationData`, `chatHeader`, `statsData`, `modelGroupLabels` and `api/$route_v1_new-agent-options_GET` build the catalogue from `models.list` + `models.listModels` (cached).
    - The group label is the account name, the display name is `ModelInfo.label ?? id`, and disabled models are flagged.
    - `SettingsDialog` drops the LLM Connections, LLMs and policy tabs. `LlmConnectionsPanel`, `RemoteLoginDiagnostics`, `LlmPolicySettings` and `frontend/src/lib/llmConnections.ts` are deleted with their tests (`settings-llm`, `settings-llm-policy`); git history keeps them for salvage.
    - `CodexAccountReset` and `NodeSettings` are deleted with their tests (the `/llms/codex/reset` and `/llms/settings` endpoints disappear).
    - Links to legacy surfaces open Models instead: the `/llms` entry in `ApplicationPages`, `SshInstancesPanel`'s `onOpenConnections` (which opened `llm-connections`), and in `LiveApp` the `llm-connections` deep link and `openQuotas`. `settings-ssh` and `quota-matrix` tests are updated accordingly.
    - Agent-facing text describes the new route: `SYSTEM_PROMPT_CORE.txt` (`agent.model` line) and the `setModel` comment use `<provider>/<accountName>:<modelId>` without `ssh/`; `settings/declared.test.ts` checks `models.localizationModel` instead of `llm.defaultModel`.

14. **Self-contained models internals.** The borrowed helpers are copied into their responsibility namespaces with their tests, one function per file:
    - message converters → `models.protocol.{anthropic,openaiChat,gemini}`;
    - `parseSSE` → `models.transport` (already present; callers are switched);
    - the claude-specific `classifyError` subset, OAuth constants, CLI version and authorization-input parsing → `models.provider.claude`;
    - reasoning resolution → `models.inference`.

    Copying keeps the legacy tree intact for salvage.

15. **Unloading legacy code.** `src/llm`, `src/llms` and `src/node` move to `legacy/{llm,llms,node}` at the repository root, which is not scanned. Legacy-only helpers such as `sshAccount/startKimiLogin` move with them. Then:
    - `genTypes` runs and routes are reloaded;
    - the server is restarted once.

    Applied ids remain in `_migrations`, and the tables stay.

16. **Guards.**
    - `src/models/noLegacyCalls.test.ts` fails on `fns.(llm|llms|node).` in `src/**` and `plugins/**`.
    - An architecture test fails on `fns.models.(inference|connections|catalog|transport|protocol|provider).` outside `src/models`.
    - `code.quality` must report no calls to missing names.

17. **Agent migration is owned by `agent`.** `src/agent/$migration_<ts>_model_routes.ts` creates `agent_model_routes_backup(agent_id, old_model)` and rewrites `archived_at IS NULL` agents per the `legacy-llm-retirement` rules. It reads connections through `models.list` (facade), not through SQL on `llm_connections`. `down` restores from the backup and drops it.
    - It also rewrites `kv.last-model` by the same rules, backing it up in the same table (key `kv:last-model`).
    - "First connection" means the earliest `created_at`, ties broken by `id`.
    - When a route has no target connection (for example kimi), the value is left unchanged and logged; its runs fail with `LEGACY_ROUTE`.
    - Its timestamp is later than the model-owned unique-index migration. A test asserts the order `migrate.up` applies them in.

## Risks / Trade-offs

- [3 claude-code agents move to `2yfl55fsh`, a different account with its own quota] → The owner accepted this. The backup makes it reversible.
- [Large edit surface in the `agent.run` hot path] → Land the resolver, descriptors and self-contained internals first, then switch callers one area at a time behind rewritten tests.
- [Rename event lost (process crash between update and subscriber)] → Resolution then fails loudly with `CONNECTION_NOT_FOUND`. The subscriber is idempotent, and the owner can rename again or pick a model.
- [Facade grows] → Only two entries, each a single delegation pinned by the compatibility test. Localization and usage aggregation stay outside models.
- [Loss of fallback models and node relay] → Out of scope. Calls fail visibly instead of switching models.
- [Archived agents become unusable on restore] → Accepted. The error tells the owner to pick a model.

## Migration Plan

1. Land the self-contained internals, provider descriptors, `resolveRoute`, `tokenPrice`, settings and the rename event while legacy code is still loaded.
2. Switch callers area by area: one-shot, compaction, agent loop, UI/bridge, borrowed settings. Run the related tests after each.
3. Apply the agent-route and settings migrations. Verify one codex and one claude agent turn with a tool call and a compaction.
4. Move the legacy trees to `legacy/`, run genTypes, the guard tests, `code.quality` and one full typecheck, then restart.

Rollback: revert the commits and run the agent migration `down`. Settings copies are additive, and legacy settings remain.
