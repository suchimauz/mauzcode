# Baseline, resolution and diagnostic evidence audit

This is an evidence supplement, not a new green acceptance report. No full check or source edit was performed by this audit. The source tree was changing concurrently; attached source hashes identify the inspected snapshot. Historical origins remain **unattributed**. In particular, a passing compiler run is not proof that a candidate archived change caused a diagnostic.

## Artifacts and integrity

- Original ledger, unchanged: `.mauzcode/tmp/ol/ledger.json` (416 entries, 86 failures + 330 diagnostics); SHA-256 `5173e37f2c01783191be890af7fc6ff6845c2f53e026b84e3889a3584dfdcd78` at inspection.
- Enriched **copy**: `.mauzcode/tmp/or/ledger-enriched.json`; SHA-256 `fada06554614c2bc31259421ce53051621f6f1b3c8729863df7634a92b802a0e`.
- `.mauzcode/tmp/or/file-evidence.json`: exact per-file working-tree diff and source hash/presence for every ledger file. These are present working-tree repairs, not historical revision comparisons.
- `.mauzcode/tmp/or/diagnostic-transitions.json`: complete parsed intermediate diagnostic sets, log hashes, saved exits, and newly observed identities.
- `.mauzcode/tmp/or/private-declaration-targets.json`: 16 direct private declaration import targets captured during the audit; **not** a transitive dependency closure or final settled fingerprint.
- Original logs and manifests were not overwritten. Scratch links are local audit artifacts; this document carries the durable conclusions and limitations.

## 1.1 Recovered baseline metadata

`ol/baseline/fast.log` starts with `$ bun script/test.ts fast` and `bun test v1.4.4 (38afee6c8) 4x PARALLEL`. Thus the inner fast command and Bun version are recorded, not inferred. `package.json` currently maps `test` to that command, but this does not establish whether the historical outer invocation was `bun test`, `bun run test`, or another shell wrapper. Baseline fast exit is 1; typecheck exit is 2. Baseline totals are 3557 pass, 12 skip, 86 fail and 330 TypeScript diagnostics.

The original `.mauzcode/tmp/oi/` has only fast/typecheck logs, exits and summary. Its typecheck log begins directly with a diagnostic: exact historical compiler command/options, historical HEAD, dirty-tree identity, dependency lock state, mount registry, generated declaration bytes, process environment, OS and working-directory receipt are **unknown** in the available recorded evidence. Current root tsconfig and package scripts describe current configuration only. The later `ol/verification-manifest.json` HEAD `20d72297fb331a10488d33bc3385fadb5d73ab28` explicitly labels its tree uncommitted; it cannot supply baseline revision provenance. Parent confirms the original execution command was not recovered. The old baseline manifest's pending note is superseded by these explicit limits, not silently filled in.

## 1.3 Exact candidate contracts and discriminating checks

All paths below are relative to `.mauzcode/openspec/changes/`; all links are candidate overlap only.

| Scope | Exact contract | Evidence / next discriminating check |
|---|---|---|
| Request/context/compaction/run fixtures | `archive/2026-11-14-migrate-runtime-to-models/specs/agent-model-inference/spec.md` — Agent turns stream through model connections; Context compaction through model connections | Missing requireModel/model routes in baseline and fixture diffs overlap this contract. Follow each failed stack through requireModel and models route/stream; compare archived implementation and fixture together before assigning origin. |
| Model architecture and compatibility | `archive/2026-11-13-reorganize-models-internals/specs/models-module-boundaries/spec.md` — Stable public model facade; Responsibility-focused implementation namespaces; Explicit nested runtime loading | Contract promises existing signatures/errors and public SDK types. Compare architecture assertions and scanner output with facade/implementation paths; altered test expectations alone are not a proven runtime regression. |
| Preset/browser prompt fixtures | `archive/2026-11-15-scope-preset-discovery/specs/agent-presets/spec.md` — Preset-scoped runtime reflection; Preset-scoped capability catalogues; Discovery tracks registry and snapshot lifecycle | Distinguish absent isolated prompts registry from actual mounted capability state. `archive/2026-11-15-add-agent-presets/specs/agent-presets/spec.md` is a second candidate (Preset definition), not attribution. |
| opencode-go declaration errors | `archive/2026-11-15-add-opencode-go-provider/specs/llm-opencode-go-provider/spec.md` — OpenCode Go connection | Optional official plugin must register provider; four errors are calls to opencodeGo namespace. Compare mounted roots, provider declaration and generated namespace in the **same** snapshot. Historical missing generated snapshot prevents comparative origin attribution. |
| Remaining overlays, frontend, JSON/array typing, socksProxy and other core diagnostics | No supported originating-change link | Ledger preserves exact individual message and file; inspect its source/diff and relevant declaration or failing stack first. Do not attach unrelated migration/preset changes merely by module name. |

