## 1. Baseline and compatibility harness

- [x] 1.1 Reconcile inventory.md against the current tree and external consumer search; record additions since specification preparation without silently widening scope.
- [x] 1.2 Record existing model tests, affected LLM/frontend bridge tests, typecheck and code.quality baseline; distinguish unrelated failures.
- [x] 1.3 Snapshot public root procedure signatures, sync/async semantics, public type names, provider ids and HTTP contracts.
- [x] 1.4 Add compatibility tests through public facades, fresh-discovery namespace collision/missing-target tests and nested hot-reload tests using isolated state.

## 2. Provider implementations

- [x] 2.1 Move Claude helpers into models/provider/claude with typed root delegates; update local tests and mocks.
- [x] 2.2 Extract substantive Claude declaration operation bodies into provider-local procedures, retaining root declaration metadata, ownership and callback contract.
- [x] 2.3 Move Codex helpers into models/provider/codex with typed root delegates; retain wire headers/version, conversion, reasoning, quota, continuation and safe failures.
- [x] 2.4 Extract substantive Codex declaration operations with dynamic ctx.fns dispatch and verify cold boot and reload.
- [x] 2.5 Move custom protocol implementation and extract substantive custom declaration operations into models/provider/custom; preserve custom endpoint validation and schema behavior.
- [x] 2.6 Run focused auth/protocol/parity/custom tests through both facade and implementation; verify no concrete-provider cross-dependency.

## 3. Transport and catalogue

- [x] 3.1 Move transport implementations per inventory, retain root delegates and preserve destination safety, signal/timeout semantics and no-direct-fallback.
- [x] 3.2 Move catalogue/cache and model-toggle implementations per inventory without schema or cached-value migration.
- [x] 3.3 Update refresh lifecycle calls only where necessary, retaining root lifecycle identities and existing timer behavior.
- [x] 3.4 Verify transport tests, model availability and cache retention/refresh behavior with offline fixtures.

## 4. Connections and inference

- [x] 4.1 Move connection persistence, validation, projection and resolution implementations; retain ctx.state.models ownership and secret scoping.
- [x] 4.2 Move provider action/test dispatch per inventory, retaining action names and login flow semantics.
- [x] 4.3 Move stream/compact, request validation, reasoning, error and usage helpers per inventory; preserve all original public root signatures.
- [x] 4.4 Verify disabled-state and unsupported-capability pre-network rejection, checkpoint/state identity validation, cancellation, callback event order, error semantics and token/quota observations.
- [x] 4.5 Verify connection CRUD, saved values and secret-free projections, including external frontend bridge/LLM callers.

## 5. Integration and runtime lifecycle

- [x] 5.1 Audit internal callers and string dispatch for stale targets or facade recursion; keep routes, migrations, declarations, loader and public types at root.
- [x] 5.2 Update path-based test fixtures and partial runtime stubs without dropping public compatibility coverage.
- [x] 5.3 Regenerate types and explicitly reload new leaves before callers, using full dotted procedure names or exact slash-delimited module directories.
- [x] 5.4 Validate changed runtime procedure documentation strictly, run one full typecheck for the settled batch, and reload declarations once targets exist (see acceptance.md).
- [x] 5.5 Test clean discovery/boot and declaration/implementation hot reload without stale registry entries or live credentials.
- [x] 5.6 Document per-stage rollback, including retained live registry entries and isolated clean-runtime verification.

## 6. Acceptance

- [x] 6.1 Run `bun test ./src/models/ --timeout 20000` and the affected consumer/loader suites identified in inventory.md.
- [x] 6.2 Run repository typecheck and code.quality; confirm no new missing runtime targets, boundary breaks, project-file cross-imports or namespace collisions.
- [x] 6.3 Confirm every original file has its documented disposition, every moved public function retains a facade, and all new provider operation targets are documented and tested.
- [x] 6.4 Update docs/models-providers.md with internal navigation and reload instructions while retaining all public SDK documentation.
- [x] 6.5 Confirm no HTTP, UI, storage, provider id, permission/CSRF, credential or external-plugin migration is required.
- [x] 6.6 Run strict OpenSpec validation and present final implementation evidence for review; archive only on separate authorization.

Implementation and verification are complete; evidence and pre-existing validation failures are recorded in acceptance.md. No archive was performed; archiving requires separate authorization.
