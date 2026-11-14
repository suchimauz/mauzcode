# Tasks

## 1. Self-contained models internals

- [x] 1.1 Copy the legacy message converters (`toAnthropicMessages`, `toOpenAIMessages`, `toGeminiContents`) into `models.protocol.{anthropic,openaiChat,gemini}` with their tests, and switch `src/models/protocol/*/stream.ts` and the `parseSSE` callers to `models.protocol.*` / `models.transport.parseSSE`; verify `bun test src/models` passes
- [x] 1.2 Copy the claude helpers (`classifyError` subset, `anthropicOAuthConstants`, `claudeCodeCliVersion`, `parseAnthropicAuthorizationInput`) into `models.provider.claude.*` and `resolveReasoningEffort` into `models.inference.*`; verify `rg 'fns\.llm\.' src/models` is empty and the claude/codex parity tests pass

## 2. Provider descriptors and route resolution

- [x] 2.1 Add the optional `inference` block (`systemPreamble`, `priceVendor`) to `ProviderDefinition` and declare it in the claude and codex providers; run genTypes and verify the `llm-provider-sdk` descriptor scenarios, including the defaults for a provider without the block
- [x] 2.1a Add `types.models.ToolSpec` and make `StreamRequest.tools`/`models.stream`/`models.call` take it; add `models.protocol.{anthropic,openaiResponses,openaiChat,gemini}.toTools` (moving the recursive `strict` check from `tools.schemas`) and call them in the claude, codex and custom (by configured protocol) providers; update codex/claude/protocol tests; verify the `Provider-neutral tool definitions` scenarios
- [x] 2.2 Add `models.inference.parseRoute`/`formatRoute` with tests for the `model-routing` format scenarios (separators, malformed → `INVALID_ROUTE`, legacy → `LEGACY_ROUTE`)
- [x] 2.3 Add `models.inference.resolveRoute`, returning connection, model, descriptors, `nativeCompaction` and cached limits, and the facade entry `models.resolveRoute`; update `internalCompatibility.test.ts` and docs/models-providers.md; verify the resolution scenarios (not found, disabled connection/model) send no request
- [x] 2.4 Add a model-owned migration for a unique `(provider, account_name)` index and checks in connections create/update (duplicate pair and `/` or `:` in the account name → validation error); on rename, update only `models.localizationModel` and emit `models.connectionRenamed`; verify with connection tests that no `agents` write happens
- [x] 2.5 Add an architecture test that fails on `fns.models.(inference|connections|catalog|transport|protocol|provider).` outside `src/models`; verify it passes now and fails on an injected call

## 3. Settings, pricing, localization and usage

- [x] 3.1 Declare `models.localizationModel` (route-syntax validation on set) and `models.usage{Warn,Critical,Alert}Percent`; rewrite `settings.modelDefault` as last used model → first enabled model of the earliest enabled connection → `NO_MODEL`, with no `llm.defaultModel` or `MODEL` env read, and switch `ui.createAgent` and `agent.createFromValues` to it; update `settings/declared.test.ts`; verify the model-selection scenarios in tests
- [x] 3.2 Port `llm.modelTokenPrice` to `models.catalog.tokenPrice`, keyed by the provider's `priceVendor` (no vendor or not listed → `null`, no cross-vendor search), and add the facade entry `models.tokenPrice`; switch `agent.contextDetails` and `frontendBridge.statsData`; verify the known/unknown/no-vendor price tests
- [x] 3.3 Add `runtime.localize` on top of `models.resolveRoute` + `models.call`; switch `src/plugins/index.ts` and `src/runtime/docs/index.ts`; verify the localization tests stub only facade calls
- [x] 3.4 Add `frontendBridge.modelUsage`, aggregating `models.list` + `models.usage` with threshold classification, and replace the `llms` usage/mobileUsage/quota data and `node/$route_v1_usage_GET` consumers in the UI; verify the threshold and one-failing-connection tests
- [x] 3.5 Declare `embeddings.openaiApiKey`, `decision.openaiApiKey` and `jev.openrouterApiKey`, each with a migration in its own module copying the legacy references; switch `embeddings/openai`, `decision/engine{Openai,Jev}` and `jev/health`; verify with their tests and that no secret value is logged
- [x] 3.6 Rebuild `api/$route_v1_quotas_GET` on `frontendBridge.modelUsage` keeping `{ updatedAt, accounts }`, take `frontendBridge.providerIcons` from registered provider declarations, and reduce `settings.status` to env key flags; verify the quotas, icons and status tests make no `llm`/`llms` calls