The enriched copy gives individual candidate paths, contract, next check, and explicit unattributed status. It deliberately does not promote broad name overlap to causality.

## 1.4 / 3.3 Actual inclusion and runtime chains

### Root compiler and frontend

`tsconfig.json` includes `src/**/*.ts`, `src/**/*.d.ts`, `script/**/*.ts`; excludes `node_modules`, `.mauzcode`, `dist`; uses ESNext lib, bundler resolution, strict and noUncheckedIndexedAccess. Exclude controls root enumeration, **not imports**.

A concrete frontend entry is `src/projects/pages.test.ts:4` → `frontend/src/lib/workspaceView.ts` → `frontend/src/lib/navigation.ts:1` → `frontend/src/lib/mauzcode.ts`. The latter's `EventPage.runs` imports `../components/mauzcode/transcriptGroups` and that module imports ChatEvent back. `workspaceView.ts` also imports `WorkspaceViewMenu.tsx`. Thus frontend files genuinely enter the root compiler through server test imports, not a hypothetical tsconfig glob. The root lib lacks DOM; the previous `window` reference consequently failed in this context. Its repair uses optional window on globalThis. JSON response body is unknown and now checked as an object/string fields; indexed transcript entries use guards/assertions under noUncheckedIndexedAccess. Boundary regression coverage is owned by the parent/other child, not claimed by this audit.

`frontend/tsconfig.json` separately includes frontend src, vite config, Storybook and `../plugins/*/ui`, uses DOM/DOM.Iterable, vite/client and the @mauzcode/ui SDK path. Its own build/typecheck is an additional contract, not a substitute for root typecheck.

### Generated declarations, overlays and plugin sources

`src/procs/dev/genTypes.ts:22-25` obtains the project root and `procs.project.scan`; lines 42 onward construct import paths from each entry's actual absolute file; lines 146-147 write `src/ctx_ns.d.ts`. `src/procs/project/scan.ts:39-41` calls module discovery. `src/procs/modules/discover.ts:55-80` includes framework/app roots and `.mauzcode` after src, so overlays override same-name procedures; optional/plugin registry logic further selects mounted roots. Root tsconfig includes the generated d.ts. Its `Injected<typeof import("../.mauzcode/gh/gist/create").default>` includes private files despite exclude; external user plugins use `../../.mauzcode/user/...` imports. Private tmp folders are scanner-excluded.

`src/procs/boot/load.ts:23-34` scans/discovers then applies entries. Declaration-kind loaders consume boot entries; runtime mounting and generated type inclusion are related but separate effects. Plugin declaration files can also be root-compiler reachable through direct test imports even when optional plugin namespace declarations are missing: this explains the characteristic partial-registry errors without proving their historical trigger.

### Models / opencode-go

Models public source is under src and root-included; generated `types.models.*` and FnsRegistry model methods import actual model files. `src/models/$loader_modelProvider.ts` obtains boot entries and mounted module ownership, validates provider declarations and prunes unmounted owners. `plugins/opencode-go/package.json` declares `procs.src: src`, optional true. Its `src/opencodeGo/$modelProvider_opencode-go.ts` satisfies `types.models.ProviderDefinition` and calls `ctx.fns.opencodeGo` methods. A mounted scan emits imports for headers/listModels/mapModel/readUsage/route/test/usage, observed at the beginning of this audit. No direct provider-source diff repaired the four original errors: generated namespace availability is the supported mechanism, with historical writer/provenance unknown.

Test execution has another explicit chain: `src/agent/modelsTestCtx.entry.ts` → `_testCtx.entry.ts` → `$test.ts` → isolated boot; fixture overrides models.resolveRoute/listModels/stream and rejects real-provider attempts. `$test.ts` defaults root to the repository but clears USER_PLUGINS/PROCS_PLUGINS and ignores workspace unless explicitly supplied. This is intentional fixture isolation, not the live mount registry.

