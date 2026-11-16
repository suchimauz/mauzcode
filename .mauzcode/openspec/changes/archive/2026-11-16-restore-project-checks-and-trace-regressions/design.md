# Design

## Context

See proposal.md for motivation. Existing evidence lives in `.mauzcode/tmp/oi/`: `fast.log`, `typecheck.log`, `summary.json`, and both exit files. The baseline reports 3557 passes, 12 skips and 86 failures across 25 failing test files; typecheck reports 330 diagnostics across 124 files. The earlier claim of 314 diagnostics has no comparable log attached and is not evidence of 16 newly introduced regressions. Historical revision/environment metadata must be recovered from recorded execution, or marked unknown. Current clean Git status does not identify the baseline revision.

`package.json` declares `test` as `bun script/test.ts fast`, with no `typecheck` script. `tsconfig.json` includes src and script, excludes `.mauzcode`, and uses strict/noUncheckedIndexedAccess. Nevertheless the baseline reports private overlays, plugins and frontend files: investigate transitive declarations/imports and the exact executed compiler command before changing scope. An exclude does not prove an imported file cannot participate. `docs/testing.md` still describes legacy `mock:*` routes; compare it to current model contracts before updating fixtures or documentation.

## Goals / Non-Goals

Goals: repair actual contracts, retain an auditable ledger, distinguish fixture drift from runtime defects, and complete all 330 diagnostics and 86 test dispositions.

Non-goals: redesign models/presets, revive legacy llm storage, edit generated declarations manually, change compiler strictness, touch working databases, or remove optional plugins without approval. No implementation is performed during proposal preparation.

## Decisions

### 1. Evidence first; attribution is not blame

Keep raw baseline logs immutable. The implementation ledger identifies each failing test by file/name and each diagnostic by file/position/code/message, with log location, suspected contract, exact historical change path, status, next check, repair and verification. Counts must reconcile against the baseline, including unattributed items. `summary.json.fast.errors` contains errors from passing negative tests as well: never treat its aggregate counts as failing-test counts.

Confirmed means demonstrated causal linkage through a direct execution/dependency path or controlled comparison; candidate means plausible contract overlap; unattributed means no supported change link. No causal links are confirmed in this proposal. The following is an investigation matrix, not a completed root-cause analysis.

| Failure scope | Candidate change(s) | Evidence and next check |
|---|---|---|
| Agent request, context, compaction, run lifecycle and sidecar mocks | `archive/2026-11-14-migrate-runtime-to-models` | Proposal moves these callers to models and retires llm. Log contains missing requireModel, legacy routes, and updateGoalSidecar.test.ts:133 reading registry.llm.stream. Map each failed assertion to its own stack; modernize fixture routing only where established. |
| models architecture and internal compatibility | `archive/2026-11-13-reorganize-models-internals` | Public-facade/signature/discovery contract overlaps the 3 failing tests. Compare actual architecture violations and generated registry boundaries to the archived contract. |
| repl preset and browser prompt metadata | `archive/2026-11-15-add-agent-presets`, `archive/2026-11-15-scope-preset-discovery`, `optimize-agent-preset-prompts` | Two failing tests overlap discovery/prompt contracts. Distinguish isolated fixture mounting from live plugin capability state; do not infer a runtime regression from plugin-not-found text alone. |
| opencode-go provider type errors | `archive/2026-11-15-add-opencode-go-provider` | 4 diagnostics in one provider file; inspect namespace/type generation and loader contracts. File overlap confirms scope only, not cause. |
| socksProxy legacy table access | Unattributed; migration above is a hypothesis to investigate | 5 failing tests across browserApi/registry; inspect exact missing-table stack and current migration ownership in disposable test DB. |
| Other agent/worker assertions, settings/files, frontendBridge/icon | Unattributed until individual stacks are reviewed | Do not assign all agent failures to the model migration. Separate policy expectations, fixture failures and downstream symptoms. |
| Private overlays, browser/telegram types, frontend and remaining core diagnostics | Unattributed | Trace imports, registry generation, optional mounting, ownership and exact type errors before assigning a historical change. |

