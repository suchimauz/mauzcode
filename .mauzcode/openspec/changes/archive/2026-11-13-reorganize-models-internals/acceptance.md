# Blocks 4–6 implementation evidence

Completed directly by the parent agent, without subagents. No commit, push, archive, live credential login, operational restart or registry deletion was performed.

## Connections and inference

Nineteen remaining implementations moved exactly as inventory.md specifies: thirteen to `models/connections`, six to `models/inference`. Leaf source bodies are byte-identical to their pre-move roots. Root files retain their original typed signatures and sync/async behavior and contain one dynamic delegation statement. Public `usage` belongs to connections (health/quota observation), while inference response usage remains part of stream/compact results.

State remains owned by `ctx.state.models`. Secret access stays limited to registered secret fields and `<connection-id>.<field>` under namespace `models`. Connection persistence, cached JSON values, timers, saved transport routing, provider action names and login semantics are unchanged. Internal calls through public roots are intentionally retained as compatibility/test seams; all resolve to the new leaves without recursion. No forced consumer migration was needed.

Added 29 focused tests in `connections/compatibility.test.ts` and `inference/compatibility.test.ts`. They cover all nineteen facade targets, sync/Promise and error identity, shared health-cache state and eviction, secret scope and transport propagation, disabled/unsupported pre-resolution rejection, checkpoint/state identity, cancellation, ordered callback and signal identity, compact checkpoints, provider failures and token/quota result preservation. Existing CRUD/API/availability/Codex protocol tests continue through the real root facades into the new leaves. The first new facade test incorrectly classified validateConfig as synchronous; corrected the test to its original async contract, not the implementation.

## Integration and lifecycle

- Regenerated types; explicitly reloaded nineteen full dotted leaf names before nineteen roots, then reloaded `models` declarations after targets existed. No service restart or route-source change.
- Strict documentation validation: all **113 models runtime procedures pass** with `strict:true,typecheck:false`. Complete project typechecking was run separately for the settled batch, not repeated for every function. The initial check found two fixture parameter typing errors; after fixing them the final complete check matches baseline exactly.
- Fresh isolated discovery, no callable/namespace collision, missing-target negative control, dynamic nested leaf reload, exact slash-directory reload and declaration replacement are covered by internalCompatibility/registryReload tests. These tests use local fixtures, not live credentials.
- All **84 original files** have existing documented destinations. All **36 moved public procedures** have one-statement delegates to the documented targets. No production models file cross-imports another project file.
- Original 38 public procedure signatures, sync/generator flags, 25 public type files, two HTTP route files and three provider registration shapes pass immutable baseline comparisons.
- docs/models-providers.md now documents internal navigation, exact reload syntax, leaf-before-facade/declaration ordering and per-stage rollback. It explicitly warns that deleting source/reloading does not remove retained registry entries; verification uses a fresh isolated runtime.

## Final checks

Raw evidence is in `.mauzcode/tmp/hs/` (local, ignored):

| Check | Result | Evidence |
| --- | --- | --- |
| `bun test ./src/models/ --timeout 20000` | **168 pass, 0 fail**, 1311 assertions, 15 files | `acceptance-models.log` |
| Models + all llm + procs/repl + classify + frontendRuntime + frontendBridge/models + code/index | **588 pass, 3 skip, 0 fail**, 2895 assertions, 86 files | `acceptance-tests.log` |
| Additional code quality/callers suites | **17 pass, 0 fail**, 61 assertions | `acceptance-code.log` |
| Six affected frontend settings/model suites | **36 pass**, 6 files | `acceptance-frontend.log` |
| Full `procs.dev.typecheck({})` | **418 pre-existing diagnostics**, zero added/removed diagnostic identities vs block 3 | `acceptance-typecheck.json` |
| Full reindex + code.quality | **8 pre-existing errors, 578 warnings**; no new errors/boundary findings, no models errors | `quality-before.json`, `quality-after.json` |
| Strict docs validation | **113 pass**, zero failures | `acceptance-docs.json` |
| Inventory/facade/import audit | **84 files, 36 delegates**, zero missing destinations/facade failures/project imports | `acceptance-audit.json` |
| `git diff --check` | pass | command output |
| Strict OpenSpec validation | valid | `openspec.run validate reorganize-models-internals --strict` |

The broad suite includes the models tests; counts above must not be added as if disjoint. Three skipped tests require a live LM Studio instance. Typecheck and code.quality are **not globally clean**: existing unrelated failures recorded in baseline.md remain (including private overlay unresolved targets). They were compared, not suppressed or fixed as part of this refactor. Warnings are unchanged from the immediate block-3 baseline (578), but above the initial pre-provider baseline (529).

## Compatibility / review outcome

No HTTP, UI, storage, provider-id, permission/CSRF, credential or external-plugin migration is required. Provider declarations, root types, routes, migrations and loader identities remain intact. The implementation is ready for review; archive requires separate authorization.
