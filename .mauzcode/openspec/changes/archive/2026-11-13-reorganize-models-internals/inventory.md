# File disposition and evidence

All 84 original files are accounted for below. 36 existing implementations move with root compatibility delegates; 48 files remain, including all 10 current tests. Existing tests remain compatibility/integration tests; new focused implementation tests belong beside internal procedures. Root api.ts and providers.ts remain implementations, not relocated delegates. This deliberately refines the research suggestion to keep the design's stable API/registry boundary.

## Complete file map

| Current file | Implementation destination | Root disposition | Indexed consumers | Direct indexed tests / verification |
| --- | --- | --- | --- | --- |
| `src/models/$loader_modelProvider.ts` | `src/models/$loader_modelProvider.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/$migration_20370201120000_llm_connections.ts` | `src/models/$migration_20370201120000_llm_connections.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/$migration_20370401120000_llm_connection_disabled_models.ts` | `src/models/$migration_20370401120000_llm_connection_disabled_models.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/$migration_20370402120000_llm_connection_models_cache.ts` | `src/models/$migration_20370402120000_llm_connection_models_cache.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/$modelProvider_claude.ts` | `src/models/$modelProvider_claude.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/$modelProvider_codex.ts` | `src/models/$modelProvider_codex.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/$modelProvider_custom.ts` | `src/models/$modelProvider_custom.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/$route_api_GET.ts` | `src/models/$route_api_GET.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/$route_api_POST.ts` | `src/models/$route_api_POST.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/$start.ts` | `src/models/$start.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/$stop.ts` | `src/models/$stop.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/ActionValue.ts` | `src/models/ActionValue.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/Checkpoint.ts` | `src/models/Checkpoint.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/CheckpointEntry.ts` | `src/models/CheckpointEntry.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/CompactRequest.ts` | `src/models/CompactRequest.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/CompactResult.ts` | `src/models/CompactResult.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/ConnectionView.ts` | `src/models/ConnectionView.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/FailureInfo.ts` | `src/models/FailureInfo.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/FieldSpec.ts` | `src/models/FieldSpec.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/LoginFlow.ts` | `src/models/LoginFlow.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/ModelInfo.ts` | `src/models/ModelInfo.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/ProviderDefinition.ts` | `src/models/ProviderDefinition.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/ProviderState.ts` | `src/models/ProviderState.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/ProviderView.ts` | `src/models/ProviderView.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/QuotaObservation.ts` | `src/models/QuotaObservation.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/ReasoningCapabilities.ts` | `src/models/ReasoningCapabilities.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/ReasoningLevel.ts` | `src/models/ReasoningLevel.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/ReasoningResolution.ts` | `src/models/ReasoningResolution.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/ResolvedConnection.ts` | `src/models/ResolvedConnection.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/State.ts` | `src/models/State.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/StreamEvent.ts` | `src/models/StreamEvent.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/StreamRequest.ts` | `src/models/StreamRequest.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/StreamResult.ts` | `src/models/StreamResult.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/TestResult.ts` | `src/models/TestResult.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/TransportSpec.ts` | `src/models/TransportSpec.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/UsageReport.ts` | `src/models/UsageReport.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/action.ts` | `src/models/connections/action.ts` | Keep root delegate | `models/api.ts` | `models/codex.test.ts`, `models/connections.test.ts` |
| `src/models/api.ts` | `src/models/api.ts` | Retain | `models/$route_api_GET.ts`, `models/$route_api_POST.ts` | Model suite / typecheck / discovery; see test matrix |
| `src/models/assertModelEnabled.ts` | `src/models/inference/assertModelEnabled.ts` | Keep root delegate | `models/compact.ts`, `models/stream.ts` | Model suite / typecheck / discovery; see test matrix |
| `src/models/availability.test.ts` | `src/models/availability.test.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | `src/models/availability.test.ts` |
| `src/models/cached.ts` | `src/models/connections/cached.ts` | Keep root delegate | `models/test.ts`, `models/usage.ts` | Model suite / typecheck / discovery; see test matrix |
| `src/models/checkInput.ts` | `src/models/inference/checkInput.ts` | Keep root delegate | `models/compact.ts`, `models/stream.ts` | Model suite / typecheck / discovery; see test matrix |
| `src/models/claudeAuth.test.ts` | `src/models/claudeAuth.test.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | `src/models/claudeAuth.test.ts` |
| `src/models/claudeAuth.ts` | `src/models/provider/claude/claudeAuth.ts` | Keep root delegate | `models/claudeLogin.ts` | `models/claudeAuth.test.ts` |
| `src/models/claudeLogin.ts` | `src/models/provider/claude/claudeLogin.ts` | Keep root delegate | Types/declarations or no indexed direct caller; retain compatibility | `models/claudeAuth.test.ts` |
| `src/models/claudeProtocol.test.ts` | `src/models/claudeProtocol.test.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | `src/models/claudeProtocol.test.ts` |
| `src/models/claudeRequest.ts` | `src/models/provider/claude/claudeRequest.ts` | Keep root delegate | `models/claudeAuth.ts`, `models/claudeLogin.ts` | `models/claudeProtocol.test.ts` |
| `src/models/codex.test.ts` | `src/models/codex.test.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | `src/models/codex.test.ts` |
| `src/models/codexAuth.ts` | `src/models/provider/codex/codexAuth.ts` | Keep root delegate | `models/codexLogin.ts` | `models/codex.test.ts`, `models/codexParity.test.ts` |
| `src/models/codexFailure.ts` | `src/models/provider/codex/codexFailure.ts` | Keep root delegate | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/codexInput.ts` | `src/models/provider/codex/codexInput.ts` | Keep root delegate | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/codexLogin.ts` | `src/models/provider/codex/codexLogin.ts` | Keep root delegate | Types/declarations or no indexed direct caller; retain compatibility | `models/codex.test.ts` |
| `src/models/codexParity.test.ts` | `src/models/codexParity.test.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | `src/models/codexParity.test.ts` |
| `src/models/codexQuota.ts` | `src/models/provider/codex/codexQuota.ts` | Keep root delegate | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/codexReasoningProfile.ts` | `src/models/provider/codex/codexReasoningProfile.ts` | Keep root delegate | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/codexVersion.ts` | `src/models/provider/codex/codexVersion.ts` | Keep root delegate | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/compact.ts` | `src/models/inference/compact.ts` | Keep root delegate | Types/declarations or no indexed direct caller; retain compatibility | `models/availability.test.ts`, `models/codex.test.ts`, `models/codexParity.test.ts` |
| `src/models/connections.test.ts` | `src/models/connections.test.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | `src/models/connections.test.ts` |
| `src/models/create.ts` | `src/models/connections/create.ts` | Keep root delegate | `models/api.ts` | `models/availability.test.ts`, `models/claudeAuth.test.ts`, `models/codex.test.ts`, `models/codexParity.test.ts`, `models/connections.test.ts`, `models/custom.test.ts` |
| `src/models/custom.test.ts` | `src/models/custom.test.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | `src/models/custom.test.ts` |
| `src/models/customProtocol.ts` | `src/models/provider/custom/customProtocol.ts` | Keep root delegate | Types/declarations or no indexed direct caller; retain compatibility | `models/custom.test.ts` |
| `src/models/failure.ts` | `src/models/inference/failure.ts` | Keep root delegate | `models/checkInput.ts`, `models/codexInput.ts`, `models/resolveReasoning.ts` | Model suite / typecheck / discovery; see test matrix |
| `src/models/fetch.ts` | `src/models/transport/fetch.ts` | Keep root delegate | `models/resolve.ts` | Model suite / typecheck / discovery; see test matrix |
| `src/models/get.ts` | `src/models/connections/get.ts` | Keep root delegate | `models/action.ts`, `models/api.ts`, `models/assertModelEnabled.ts`, `models/create.ts`, `models/listModels.ts`, `models/remove.ts`, `models/resolve.ts`, `models/setModelEnabled.ts`, `models/test.ts`, `models/update.ts`, `models/usage.ts` | `models/availability.test.ts`, `models/connections.test.ts` |
| `src/models/list.ts` | `src/models/connections/list.ts` | Keep root delegate | `models/api.ts`, `models/refreshAll.ts` | `models/connections.test.ts` |
| `src/models/listModels.ts` | `src/models/catalog/listModels.ts` | Keep root delegate | `models/api.ts`, `models/refreshAll.ts` | `models/availability.test.ts`, `models/codex.test.ts`, `models/codexParity.test.ts`, `models/connections.test.ts`, `models/custom.test.ts` |
| `src/models/parseSSE.ts` | `src/models/transport/parseSSE.ts` | Keep root delegate | Types/declarations or no indexed direct caller; retain compatibility | Model suite / typecheck / discovery; see test matrix |
| `src/models/providers.test.ts` | `src/models/providers.test.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | `src/models/providers.test.ts` |
| `src/models/providers.ts` | `src/models/providers.ts` | Retain | `models/api.ts` | `models/registryReload.test.ts` |
| `src/models/refreshAll.ts` | `src/models/catalog/refreshAll.ts` | Keep root delegate | `models/$start.ts` | `models/connections.test.ts` |
| `src/models/registryReload.test.ts` | `src/models/registryReload.test.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | `src/models/registryReload.test.ts` |
| `src/models/remove.ts` | `src/models/connections/remove.ts` | Keep root delegate | `models/api.ts` | `models/connections.test.ts` |
| `src/models/resolve.ts` | `src/models/connections/resolve.ts` | Keep root delegate | `models/action.ts`, `models/compact.ts`, `models/listModels.ts`, `models/stream.ts`, `models/test.ts`, `models/usage.ts` | `models/claudeAuth.test.ts`, `models/codex.test.ts`, `models/codexParity.test.ts` |
| `src/models/resolveReasoning.ts` | `src/models/inference/resolveReasoning.ts` | Keep root delegate | `models/stream.ts` | `models/codexParity.test.ts` |
| `src/models/safeMessage.ts` | `src/models/connections/safeMessage.ts` | Keep root delegate | `models/action.ts`, `models/api.ts`, `models/codexLogin.ts`, `models/failure.ts`, `models/listModels.ts`, `models/refreshAll.ts`, `models/test.ts` | Model suite / typecheck / discovery; see test matrix |
| `src/models/setModelEnabled.ts` | `src/models/catalog/setModelEnabled.ts` | Keep root delegate | `models/api.ts` | `models/availability.test.ts`, `models/codex.test.ts` |
| `src/models/stream.ts` | `src/models/inference/stream.ts` | Keep root delegate | Types/declarations or no indexed direct caller; retain compatibility | `models/availability.test.ts`, `models/codex.test.ts`, `models/codexParity.test.ts` |
| `src/models/test.ts` | `src/models/connections/test.ts` | Keep root delegate | `models/api.ts`, `models/usage.ts` | `models/codex.test.ts`, `models/connections.test.ts`, `models/custom.test.ts` |
| `src/models/toView.ts` | `src/models/connections/toView.ts` | Keep root delegate | `models/get.ts`, `models/list.ts` | Model suite / typecheck / discovery; see test matrix |
| `src/models/transport.test.ts` | `src/models/transport.test.ts` | Retain | Types/declarations or no indexed direct caller; retain compatibility | `src/models/transport.test.ts` |
| `src/models/update.ts` | `src/models/connections/update.ts` | Keep root delegate | `models/api.ts` | `models/availability.test.ts`, `models/codexParity.test.ts`, `models/connections.test.ts` |
| `src/models/usage.ts` | `src/models/connections/usage.ts` | Keep root delegate | `models/api.ts` | `models/codex.test.ts`, `models/connections.test.ts`, `models/custom.test.ts` |
| `src/models/validateConfig.ts` | `src/models/connections/validateConfig.ts` | Keep root delegate | `models/create.ts`, `models/update.ts` | `models/connections.test.ts`, `models/custom.test.ts` |
| `src/models/validateTransport.ts` | `src/models/transport/validateTransport.ts` | Keep root delegate | `models/create.ts`, `models/update.ts` | Model suite / typecheck / discovery; see test matrix |

