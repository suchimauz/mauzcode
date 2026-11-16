# Follow-up acceptance — complete

## Final settled result

**Ready to close: all 23 tasks completed.** Final checks ran after the isolated route fixture repair, with no source edits or declaration regeneration between fast and typecheck. Logs/exits/hashes are under `.mauzcode/tmp/oo/acceptance/final/`; `manifest.json` records their SHA-256 values. HEAD remains `20d72297fb331a10488d33bc3385fadb5d73ab28` plus uncommitted repairs.

| Command | Final result | Log |
|---|---|---|
| `bun run test` | exit 0; 3650 pass, 12 skip, 0 fail; 617 files | `fast.log` |
| `./node_modules/.bin/tsc --noEmit --pretty false` | exit 0; no diagnostics | `root-typecheck.log` |
| `bun run frontend:test` | exit 0; 836 pass, 132 files | `frontend.log` |
| `./node_modules/.bin/tsc --noEmit --pretty false -p frontend/tsconfig.json` | exit 0 | `frontend-typecheck.log` |

`inputs-before.json` and `inputs-after.json` resolve and hash all 4423 root compiler inputs, including private/generated files and dependency declarations. Their fingerprints match: `71bf0f68ca64cd4eae5593c29edf02ba5215a1fa345f87eed313cc814f757605`. The explicit shared-declaration SHA check also passes after fast and after the remaining checks. This demonstrates the fixture fix no longer overwrites the host declarations during the complete run.

Final `ledger.json` in that directory retains all 416 identities and enriched evidence: 86 tests pass, 315 retained diagnostic items resolve, and 15 approved-removal items remain labeled as removals. The 21 generated-namespace items now link the captured writer stack, fixture repair and fresh complete typecheck. Intermediate newly discovered compiler identities and the newly established declaration-writer defect are accounted for in this report/evidence-audit. Historical originating changes remain candidate/unattributed where no comparative evidence exists.

Post-check graph refresh: 1659 functions/198 types; `code.quality({})` reports `ok:true`, 0 errors and 544 warnings. `git diff --check` and strict OpenSpec validation pass. No new skips, suppression, narrowed compiler scope, plugin deletion or working-data mutation was introduced by this follow-up.

Limits carried forward: 12 existing skips and 544 graph warnings; integration/live suites not run; removal impact is bounded by dependency-inventory.md, including inert legacy search-link allowlist entries and unknown computed/historical consumers. These are not hidden acceptance claims. No archive, commit, push or deployment performed. Any subsequent source change invalidates this acceptance.

## Investigation history (superseded by final result above)

Evidence follow-up: `evidence-audit.md` supplies baseline metadata with explicit unknowns, exact candidate contracts and compiler inclusion chains; `dependency-inventory.md` supplies mounted/source-only inventory and bounded removal impact. Tasks 1.1, 1.3, 1.4, 2.5, 4.5 and 5.1 are now evidenced independently of overall green acceptance. Historical review counts in verification.md describe the earlier review, not the current checklist.

Intermediate fast-log reconciliation is saved in `.mauzcode/tmp/oo/acceptance/fast-reconciliation.json`: all root-level saved ol logs were scanned for actual `(fail)` records (not error text from passing negative tests); duplicate end-of-run failure summaries were excluded. `remaining-fast.log` has six failures and `proxy-icon.log` one; each is an original baseline identity and each passes the fresh complete fast suite. Original baseline identities reconcile to 86. The two new compiler identities across saved intermediate checks are documented in evidence-audit.md. This audit preserves the earlier 21-diagnostic acceptance failure; its final resolution is recorded above.

Owner: parent session `oo`. Earlier failed attempts below are retained for reproducibility; only the final settled result above establishes acceptance.

## Batch 1

Source follow-up: documented mock model fixture contracts, corrected helper comments, two core fixture tests and twenty frontend HTTP-response boundary cases. Source owner declared edits frozen before the full check. Existing repair implementation was not narrowed or excluded.

