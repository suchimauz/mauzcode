## Context

See proposal.md — Why. Initial inventory contains 84 files in `src/models`. Related published capabilities are `llm-provider-sdk`, `llm-connections`, `llm-network-transport`, `llm-model-cache`, `llm-model-availability`, `llm-claude-provider`, `llm-codex-provider`, `llm-custom-provider` and `models-settings-ui`. No other active change appeared in the OpenSpec snapshot when this change was created. Existing capabilities retain their requirements; only module-boundary guarantees are added.

`src/procs/project/scan.ts` scans nested paths; `classify.ts` derives runtime namespaces from directories. `src/procs/repl/load.ts` treats a dotted name as one procedure (last segment is the function), while a directory reload matches `entry.moduleDir` exactly. Thus `models.provider.codex` is NOT a valid request to reload that whole namespace: use exact slash-delimited `models/provider/codex` or full dotted procedure names. Provider registration hot reload replaces declarations but does not reconcile deleted entries. Tests are excluded from runtime discovery by `.test.ts` suffix.

## Goals / Non-Goals

The public facade is a compatibility boundary, not a second implementation. Internal movement must not require application or external plugin migrations. Preserve typed public contracts even for helper functions: names such as `models.checkInput` and `models.codexVersion` are documented and cannot be considered private merely because few indexed callers exist.

Do not change UI, storage, secret handling, provider protocols, framework loader semantics or the declarative registration format. Do not split public types merely to reduce the root file count. A flat compatibility surface is an intentional trade-off; the goal is navigable implementation responsibilities, not the smallest possible directory listing.

## Decisions

### Stable facade and explicit delegation

Retain every existing root runtime procedure identity. For a moved implementation, keep its original file as a small typed delegate, preserving sync/async behavior, callbacks, cancellation, errors and result shape. Do not add `async` to a synchronous helper. New implementation targets retain their existing basename, avoiding unnecessary simultaneous renaming. Internal calls use new targets where appropriate; root declarations dynamically dispatch through `ctx.fns` rather than capturing loaded implementation function objects.

Alternative rejected: moving everything and updating only currently indexed callers. External plugins, string dispatch, documentation and tests make that a breaking migration. Alternative rejected: re-exporting project files; it violates runtime hot reload conventions.

### Responsibility namespaces

| Namespace | Owns | Allowed model dependencies |
| --- | --- | --- |
| `models.connections` | Persistence, validation, safe projection, connection resolution, cached connection helper and provider actions/test/usage dispatch | transport; provider registry state; public types |
| `models.transport` | Transport validation and outbound HTTP/SSE plumbing | public types and existing non-model transport infrastructure |
| `models.catalog` | Model cache, listing, enabled-model configuration and refresh | connections; provider operations via resolved connection |
| `models.inference` | Stream/compact dispatch, guard checks, identity validation, reasoning and failure normalization | connections, catalog, provider operations via resolved connection |
| `models.provider.claude` | Claude authorization and protocol | resolved transport, shared inference helpers where already needed, existing credential infrastructure |
| `models.provider.codex` | Codex authorization, conversion, quota and protocol | same constraint; no dependency on other concrete providers |
| `models.provider.custom` | Custom protocol adaptation | resolved transport and shared inference/transport helpers |
| Root `models` | Public compatibility facade, registry/declarations, API, lifecycle, public types | internal namespaces |

Provider operation callbacks form the existing dispatch boundary; do not introduce concrete provider branching into generic inference. Avoid facade-to-implementation-to-same-facade recursion. Shared helpers follow their existing semantics; do not introduce new protocol abstractions to justify folders. Keep root `ctx.state.models` ownership and type unchanged; moving a procedure does not establish new state objects.

Provider declarations remain at root, but substantive protocol bodies embedded in them must become provider-local procedures in a later implementation task. Thin declaration callbacks and metadata remain in place. Extract only actual operation bodies discovered in each declaration, preserving provider callback signatures through typed adapters; enumerate new targets in the implementation review. This is extraction, not a redesigned provider SDK.