## Consumer and dynamic-dispatch evidence

- frontend/src/lib/modelConnections.ts:25 /models/api
- frontend/src/extensions/types.ts:24,36 provider metadata/form contract
- frontend/src/components/settings/ModelsPanel.tsx:329

- api switch(data.action)
- provider definition.stream/compact/test/usage/listModels and def.actions[name] callback dispatch
- root $start models.refreshAll timer; root loader owns registry/declaration identity

No external indexed direct model procedure callers were found in this snapshot. This is not evidence that private plugins have none: preserve all root identities. HTTP and SDK consumers remain part of acceptance. Legacy agents currently use llm.stream; moving that execution pipeline to models is explicitly out of scope.

## Persistence and state

llm_connections columns disabled_models/models_cache/models_cached_at unchanged; ctx.state.models and encrypted secret namespace models unchanged. No data migration. SQL ownership stays with connection/catalogue operations.

## Test matrix

| Existing test | Layout-sensitive fixtures | Required focus |
| --- | --- | --- |
| `src/models/availability.test.ts` | `../_testCtx.entry`, `./api` | Preserve existing assertions; exercise facade and new implementation |
| `src/models/claudeAuth.test.ts` | `./claudeAuth`, `./claudeLogin`, `../llm/anthropicOAuthConstants`, `../llm/parseAnthropicAuthorizationInput` | Preserve existing assertions; exercise facade and new implementation |
| `src/models/claudeProtocol.test.ts` | `../_testCtx.entry`, `./$modelProvider_claude` | Preserve existing assertions; exercise facade and new implementation |
| `src/models/codex.test.ts` | `../_testCtx.entry`, `./$modelProvider_codex` | Preserve existing assertions; exercise facade and new implementation |
| `src/models/codexParity.test.ts` | `../_testCtx.entry`, `./$modelProvider_codex` | Preserve existing assertions; exercise facade and new implementation; update source assertions to inspect actual implementation, not only wrappers |
| `src/models/connections.test.ts` | `../_testCtx.entry`, `./api` | Preserve existing assertions; exercise facade and new implementation |
| `src/models/custom.test.ts` | `../_testCtx.entry`, `./$modelProvider_custom` | Preserve existing assertions; exercise facade and new implementation |
| `src/models/providers.test.ts` | `./$loader_modelProvider`, `./providers`, `../procs/project/classify` | Preserve existing assertions; exercise facade and new implementation; update source assertions to inspect actual implementation, not only wrappers |
| `src/models/registryReload.test.ts` | `node:fs/promises`, `node:path`, `../$main`, `../procs/boot/load` | Preserve existing assertions; exercise facade and new implementation; update source assertions to inspect actual implementation, not only wrappers |
| `src/models/transport.test.ts` | `./fetch`, `./validateTransport` | Preserve existing assertions; exercise facade and new implementation |