## 4. One-shot calls and compaction

- [x] 4.1 Switch `agent.checkGoal`, `agent.readAndSummarize`, `autotext/$route_suggest_POST` and `plugins/websearch` (answer, fetch) to `models.resolveRoute` + `models.call`; verify their tests with facade stubs and no fallback
- [x] 4.2 Make `$compaction_default` provider-neutral (`models.compact` when `nativeCompaction`, else a summary through `models.call`), and make `compaction.resolve`/`modelIdentity`/`contextWindow` use `resolveRoute` with no provider-id checks (default 200k); verify the compaction tests for both paths and remove the node/ssh parity tests that only cover legacy

## 5. Agent loop and model selection

- [x] 5.1 Change `agent.buildLlmRequest` to return `{ instructions, messages }`, with the resolved `systemPreamble` placed first, and make `agent.wireTools({ agent })` return neutral `ToolSpec[]` without the `api` option (check every call site with `code.callers` first: `agent.run`, `contextBudget`, `goal/nativeCapability`, `run.test`); switch `contextBudget` and `goal/nativeCapability` to `resolveRoute`; verify the request-shape tests for claude and custom with no provider-id branching
- [x] 5.2 Switch `agent.run` to `models.stream`, using `FailureInfo` for classification, `retrySchedule` and `parkOnUsageLimit`, and dropping `llm.recordUsage`; rewrite the run, cancellation, transient-stream, goal and mid-turn-compaction tests to stub `models.stream`; verify they pass
- [x] 5.3 Switch `agent.setModel`, `setReasoningEffort`, `recommendModel` and `createFromValues` to `models.resolveRoute` and `ModelInfo.reasoning` from `models.listModels`; in `recommendModel` replace the `allowedModels` regex with route parsing so account names with spaces are accepted; update the `setModel` route comment and the `agent.model` line in `SYSTEM_PROMPT_CORE.txt` to `<provider>/<accountName>:<modelId>`; verify the model/reasoning change scenarios (disabled model, unsupported level) and a `custom/Asoft LLM Gate:…` recommendation candidate
- [x] 5.4 Add `agent.onConnectionRenamed`, subscribed to `models.connectionRenamed` from the agent start hook, rewriting matching `agents.model` rows and `kv.last-model` idempotently; verify the "Rename updates agent routes" scenario

## 6. UI catalogue and settings surfaces

- [x] 6.1 Rebuild `frontendBridge.modelData`, `newSession`, `navigationData`, `chatHeader` and `modelGroupLabels` and `api/$route_v1_new-agent-options_GET` from `models.list` + `models.listModels`; update their tests for grouping, labels, disabled flags and the unavailable-connection case
- [x] 6.2 Remove the LLM Connections, LLMs and model-policy entries from the frontend `SettingsDialog`; delete `LlmConnectionsPanel`, `RemoteLoginDiagnostics`, `LlmPolicySettings` and `frontend/src/lib/llmConnections.ts` with the `settings-llm` and `settings-llm-policy` tests; update `settings-models`; verify with the frontend test run that only Models is listed
- [x] 6.3 Delete `CodexAccountReset` and `NodeSettings` with their tests; point the `/llms` entry in `ApplicationPages`, `SshInstancesPanel`'s `onOpenConnections`, and `LiveApp`'s `llm-connections` deep link and `openQuotas` at the Models tab; update the `settings-ssh` and `quota-matrix` tests; verify with the frontend tests and `rg '/llms|llm-connections|llmConnections' frontend/src` that no reference remains