Paths above are relative to `.mauzcode/openspec/changes/`. Candidate discovery must expand to other archived changes when evidence warrants it. Do not connect missing OpenSpec mounting to `add-openspec-canvas-viewer` merely because both mention OpenSpec.

### 2. Exhaustive fast baseline, including unresolved files

Counts below are failing assertions, not proven shared causes. Names and individual log evidence remain in `summary.json.fast.files` and `fast.log`.

| File (relative to project root) | Failures |
|---|---:|
| plugins/browser/src/cdp/prompt.test.ts | 1 |
| src/agent/updateGoalSidecar.test.ts | 3 |
| src/agent/workerGoalFailure.unit.test.ts | 1 |
| src/agent/workerPush.unit.test.ts | 1 |
| src/auth/authorship.test.ts | 1 |
| src/repl/preset.test.ts | 1 |
| src/models/architecture.test.ts | 1 |
| src/models/internalCompatibility.test.ts | 2 |
| src/agent/autoCompactBudget.unit.test.ts | 1 |
| src/agent/buildLlmRequestOAuth.test.ts | 5 |
| src/settings/files.test.ts | 1 |
| src/socksProxy/browserApi.test.ts | 1 |
| src/agent/contextBudget.unit.test.ts | 4 |
| src/agent/contextDetails.test.ts | 1 |
| src/agent/goalRequestContext.unit.test.ts | 6 |
| src/agent/instantSteering.test.ts | 1 |
| src/agent/jevContextRequest.test.ts | 3 |
| src/agent/midTurnCompaction.test.ts | 6 |
| src/agent/midTurnCompaction.unit.test.ts | 21 |
| src/frontendBridge/icon.test.ts | 1 |
| src/socksProxy/registry.test.ts | 4 |
| src/agent/run.durableLifecycle.test.ts | 7 |
| src/agent/run.inputWait.unit.test.ts | 2 |
| src/agent/run.cancellation.test.ts | 4 |
| src/agent/runKnowledge.test.ts | 7 |
| **Total** | **86** |

### 3. Full typecheck scope, not a selected-error fix

All 124 file entries in `summary.json.typecheck.files` and all raw diagnostics are mandatory work items. Group counts below partition the entire baseline; categories are scheduling buckets, not root causes.

| Scope | Diagnostics |
|---|---:|
| .mauzcode/gh, myhealthGaps, skill, tunnel | 5 + 9 + 1 + 5 = 20 |
| frontend/src | 6 |
| plugins/browser, opencode-go, telegram | 3 + 4 + 3 = 10 |
| src/agent | 52 |
| src/frontendBridge | 61 |
| src/code | 20 |
| src/api | 18 |
| src/nav, src/plugins | 15 + 15 = 30 |
| src/files | 14 |
| src/procs, src/webPush | 11 + 11 = 22 |
| src/auth, src/canvas | 8 + 7 = 15 |
| src/codexTunnel, controlPlane, goal, ui | 6 + 6 + 6 + 6 = 24 |
| src/models, functionsRoute.test.ts, socksProxy | 5 + 5 + 5 = 15 |
| src/secureInput, tools | 3 + 3 = 6 |
| src/$route_GET.ts, _testDb.entry.ts, codexSocksIsolated, cron, testIsolation.test.ts | 2 each = 10 |
| src/attachments, compaction, screen, settings, sshAccount, sshProvider, update | 1 each = 7 |
| **Total** | **330** |

Dominant codes: TS2339 78, TS18046 72, TS2532 49, TS2571 27, TS2694 17. Remaining codes remain fully in scope. Fix precise narrowing, optionality and contract types rather than broad casts/non-null assertions. Generated registry issues require source/loader fixes and documented regeneration, never manual `src/ctx_ns.d.ts` edits.