### Registration infrastructure stays put

Keep `$loader_modelProvider`, `$modelProvider_*`, `$route_*`, `$migration_*`, `$start`, `$stop`, root API dispatch and public types. Keep existing migration identities and SQL unchanged. Retaining declaration owners preserves hot reload registration and plugin ownership behavior. Keep `providers.ts` as the public registry projection; `provider/` (singular) prevents a function/namespace collision.

### Tests near responsibility, public tests at root

Retain all 10 existing tests at root as compatibility/integration coverage and update their path-based fixtures. Add new focused implementation tests beside the responsibility they exercise. Existing tests frequently load source by path or construct partial ctx stubs; update these deliberately rather than making tests pass by bypassing the facade. Add fresh-discovery tests so stale runtime entries cannot mask missing targets.

## Compatibility and data flow

HTTP `/models/api` → existing root API → root facade → responsibility implementation → resolved connection/provider callback → connection-bound transport. External callers continue using root entries. Secrets are read lazily only through existing scoped mechanisms; public views remain secret-free. Preserve permission and CSRF checks at their original layers.

Before moving code, capture baseline contracts and tests for disabled guards, unsupported operations, continuation/checkpoint binding, reasoning resolution, stream events, cancellation, timeout, safe error projection, quota and usage, cache retention on refresh failure, and transport no-direct-fallback. No SQL schema or stored-value migration is necessary.

## Risks / Trade-offs

- [Root directory remains populated] → Public types and compatibility wrappers intentionally stay; implementation navigation improves without breaking callers.
- [Nested reload interpreted as one procedure] → Use full procedure names or exact slash-delimited directory names; test the actual loader.
- [Stale live registry masks missing files] → Validate independent cold discovery/boot in isolated tests, not just the running process.
- [Provider declarations contain substantial code] → Extract into provider-local procedures while retaining declaration metadata and ownership; test operation dispatch after reload.
- [Test mocks and path fixtures encode old layout] → Inventory literal paths and ctx stubs; retain coverage through both old facade and new implementation.
- [Partial move changes sync/error behavior] → Preserve signatures and return semantics; assertions cover callbacks and thrown values, not only successful results.
- [Existing test/quality failures] → Record baseline and separate unrelated failures; never weaken behavior assertions for a directory move.

## Migration Plan

1. Baseline: capture the inventory, current public type/signature surface, existing test results and code quality results. Add characterization and namespace/facade tests.
2. Move provider helpers and extract declaration operation bodies, maintaining root wrappers and declarations.
3. Move transport and catalogue implementations; verify saved transport routing and cache semantics.
4. Move connection and inference implementations; verify all cross-cutting safeguards.
5. Update internal dependencies, focused test paths and developer documentation; remove only duplicated implementation bodies, never public facade names.
6. Regenerate types after add/remove operations. Load new leaves before callers, using explicit full procedure names (for example `models.provider.codex.codexInput`) or exact directories (`models/provider/codex`). Reload root declarations after their targets exist. Reload HTTP routes only if route source was actually edited. Validate changed runtime docs with strict/typecheck options.
7. Run isolated cold boot/discovery and reload tests, model suites, affected frontend bridge/LLM tests, typecheck, architecture checks and baseline-differenced quality checks. No real credential login or live provider/network request is necessary for compatibility tests.

Each responsibility step is independently reviewable and must pass its tests before the next begins. Rollback restores the prior code stage and regenerates types, then explicitly reloads restored targets and declarations. Do not claim this deletes new live registry entries: confirm no retained facade references them and use isolated fresh-runtime verification for correctness. Any operational restart or registry cleanup requires its own reviewed procedure; it is not part of specification authoring.

## Inventory and verification appendix

The companion `inventory.md` is the exhaustive source-to-destination and consumer/test evidence for this design. All paths in it are repository-relative. New extracted provider operation procedures augment that map; they do not remove declaration files or public names.