## 7. Agent data migration

- [x] 7.1 Add `src/agent/$migration_<ts>_model_routes.ts` with a backup table and `down` for active-agent routes and `kv.last-model` only, timestamped after the model-owned unique-index migration, reading connections through `models.list` (first = earliest `created_at`, then `id`) and mapping only non-archived agents and `kv.last-model` per the `legacy-llm-retirement` rules (no target connection → unchanged and logged); verify on a DB copy that the 11 codex agents become `codex/su4imauz:*`, the 3 claude-code agents become `claude/2yfl55fsh:claude-opus-5-5`, `last-model` becomes `claude/2yfl55fsh:claude-opus-5-5`, archived model selections are cleared without backup regardless of route format, the migration order test passes and `down` restores only the backed-up values, never archived model selections
  - Note: verified by a synthetic snapshot test on the isolated test DB (src/agent/modelRoutesMigration.test.ts: 11 ssh codex/su4imauz agents with distinct model ids and 3 ssh claude-code/brailyndaishaun14091998:claude-opus-5-5 agents, connections codex/su4imauz and claude/2yfl55fsh, kv.last-model, archived agents without backup, down restoring original active routes and kv). This is a synthetic snapshot, not a copy of the production DB; production was not touched.
- [x] 7.2 Support an explicit unset model in agent storage and runtime types; ensure restore preserves it, the UI asks for model selection, and execution fails with non-retryable `MODEL_NOT_SELECTED` before provider calls without filling a last-used/default model. Test an archived codex route that was already resolvable, restore without selection, explicit selection enabling a run, and rollback without recovery of cleared selections

## 8. Retire legacy runtime

- [x] 8.1 Move `src/llm`, `src/llms` and `src/node` (and legacy-only helpers such as `sshAccount/startKimiLogin`, `frontendBridge/llmConnections` with its test) to `legacy/`; run `procs.dev.genTypes`, reload routes and restart; verify that `ctx.fns.llm` is undefined, `/node/v1/models` returns 404 and `migrate.up` succeeds
- [x] 8.2 Add `src/models/noLegacyCalls.test.ts` guarding `fns.(llm|llms|node).` outside `legacy/`; verify it passes and fails on an injected call
- [x] 8.3 Update docs/models-providers.md (descriptors, new facade entries, rename event), docs/architecture.md and docs/mauzcode-node.md (node retired); verify they no longer describe `llm.*` as the production path

  - Verification scope: source retirement verified by fresh isolated process boot/restart and real loopback HTTP on test Postgres 54399, with preserved historical migration rows and tables. No production restart, deployment, provider call, commit or push. Evidence: `.mauzcode/tmp/js/acceptance.json` (275 byte-preserving moves, AST positive/negative checks, 584 passing regressions, strict metadata validation, full typecheck 426 → 326 with zero added diagnostics). Overall quality remains `ok:false` for the same 8 pre-existing private `.mauzcode` missing-call findings as baseline `37bd6bf3`; core and every official plugin are `ok:true`. Task 9.1 is not claimed complete.

## 9. Integration checks

- [ ] 9.1 Run `code.quality({})` (ok, no calls to missing names) and one full `procs.dev.typecheck({})` with no new errors
- [ ] 9.2 Live check: an agent on `codex/su4imauz` and one on `claude/2yfl55fsh` each complete a turn with a tool call and a compaction; reasoning and model switches work from the UI
- [ ] 9.3 Live check: the new-session picker lists models of all three connections, a disabled model cannot be selected or called, usage and prices are visible, renaming a connection keeps its agents working, and a restored archived agent fails with `MODEL_NOT_SELECTED` without a provider request or automatic model fallback until the owner explicitly selects a model