### Fresh blocking observation — generated declarations are not settled

During this audit opencodeGo/browser/rtk namespaces disappeared from the on-disk declaration file. Parent's new `.mauzcode/tmp/oo/acceptance/root-typecheck.log` reports **21** missing-plugin/type diagnostics after a green fast suite. Therefore old green logs do not establish current acceptance, and 3.3 remains blocked on a stable generation lifecycle. The enriched ledger marks current reopening separately from historical status.

Known write paths: `procs.dev.genTypes` writes repo declarations; callers include `procs.modules.reload:16`, dev.watch:90, dev.sync, dev.def and createFunction. Test contexts can point at the real repo with intentionally reduced mounts. However this audit did **not** identify a test that actually executed the writer: createFunction coverage inspected here uses dryRun or mocked generators; providers singleton coverage calls its loader directly. Temporal correlation with full fast is not proof the suite wrote the file. Required next check: trace the actual writer/context, separate watcher/live regeneration from test execution, and prevent test-context writes to the shared declaration output. Supported recovery is live `procs.dev.genTypes({})` against settled mounted state, never hand-editing d.ts; parent owns execution and fresh checks. Parent subsequently reported this recovery, and this child re-read explicit browser/opencodeGo imports in the generated file. This verifies namespace restoration, not a final compiler pass. Merely regenerating without fixing an identified writer would not prove durability.

## 4.4 Individual diagnostic mapping

All 330 entries in the enriched copy now retain diagnostic location/code/message (the concrete compiler cause), per-file exact repair diff/source hash, added repair lines, final recorded compiler evidence, per-item candidate/next check and a current-acceptance qualification. 232 entries additionally link focused logs with their exact file header and zero-fail summary. This is evidence of the file's focused run, not proof that every diagnostic has a bespoke behavioral test. No full check was run by this child.

Mechanisms visible in source/diffs include unknown JSON payload typing/narrowing; optional/indexed access assertions after fixture setup; typed header/tuple/callback collections; typed union assertions in goal/run fixtures; explicit db string arrays in `_testDb.entry.ts`; `subscriptionId` in webPush's accepted request shape; `file` in ConfigurationResult provenance; and added `src/code/TestKind.ts` exporting fast/it/live/all. The last two repair unchanged consumers through upstream declarations and are explicitly mapped in the copy.

**Remaining limitation:** 21 baseline entries have no direct file diff and depend on regenerated optional plugin namespaces/types (gh.api, browser/cdp, opencodeGo, telegram and rtk). Their exact missing member is documented, but durable repair attribution/verification cannot be closed while the fresh 21-diagnostic check reproduces that state. Fifteen approved deletions remain separately labeled removals, not retained-source fixes. Thus 4.4 has a complete audit trail but should not be marked fully repaired merely from old dispositions.

## 6.2 Intermediate compiler audit (not full failure closure)

Identity is file + code + exact first diagnostic message, ignoring line/column movement. Duplicate instances are counted. Changed message is a new observation, not necessarily a new bug; filenames alone are not chronology proof. Saved sets:

| Log in ol | Diagnostics | Baseline identities | New identities | Exit |
|---|---:|---:|---:|---:|
| typecheck-current | 302 | 300 | 2 | 2 |
| typecheck-json-batch | 207 | 205 | 2 | 2 |
| typecheck-second-batch | 129 | 127 | 2 | 2 |
| typecheck-third-batch | 71 | 71 | 0 | 2 |
| typecheck-fourth-batch | 38 | 37 | 1 | 2 |
| typecheck-fifth-batch | 25 | 25 | 0 | 2 |
| typecheck-sixth-batch | 6 | 6 | 0 | 2 |
| typecheck-final / repair / verify | 0 each | 0 | 0 | 0 |

There are only **two unique new identities** across these sets: `src/models/codexParity.test.ts` TS2769 (test.each overload; repaired tuple uses `types.models.ReasoningLevel | 'auto' | undefined`, focused codex-parity-types.log), and `src/socksProxy/registry.test.ts` TS7006 callback `p` (explicit proxy/users shape in the find callbacks). They are absent from saved final/repair/verify logs. This does not assign causal blame to a repair without an execution comparison. The fresh parent's 21 errors supersede any claim of current zero failures. Intermediate fast/focused failure reconciliation beyond these compiler sets remains a parent-owned gap; error text in successful negative tests must not be counted as failing tests.