### 4. Repair ordering and acceptance

First establish ledger and fixture/registry consistency, then repair shared model and discovery contracts, then independent frontend/core/plugin types. Use focused tests per repair. One owner runs one complete fast suite and one complete typecheck per settled batch; preserve full output and reconcile every baseline item. New failures enter the same ledger. Additional source edits invalidate results. Do not rerun expensive global checks merely to reconstruct available baseline evidence.

### 5. Plugin disposition is a separate decision

Inventory mounted and source-only plugins/private procedures, dependent callers/types/UI, error contribution, and retain/remove recommendation. In particular inspect browser, opencode-go, telegram and private gh/myhealthGaps/skill/tunnel consumers without assuming they are unwanted. Default is retain and repair. Present exact names and dependency consequences for owner confirmation before any delete/disable/exclude operation. A generic comment that some plugins are unnecessary is not consent. Removing runtime plugin mounting alone may not remove typecheck imports.

## Risks / Trade-offs

- Stale mocks can conceal production defects → verify current requirements and add focused regression coverage before changing expectations.
- Shared registry/load order may yield cross-suite contamination → reproduce affected cases individually and in-suite under documented isolation.
- Baseline revision is unknown → do not claim before/after causality until controlled evidence exists.
- Private integrations may lack their providers → document dependencies and ask for disposition; do not broaden permissions or install providers silently.
- Existing docs describe legacy mocks → update only after establishing the current supported testing contract.

## Migration Plan

No production data migration is planned. Apply small reviewable source/fixture batches after proposal agreement; isolate test-schema changes in disposable test storage. Roll back only owned repair changes if a batch breaks behavior, preserving concurrent user changes. Any newly necessary production migration or behavior change requires a revised proposal. Do not archive until ledger closure and complete green checks.

## Open Questions

Which historical changes caused the remaining failures? This is explicitly investigation work, not an assumed conclusion. Plugin disposition is resolved by the exact owner approval recorded below.

## Implementation evidence and approved disposition

The owner approved implementation and separately confirmed removal of `/home/suchimauz/.mauzcode/user/discovery`, `/home/suchimauz/.mauzcode/user/telegram-bot`, and `/home/suchimauz/mauzcode/.mauzcode/myhealthGaps`. All other plugins are retained. The selected code has been removed after backup to `.mauzcode/tmp/ol/backups/approved-extensions.tar.gz` (115 archive entries). Database records, secrets, settings and history were not deleted. Current-schema inspection found no public discovery tables or selected cron tasks/runs; this is a current observation, not a claim about historical deployments. Discovery configuration was enabled, so disabled-by-default documentation was not treated as proof of inactivity.

The selected plugins were not workspace.json entries, so plugins.remove was inapplicable. After deleting the exact approved paths, procs.repl.unload removed 48 runtime functions; plugin reload reported no selected mounts, project scan reported zero selected entries, and procs.dev.genTypes regenerated declarations. Full-check acceptance and route/handler verification remain separate work, not inferred from dispatch.

Baseline copies are `.mauzcode/tmp/ol/baseline/{fast.log,typecheck.log,summary.json,fast.exit,typecheck.exit}`; `manifest.json` stores SHA-256 digests and explicitly unknown historical revision/commands. `.mauzcode/tmp/ol/ledger.json` contains 86 test identities and 330 positional diagnostics (416 items). Initial historical attribution remains unattributed until evidence is attached; removal of the nine myhealthGaps diagnostics is an approved feature disposition, not a runtime fix.

Read-only investigation identified distinct failure mechanisms: browser prompt fixture lacks ctx.state; worker quota fixtures use legacy failure.kind while workerLoop branches on failure.code; architecture scan fails on absent tests directory before asserting facade violations; compatibility State.ts baseline predates sessionAffinitySalt/sessionAffinityWarned. Investigate add-custom-session-affinity-header and provider-usage-refresh-interval alongside the original candidates. These observations establish current mismatches, not historical causal attribution.