Additional acceptance: src/frontendBridge/models.test.ts, relevant llm consumer tests, loader/discovery tests, typecheck and quality baseline comparison. These checks are future implementation work, not tests claimed to have run during specification authoring.

## Dependency evidence

- `$loader_modelProvider.ts`: {"file": "$loader_modelProvider.ts", "calls": ["ctx.fns.procs.modules.list", "ctx.fns.procs.log.debug"], "state": ["ctx.state.models", "ctx.state.procs.boot.entries"], "sqlTables": []}
- `$migration_20370201120000_llm_connections.ts`: {"file": "$migration_20370201120000_llm_connections.ts", "calls": ["ctx.fns.procs.db.exec"], "state": [], "sqlTables": ["llm_connections", "local_secrets"]}
- `$migration_20370401120000_llm_connection_disabled_models.ts`: {"file": "$migration_20370401120000_llm_connection_disabled_models.ts", "calls": ["ctx.fns.procs.db.exec"], "state": [], "sqlTables": ["llm_connections"]}
- `$migration_20370402120000_llm_connection_models_cache.ts`: {"file": "$migration_20370402120000_llm_connection_models_cache.ts", "calls": ["ctx.fns.procs.db.exec"], "state": [], "sqlTables": ["llm_connections"]}
- `$modelProvider_claude.ts`: {"file": "$modelProvider_claude.ts", "calls": ["ctx.fns.models.claudeAuth", "ctx.fns.llm.claudeCodeCliVersion", "ctx.fns.llm.classifyError", "ctx.fns.models.claudeRequest", "ctx.fns.models.get", "ctx.fns.models.cached", "ctx.fns.llm.toAnthropicMessages", "ctx.fns.llm.resolveReasoningEffort", "ctx.fns.llm.parseSSE", "ctx.fns.models.claudeLogin"], "state": [], "sqlTables": []}
- `$modelProvider_codex.ts`: {"file": "$modelProvider_codex.ts", "calls": ["ctx.fns.models.codexAuth", "ctx.fns.models.codexFailure", "ctx.fns.models.failure", "ctx.fns.models.codexVersion", "ctx.fns.models.parseSSE", "ctx.fns.models.codexReasoningProfile", "ctx.fns.models.codexInput", "ctx.fns.models.codexQuota", "ctx.fns.models.codexLogin"], "state": [], "sqlTables": []}
- `$modelProvider_custom.ts`: {"file": "$modelProvider_custom.ts", "calls": ["ctx.fns.models.customProtocol"], "state": [], "sqlTables": []}
- `$route_api_GET.ts`: {"file": "$route_api_GET.ts", "calls": ["ctx.fns.models.api"], "state": [], "sqlTables": []}
- `$route_api_POST.ts`: {"file": "$route_api_POST.ts", "calls": ["ctx.fns.models.api"], "state": [], "sqlTables": []}
- `$start.ts`: {"file": "$start.ts", "calls": ["ctx.fns.models.refreshAll", "ctx.fns.procs.log.warn"], "state": [], "sqlTables": []}
- `$stop.ts`: {"file": "$stop.ts", "calls": [], "state": [], "sqlTables": []}
- `ActionValue.ts`: {"file": "ActionValue.ts", "calls": [], "state": [], "sqlTables": []}
- `Checkpoint.ts`: {"file": "Checkpoint.ts", "calls": [], "state": [], "sqlTables": []}
- `CheckpointEntry.ts`: {"file": "CheckpointEntry.ts", "calls": [], "state": [], "sqlTables": []}
- `CompactRequest.ts`: {"file": "CompactRequest.ts", "calls": [], "state": [], "sqlTables": []}
- `CompactResult.ts`: {"file": "CompactResult.ts", "calls": [], "state": [], "sqlTables": []}
- `ConnectionView.ts`: {"file": "ConnectionView.ts", "calls": [], "state": [], "sqlTables": []}
- `FailureInfo.ts`: {"file": "FailureInfo.ts", "calls": [], "state": [], "sqlTables": []}
- `FieldSpec.ts`: {"file": "FieldSpec.ts", "calls": [], "state": [], "sqlTables": []}
- `LoginFlow.ts`: {"file": "LoginFlow.ts", "calls": [], "state": [], "sqlTables": []}
- `ModelInfo.ts`: {"file": "ModelInfo.ts", "calls": [], "state": [], "sqlTables": []}
- `ProviderDefinition.ts`: {"file": "ProviderDefinition.ts", "calls": [], "state": [], "sqlTables": []}
- `ProviderState.ts`: {"file": "ProviderState.ts", "calls": [], "state": [], "sqlTables": []}
- `ProviderView.ts`: {"file": "ProviderView.ts", "calls": [], "state": [], "sqlTables": []}
- `QuotaObservation.ts`: {"file": "QuotaObservation.ts", "calls": [], "state": [], "sqlTables": []}
- `ReasoningCapabilities.ts`: {"file": "ReasoningCapabilities.ts", "calls": [], "state": [], "sqlTables": []}
- `ReasoningLevel.ts`: {"file": "ReasoningLevel.ts", "calls": [], "state": [], "sqlTables": []}
- `ReasoningResolution.ts`: {"file": "ReasoningResolution.ts", "calls": [], "state": [], "sqlTables": []}
- `ResolvedConnection.ts`: {"file": "ResolvedConnection.ts", "calls": [], "state": [], "sqlTables": []}
- `State.ts`: {"file": "State.ts", "calls": [], "state": [], "sqlTables": []}
- `StreamEvent.ts`: {"file": "StreamEvent.ts", "calls": [], "state": [], "sqlTables": []}
- `StreamRequest.ts`: {"file": "StreamRequest.ts", "calls": [], "state": [], "sqlTables": []}
- `StreamResult.ts`: {"file": "StreamResult.ts", "calls": [], "state": [], "sqlTables": []}
- `TestResult.ts`: {"file": "TestResult.ts", "calls": [], "state": [], "sqlTables": []}
- `TransportSpec.ts`: {"file": "TransportSpec.ts", "calls": [], "state": [], "sqlTables": []}
- `UsageReport.ts`: {"file": "UsageReport.ts", "calls": [], "state": [], "sqlTables": []}
- `action.ts`: {"file": "action.ts", "calls": ["ctx.fns.models.get", "ctx.fns.models.resolve", "ctx.fns.models.safeMessage"], "state": ["ctx.state.models"], "sqlTables": []}
- `api.ts`: {"file": "api.ts", "calls": ["ctx.fns.models.safeMessage", "ctx.fns.models.list", "ctx.fns.socksProxy.list", "ctx.fns.sshInstance.list", "ctx.fns.models.providers", "ctx.fns.frontendBridge.iconData", "ctx.fns.auth.csrfToken", "ctx.fns.http.publicOrigin", "ctx.fns.auth.verifyCsrf", "ctx.fns.models.get", "ctx.fns.models.create", "ctx.fns.models.update", "ctx.fns.models.remove", "ctx.fns.models.setModelEnabled", "ctx.fns.models.test", "ctx.fns.models.listModels", "ctx.fns.models.usage", "ctx.fns.models.action"], "state": [], "sqlTables": []}
- `assertModelEnabled.ts`: {"file": "assertModelEnabled.ts", "calls": ["ctx.fns.models.get"], "state": [], "sqlTables": []}
- `availability.test.ts`: {"file": "availability.test.ts", "calls": ["ctx.fns.models.create", "ctx.fns.models.setModelEnabled", "ctx.fns.models.listModels", "ctx.fns.models.get", "ctx.fns.models.stream", "ctx.fns.models.compact", "ctx.fns.models.update"], "state": ["ctx.state.models", "ctx.state.models.providers", "ctx.state.models.health", "ctx.state.registry.models.fetch", "ctx.state.registry.auth.verifyCsrf"], "sqlTables": []}
- `cached.ts`: {"file": "cached.ts", "calls": [], "state": ["ctx.state.models"], "sqlTables": []}
- `checkInput.ts`: {"file": "checkInput.ts", "calls": ["ctx.fns.models.failure"], "state": [], "sqlTables": []}
- `claudeAuth.test.ts`: {"file": "claudeAuth.test.ts", "calls": ["ctx.fns.secrets.putLocal", "ctx.fns.models.create", "ctx.fns.models.resolve", "ctx.fns.models.claudeLogin", "ctx.fns.procs.db.select", "ctx.fns.models.claudeAuth"], "state": ["ctx.state.models", "ctx.state.models.claudeFlows.test.expiresAt", "ctx.state.models.providers", "ctx.state.registry.models.validateTransport", "ctx.state.registry.models.fetch"], "sqlTables": ["local_secrets"]}
- `claudeAuth.ts`: {"file": "claudeAuth.ts", "calls": ["ctx.fns.procs.db.select", "ctx.fns.secrets.decryptLocal", "ctx.fns.secrets.encryptLocal", "ctx.fns.procs.db.run", "ctx.fns.procs.events.refresh", "ctx.fns.secrets.deleteLocal", "ctx.fns.secrets.putLocal", "ctx.fns.llm.anthropicOAuthConstants", "ctx.fns.models.claudeRequest"], "state": ["ctx.state.models"], "sqlTables": ["local_secrets", "llm_connections"]}
- `claudeLogin.ts`: {"file": "claudeLogin.ts", "calls": ["ctx.fns.llm.anthropicOAuthConstants", "ctx.fns.llm.parseAnthropicAuthorizationInput", "ctx.fns.models.claudeRequest", "ctx.fns.models.claudeAuth"], "state": ["ctx.state.models"], "sqlTables": []}
- `claudeProtocol.test.ts`: {"file": "claudeProtocol.test.ts", "calls": ["ctx.fns.models.claudeRequest", "ctx.fns.llm.streamAnthropic", "ctx.fns.llm.compactAnthropic"], "state": ["ctx.state.registry.models.claudeAuth", "ctx.state.registry.llm.claudeCodeCliVersion", "ctx.state.registry.models.get", "ctx.state.registry.models.cached", "ctx.state.registry.llm.resolveEndpoint", "ctx.state.registry.llm.getAnthropicOAuthToken", "ctx.state.registry.agent.buildLlmRequest", "ctx.state.registry.agent.wireTools", "ctx.state.registry.llm.recordUsage", "ctx.state.registry.llm.claudeFetch"], "sqlTables": []}
- `claudeRequest.ts`: {"file": "claudeRequest.ts", "calls": ["ctx.fns.llm.anthropicOAuthConstants"], "state": [], "sqlTables": []}
- `codex.test.ts`: {"file": "codex.test.ts", "calls": ["ctx.fns.models.create", "ctx.fns.models.resolve", "ctx.fns.models.codexAuth", "ctx.fns.models.codexLogin", "ctx.fns.models.action", "ctx.fns.models.test", "ctx.fns.procs.db.select", "ctx.fns.models.listModels", "ctx.fns.models.usage", "ctx.fns.models.stream", "ctx.fns.models.setModelEnabled", "ctx.fns.models.compact"], "state": ["ctx.state.models", "ctx.state.models.providers", "ctx.state.models.health", "ctx.state.models.codexRefresh", "ctx.state.models.loginFlows", "ctx.state.registry.models.validateTransport", "ctx.state.registry.models.fetch", "ctx.state.registry.llm"], "sqlTables": ["local_secrets"]}
- `codexAuth.ts`: {"file": "codexAuth.ts", "calls": ["ctx.fns.procs.db.select", "ctx.fns.secrets.decryptLocal", "ctx.fns.secrets.encryptLocal", "ctx.fns.procs.db.run", "ctx.fns.procs.events.refresh", "ctx.fns.procs.log.debug", "ctx.fns.secrets.deleteLocal", "ctx.fns.secrets.putLocal", "ctx.fns.models.codexAuth"], "state": ["ctx.state.models", "ctx.state.models.codexRefresh"], "sqlTables": ["local_secrets", "llm_connections"]}
- `codexFailure.ts`: {"file": "codexFailure.ts", "calls": [], "state": [], "sqlTables": []}
- `codexInput.ts`: {"file": "codexInput.ts", "calls": ["ctx.fns.models.failure"], "state": [], "sqlTables": []}
- `codexLogin.ts`: {"file": "codexLogin.ts", "calls": ["ctx.fns.models.codexAuth", "ctx.fns.models.safeMessage"], "state": ["ctx.state.models", "ctx.state.models.loginFlows"], "sqlTables": []}
- `codexParity.test.ts`: {"file": "codexParity.test.ts", "calls": ["ctx.fns.models.create", "ctx.fns.models.resolve", "ctx.fns.models.codexAuth", "ctx.fns.models.stream", "ctx.fns.models.listModels", "ctx.fns.models.resolveReasoning", "ctx.fns.models.compact", "ctx.fns.models.update"], "state": ["ctx.state.models", "ctx.state.models.providers", "ctx.state.models.health", "ctx.state.models.codexRefresh", "ctx.state.models.loginFlows", "ctx.state.registry", "ctx.state.registry.models.validateTransport", "ctx.state.registry.models.fetch"], "sqlTables": []}
- `codexQuota.ts`: {"file": "codexQuota.ts", "calls": [], "state": [], "sqlTables": []}
- `codexReasoningProfile.ts`: {"file": "codexReasoningProfile.ts", "calls": [], "state": [], "sqlTables": []}
- `codexVersion.ts`: {"file": "codexVersion.ts", "calls": [], "state": [], "sqlTables": []}
- `compact.ts`: {"file": "compact.ts", "calls": ["ctx.fns.models.assertModelEnabled", "ctx.fns.models.checkInput", "ctx.fns.models.resolve"], "state": ["ctx.state.models"], "sqlTables": []}
- `connections.test.ts`: {"file": "connections.test.ts", "calls": ["ctx.fns.models.create", "ctx.fns.procs.db.select", "ctx.fns.models.validateConfig", "ctx.fns.models.list", "ctx.fns.models.get", "ctx.fns.secrets.getLocal", "ctx.fns.models.update", "ctx.fns.models.remove", "ctx.fns.models.test", "ctx.fns.models.usage", "ctx.fns.models.listModels", "ctx.fns.models.refreshAll", "ctx.fns.procs.db.run", "ctx.fns.models.action"], "state": ["ctx.state.models", "ctx.state.models.providers", "ctx.state.models.health", "ctx.state.models.providers.acme.definition.listModels", "ctx.state.registry.auth.verifyCsrf", "ctx.state.registry.auth.csrfToken"], "sqlTables": ["local_secrets", "llm_connections"]}
- `create.ts`: {"file": "create.ts", "calls": ["ctx.fns.models.validateConfig", "ctx.fns.models.validateTransport", "ctx.fns.procs.db.transaction", "ctx.fns.secrets.putLocal", "ctx.fns.procs.db.run", "ctx.fns.models.get"], "state": ["ctx.state.models"], "sqlTables": ["llm_connections"]}
- `custom.test.ts`: {"file": "custom.test.ts", "calls": ["ctx.fns.models.customProtocol", "ctx.fns.models.validateConfig", "ctx.fns.models.create", "ctx.fns.models.listModels", "ctx.fns.models.test", "ctx.fns.models.usage", "ctx.fns.procs.db.run"], "state": ["ctx.state.models", "ctx.state.models.providers", "ctx.state.registry.socksProxy.validateIdentity", "ctx.state.registry.socksProxy.readSaved", "ctx.state.registry.socksProxy.request"], "sqlTables": ["socks_proxies"]}
- `customProtocol.ts`: {"file": "customProtocol.ts", "calls": [], "state": [], "sqlTables": []}
- `failure.ts`: {"file": "failure.ts", "calls": ["ctx.fns.models.safeMessage"], "state": [], "sqlTables": []}
- `fetch.ts`: {"file": "fetch.ts", "calls": ["ctx.fns.socksProxy.readSaved", "ctx.fns.sshProvider.tunnel", "ctx.fns.socksProxy.request"], "state": [], "sqlTables": []}
- `get.ts`: {"file": "get.ts", "calls": ["ctx.fns.procs.db.select", "ctx.fns.models.toView"], "state": [], "sqlTables": ["llm_connections"]}
- `list.ts`: {"file": "list.ts", "calls": ["ctx.fns.procs.db.select", "ctx.fns.models.toView"], "state": [], "sqlTables": ["llm_connections"]}
- `listModels.ts`: {"file": "listModels.ts", "calls": ["ctx.fns.models.get", "ctx.fns.procs.db.select", "ctx.fns.models.resolve", "ctx.fns.procs.db.run", "ctx.fns.models.safeMessage"], "state": ["ctx.state.models"], "sqlTables": ["llm_connections"]}
- `parseSSE.ts`: {"file": "parseSSE.ts", "calls": [], "state": [], "sqlTables": []}
- `providers.test.ts`: {"file": "providers.test.ts", "calls": ["ctx.fns.procs.modules.list"], "state": ["ctx.state.models.providers", "ctx.state.procs.boot.entries"], "sqlTables": []}
- `providers.ts`: {"file": "providers.ts", "calls": [], "state": ["ctx.state.models"], "sqlTables": []}
- `refreshAll.ts`: {"file": "refreshAll.ts", "calls": ["ctx.fns.models.list", "ctx.fns.models.listModels", "ctx.fns.models.safeMessage"], "state": ["ctx.state.models"], "sqlTables": []}
- `registryReload.test.ts`: {"file": "registryReload.test.ts", "calls": ["ctx.fns.models.providers", "ctx.fns.procs.repl.load"], "state": ["ctx.state.root", "ctx.state.registry.runtime.docs.index", "ctx.state.models.providers"], "sqlTables": []}
- `remove.ts`: {"file": "remove.ts", "calls": ["ctx.fns.models.get", "ctx.fns.procs.db.transaction", "ctx.fns.procs.db.select", "ctx.fns.secrets.deleteLocal", "ctx.fns.procs.db.run"], "state": ["ctx.state.models"], "sqlTables": ["llm_connections", "local_secrets"]}
- `resolve.ts`: {"file": "resolve.ts", "calls": ["ctx.fns.models.get", "ctx.fns.secrets.getLocal", "ctx.fns.models.fetch"], "state": ["ctx.state.models"], "sqlTables": []}
- `resolveReasoning.ts`: {"file": "resolveReasoning.ts", "calls": ["ctx.fns.models.failure"], "state": [], "sqlTables": []}
- `safeMessage.ts`: {"file": "safeMessage.ts", "calls": [], "state": [], "sqlTables": []}
- `setModelEnabled.ts`: {"file": "setModelEnabled.ts", "calls": ["ctx.fns.models.get", "ctx.fns.procs.db.run", "ctx.fns.procs.events.refresh", "ctx.fns.procs.log.debug"], "state": [], "sqlTables": ["llm_connections"]}
- `stream.ts`: {"file": "stream.ts", "calls": ["ctx.fns.models.assertModelEnabled", "ctx.fns.models.checkInput", "ctx.fns.procs.db.select", "ctx.fns.models.resolveReasoning", "ctx.fns.models.resolve"], "state": ["ctx.state.models"], "sqlTables": ["llm_connections"]}
- `test.ts`: {"file": "test.ts", "calls": ["ctx.fns.models.get", "ctx.fns.models.cached", "ctx.fns.models.resolve", "ctx.fns.models.safeMessage"], "state": [], "sqlTables": []}
- `toView.ts`: {"file": "toView.ts", "calls": [], "state": ["ctx.state.models"], "sqlTables": []}
- `transport.test.ts`: {"file": "transport.test.ts", "calls": [], "state": [], "sqlTables": []}
- `update.ts`: {"file": "update.ts", "calls": ["ctx.fns.models.get", "ctx.fns.models.validateConfig", "ctx.fns.models.validateTransport", "ctx.fns.procs.db.transaction", "ctx.fns.procs.db.select", "ctx.fns.secrets.deleteLocal", "ctx.fns.secrets.putLocal", "ctx.fns.procs.db.run"], "state": ["ctx.state.models"], "sqlTables": ["llm_connections"]}
- `usage.ts`: {"file": "usage.ts", "calls": ["ctx.fns.models.get", "ctx.fns.models.test", "ctx.fns.models.cached", "ctx.fns.models.resolve"], "state": ["ctx.state.models"], "sqlTables": []}
- `validateConfig.ts`: {"file": "validateConfig.ts", "calls": [], "state": ["ctx.state.models"], "sqlTables": []}
- `validateTransport.ts`: {"file": "validateTransport.ts", "calls": ["ctx.fns.socksProxy.validateIdentity", "ctx.fns.procs.db.select", "ctx.fns.sshInstance.get"], "state": [], "sqlTables": ["socks_proxies"]}

## Specific risks

- codexParity.test.ts:351-355 hard-coded root source reads become vacuous on wrappers: check moved implementations AND wrappers.
- claudeAuth.test.ts, transport.test.ts, providers.test.ts directly import helpers with minimal mocks: wrapper delegation needs nested mocks or separate implementation imports; _testCtx entry must load nested names.
- Retain shared ctx.state.models providers/health/codexRefresh/loginFlows; no state split or cache duplication.
- Preserve synchronous helpers such as providers; generic cached callback/result types.
- Keep root declarations singular: registryReload.test verifies owner identity and reload.
- Claude relies on llm OAuth/message/protocol helpers; Codex boundary tests prohibit legacy llm/agent/session dependencies.
- Preserve conn.fetch binding/allowlists, abort/timeout semantics, auth callback closures, secrets and revision/CAS semantics.
- Preserve api owner auth/CSRF/body-size/content-type guards; routes unchanged.
- No external indexed callers found in src/frontend/plugins; external private plugins may still require root aliases.
- models.stream documents agents still use llm.stream: do not migrate legacy llm execution in this refactor.
