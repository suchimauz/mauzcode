# Block 1 baseline and compatibility evidence

Captured before provider/transport migrations; parent notified immediately after capture. Raw bounded reports are in `.mauzcode/tmp/hm/baseline/` (local ignored evidence, not production files).

## Commands and results

- `bun test src/models src/llm src/procs/repl.test.ts src/procs/repl src/frontendRuntime`: **581 pass, 3 skip, 0 fail**, 91 files, 2690 assertions. `tests.log`, `tests.exit` (0).
- Supplemental verification by parent after the initial baseline gate: `bun test ./src/frontendBridge/models.test.ts --timeout 20000`: **5 pass, 0 fail, 21 assertions**. The initial command above covered frontendRuntime, not frontendBridge; this result is not claimed as a pre-migration capture.
- `bun run frontend:test frontend/src/test/settings-models.test.tsx frontend/src/test/settings-llm.test.tsx frontend/src/test/settings-llm-policy.test.tsx frontend/src/test/model-group.test.ts frontend/src/test/model-effort.test.ts frontend/src/test/model-picker.test.tsx`: **36 pass**, 6 files. `frontend.log`, `frontend.exit` (0).
- `bunx tsc --noEmit`: **pre-existing failure**, exit 2, 418 diagnostics in 133 files (606 output lines). `typecheck.log`. Model-specific baseline diagnostics: codexParity.test.ts lines 225/266/290 TS7006; connections.test.ts line 24 TS2322 and line 241 TS2339. Other existing failures include overlay myhealthGaps missing healthrepo/flow, and numerous agent/frontend/LLM/webPush tests and implementations. Do not attribute these to this directory migration or suppress them. Compare full saved diagnostic identities, not total counts alone.
- `ctx.fns.code.quality({limit:10000})`: **ok:false**, 8 errors, 529 warnings. `quality.json`. All 8 errors are existing unresolved overlay calls: myhealthGaps.medicationContext → healthrepo.medications; myhealthGaps.submitMedication → healthrepo.recordMedicationIntake; skill.circlebackMeetingReady → circleback.sql; tunnel.ensure → tunnel.config, tunnel.status (twice), tunnel.close, tunnel.open. Counts: boundary 2, unresolved 8, formdata-to-string 59, empty-catch 127, lost-cause 5, floating-promise 9, untested 99, dead 154, test-only 74.

## Exact compatibility snapshot

`src/models/fixtures/public-contract.baseline.json` captures all **38 root procedure** parameter and return-type AST texts plus sync/async and generator flags; **25 public type files** verbatim; **3 original provider declaration source files** verbatim (claude/codex/custom, including ids, metadata, callback definitions); **2 HTTP route files** verbatim. The parseSSE generator bit is explicitly retained. Provider bodies are evidence, not immutable assertions: extracting them is the intended change. Type and route contracts plus procedure signatures are asserted by the new test.

## Inventory reconciliation

All **84 original root TypeScript files** are covered by inventory.md; no unlisted pre-migration root source files were found. The external ctx.fns.models procedural-call search across src, frontend and plugins found no external procedural consumers; this does not establish absence of external types.models references. Frontend ModelsPanel uses HTTP; frontendRuntime tests were captured initially, and the required frontendBridge models API tests were verified separately afterward as recorded above. Existing inventory scope is unchanged. New files introduced by block 1 are only this evidence, the JSON snapshot and `src/models/internalCompatibility.test.ts`. Existing registryReload.test.ts is retained unchanged.

## Isolated harness

`bun test src/models/internalCompatibility.test.ts src/models/registryReload.test.ts`: **3 pass, 0 fail, 239 assertions** at initial harness completion (assertion count grows as real facade targets appear).

The new harness uses real boot scanning and the injecting proxy in a fresh context. Only unrelated documentation indexing is stubbed. It verifies public signature/type/HTTP compatibility, actual migrated facade/declaration nested target presence, callable models.providers and provider ids, no callable/namespace prefix collisions with an explicit plural-providers negative control, invocation failure for a missing nested target, options/callback/AbortSignal/error identity, exact dotted-leaf and slash-directory hot reload, and a dynamically dispatched provider declaration before/after owner reload. All fixtures are local and removed in finally; no provider credentials or external requests are used. Existing root semantic model tests remain the real operation characterization suite; invented fixtures test loader/proxy mechanics, not provider behavior.

No production models, public declarations, routes or task checkboxes were changed by block 1. No operational restart or registry cleanup was performed.
