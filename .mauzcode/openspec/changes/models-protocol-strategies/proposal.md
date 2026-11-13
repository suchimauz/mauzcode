## Why

The built-in `custom` provider picks its wire protocol through chains of `if` statements in one procedure (`models.provider.custom.customProtocol`): base URL versioning, API-key headers, the generation path and body, and catalogue parsing all branch on the protocol id, and an `operation: "models" | "generation"` string adds a second branch. Adding or changing a protocol means editing every branch, and providers cannot reuse a protocol. The previous reorganization (`reorganize-models-internals`) also left 23 root procedures that only forward to an internal namespace and have no callers outside `src/models`.

## What Changes

- Introduce a closed set of four shared wire protocols owned by core: `openai-chat`, `openai-responses`, `anthropic`, `gemini`. Each is a strategy implementing one contract (model discovery and a minimal probe), selected through a single registry lookup with no conditional branching on the protocol id.
- Authentication stays with the provider. A shared protocol never reads secrets — it receives only the transport-bound `fetch`, not the connection; it offers a helper that maps an API key to its standard headers, and the provider decides whether to use it.
- Providers that speak a standard wire protocol reuse a shared protocol from the registry; providers with their own wire behavior keep it as ordinary provider code. The provider SDK (`ProviderDefinition`) and the provider registration format do not change, and plugins cannot add shared protocols.
- Re-implement the `custom` provider on top of the registry. Its fields, select options, request paths, headers, bodies, result codes and the manual models list remain the same.
- Claude and Codex are not changed by this change except for call-site renames from the facade reduction. The provider entry point stays `ProviderDefinition.test`/`listModels`; a protocol is an implementation detail of the provider, so wrapping their wire code in a protocol object would add no caller.
- **BREAKING** (internal surface): remove 23 root forwarding procedures, keeping a minimal public facade of 13: `stream`, `compact`, `listModels`, `setModelEnabled`, `refreshAll`, `list`, `get`, `create`, `update`, `remove`, `test`, `usage`, `action`. The removed names are `assertModelEnabled`, `cached`, `checkInput`, `claudeAuth`, `claudeLogin`, `claudeRequest`, `codexAuth`, `codexFailure`, `codexInput`, `codexLogin`, `codexQuota`, `codexReasoningProfile`, `codexVersion`, `customProtocol`, `failure`, `fetch`, `parseSSE`, `resolveReasoning`, `resolve`, `safeMessage`, `toView`, `validateConfig`, `validateTransport`. Internal callers in `src/models`, including callers of the kept facade entries, move to the full `models.connections.*`, `models.inference.*`, `models.transport.*` and `models.provider.*` names. No caller exists outside `src/models` in `src`, `plugins`, `frontend` or the user plugin directory.

## Capabilities

### New Capabilities

- `llm-model-protocols`: the closed set of shared wire protocols, their strategy contract, registry selection and provider-owned authentication.

### Modified Capabilities

- `llm-custom-provider`: protocol-specific authentication is provided through the selected shared protocol, and the protocol select options must match the shared protocol set.
- `models-module-boundaries`: the stable public facade becomes a minimal public facade with an explicit list, and the responsibility namespaces gain `models.protocol`.

## Impact

- Code: `src/models/provider/custom/*`, new `src/models/protocol/**`, new public types `types.models.Protocol`, `ProtocolEndpoint`; 23 deleted root files; call-site updates in `api.ts`, `$modelProvider_codex.ts`, `connections/*`, `catalog/*`, `inference/*`, `provider/claude/*`, `provider/codex/*`.
- Tests: `custom.test.ts` rewritten, new protocol unit tests, root tests switched to full names, compatibility tests and `fixtures/public-contract.baseline.json` reduced to the minimal facade. Claude and Codex tests change only in procedure names; their expectations remain unchanged.
- Docs: `docs/models-providers.md` (internal procedure names, new protocol section).
- No change to HTTP API, UI, storage, migrations, secrets handling, provider ids or registration.