Environment receipt: `.mauzcode/tmp/oo/acceptance/environment.json` (Bun 1.4.4, TypeScript 5.9.3, observed test DB container bound to loopback port 54399). Tracked/nonignored tree snapshot before checking: `before.json` in the same directory. The initial runner wrapper failed before launching a check because Bun does not accept `stderr:'stdout'`; it was corrected to a shared file descriptor. This wrapper failure did not execute or count as a project check.

| Check | Outcome | Evidence |
|---|---|---|
| `bun run test` | exit 0; 3650 pass, 12 skip, 0 fail; 617 files | `.mauzcode/tmp/oo/acceptance/fast.log`, `fast.exit` |
| `./node_modules/.bin/tsc --noEmit --pretty false` | exit 2; 21 diagnostics | `.mauzcode/tmp/oo/acceptance/root-typecheck.log`, `root-typecheck.exit` |
| Full frontend tests/typecheck | not started after failure | no acceptance claim |

Commands, timestamps and SHA-256 values are in `.mauzcode/tmp/oo/acceptance/checks.json`. Complete diagnostics are preserved.

The 21 diagnostics concern missing generated plugin namespaces/types: gh.api (5), browser/cdp (7), opencodeGo (4), telegram (3), and rtk (2). `src/ctx_ns.d.ts` was modified during the fast run (mtime inside its start/end window); the generated declaration lost plugin namespaces that existed earlier, while the live inventory previously showed the plugins mounted. This is evidence of declaration drift, not evidence that the approved removals removed those plugins. The exact writer and durable correction are under investigation; coincidence with the test window does not establish that a test wrote the file. Supported live `procs.dev.genTypes({})` subsequently restored the missing namespaces (119 modules, 198 types, 35 state slots). No fresh typecheck is claimed yet. No manual generated-declaration edit, check exclusion or suppression is permitted. Full acceptance remains blocked pending investigation and a settled recheck.

## Monitored reproduction

After supported regeneration, `.mauzcode/tmp/oo/acceptance/settled-before.json` hashes all 4423 compiler-resolved inputs (including ignored private/generated sources and declarations). A second full fast run again passed: 3650 pass, 12 skip, 0 fail, 617 files (`settled-fast.log`, exit 0). But comparison to `declarations-before.sha256` failed immediately afterwards and browser/opencodeGo/rtk/gh.api namespaces were again absent. This reproducible sequence rules out treating a one-time regeneration as durable acceptance; it still does not identify the initiating process/stack.

Full frontend tests independently passed: 836 tests in 132 files (`frontend.log`, exit 0). Root typecheck was not repeated on the known-broken declarations. The remaining investigation now owns one instrumented test run if required to capture the writer PID/stack; no parallel full checks or source suppression is authorized.

## Writer identified

Instrumented fast execution captured three actual shared-file writes in test PID 2200729. `.mauzcode/tmp/ov/writers.log` records the exact stack: `src/procs/dev/route.test.ts:19/27/39` → `procs.dev.route` → `procs.modules.reload` → `procs.dev.genTypes` → `Bun.write` of the repository's `src/ctx_ns.d.ts`. This replaces the earlier unknown-writer hypothesis with direct execution evidence. The fixture sets disposable WORKDIR but retains the host project root used by declaration generation. The repair is confined to fixture isolation: `modules.reload` deliberately walks prototypes to the root context, so setting only WORKDIR or the fork's root cannot isolate it. The route-authoring unit test now stubs that subsystem boundary on its private registry, asserts two reload requests, preserves its existing generated-source/conflict assertions, and verifies the host declaration hash stays unchanged. It also gives the fork an explicit disposable root. This is not an integration test of module reload. Focused checks pass 2/2; no shared-file writer calls were captured after the repair. Parent restored live declarations through the supported generator before focused regression checking. Source edits are frozen; final complete acceptance follows without regeneration between checks.
