# Verification and disposition matrix

**Current verdict: ready to close, 23/23 tasks complete.** The follow-up resolved the review gaps and the reproduced test-isolation defect. See [final settled acceptance](followup-acceptance.md) for fresh checks, stable compiler-input hashes and reconciled ledger. The original results and closure-review blockers below are retained as historical evidence, superseded by that final report.

Verified working tree at HEAD `20d72297fb331a10488d33bc3385fadb5d73ab28` (uncommitted changes). Single check owner: this session. No commit, push, deployment, live inference, or installation was performed.

## Integrated evidence

| Check | Command | Result | Full evidence |
|---|---|---|---|
| Core fast | `bun run test` | exit 0; 3648 pass, 12 skip, 0 fail; 616 files | `.mauzcode/tmp/ol/fast-repair.log` |
| Full declared root typecheck | `./node_modules/.bin/tsc --noEmit --pretty false` | exit 0 | `.mauzcode/tmp/ol/typecheck-repair.log` |
| Frontend tests | `bun run frontend:test` | exit 0; 816 pass; 131 files | `.mauzcode/tmp/ol/frontend-final.log` |
| Frontend typecheck | `./node_modules/.bin/tsc --noEmit --pretty false -p frontend/tsconfig.json` | exit 0 | `.mauzcode/tmp/ol/frontend-typecheck-final.log` |
| Patch whitespace | `git diff --check` | exit 0 | verified after final source edits |
| Runtime graph | `code.index({})`, then `code.quality({})` | 0 errors, 544 warnings | live graph refreshed after approved removal |

Checksums and revision: `.mauzcode/tmp/ol/verification-manifest.json`. Individual baseline reconciliation: `.mauzcode/tmp/ol/ledger.json` (416 entries: 86 fast failures, 330 diagnostics). All 86 baseline failures pass the full fast suite. Of 330 diagnostics, 315 are absent in the final typecheck with source retained; 15 belong to explicitly approved removed procedures. Passing diagnostics are not proof that a particular historical change caused or fixed them.

## Current cause / change-candidate matrix

| Group | Observed current cause and repair | Historical candidate (not proven originating cause) |
|---|---|---|
| Request, context, compaction, run and sidecar fixtures | Fixtures used retired model APIs, lacked requireModel/route resolution, or assumed obsolete response shapes; isolated models fixtures and assertions updated | `migrate-runtime-to-models`, `reorganize-models-internals` |
| Model compatibility / architecture | Historical contract snapshots omitted additive fields; optional test directory absence was treated as an error | `reorganize-models-internals`, `custom-session-affinity-header`, `extend-models-sdk-for-anthropic-routes` |
| Preset and prompt fixtures | Registry setup and unavailable-function expectations differed from current guarded discovery | `add-agent-presets`, `scope-preset-discovery`, `optimize-agent-preset-prompts` |
| SOCKS registry | Production list/remove queried retired account-proxy tables; now reads model connection transport bindings; disabled binding regression covered | `migrate-runtime-to-models` |
| Core and browser typings | Unknown JSON, optional array elements, literal unions, obsolete fixture fields, and inaccurate nullable return declarations | Unattributed; no historical causality inferred from error count |
| Project navigation | Removed project icon storage still referenced; folder-only representation restored | Current drop-project-icon migration; historical OpenSpec origin unconfirmed |
| Optional/private procedures | Missing provider namespaces; approved removal instead of suppressions or fake replacement APIs | Unattributed |

Candidate names above are research leads, not causal labels. Relevant change artifacts are under `.mauzcode/openspec/changes/` and its archive; detailed original candidate discussion remains in design.md. Historical attribution and comparative revision checks remain incomplete; do not describe this as a completed regression-origin audit.

## Additional approved removal

Owner separately confirmed removal of exactly `.mauzcode/skill/circlebackMeetingReady.ts` and `.mauzcode/tunnel/ensure.ts`. Byte-verified backups: `.mauzcode/tmp/ol/backups/remaining-procedures/`. SHA-256 respectively `45ea6d236f6c16cf6879ce4d55c87ba61158e16ef5542a9f334b82ff810345e6` and `7f3e8d7312c060bb24e0e816bd1df1f2414322ebadc941607999b72aa31cc578`. Both files are absent and `procs.repl.unload` reported removed:true for both. Generated types and graph were refreshed. Earlier approved removals and backup evidence remain in design.md. No persisted trigger or history deletion was performed; old callers of removed procedures cannot execute them.

## Final review notes

The tracked deletion list matches approved myhealthGaps and two-procedure removals. No tsconfig coverage changes, new skip markers, @ts-ignore or @ts-nocheck were added. Generated declarations were regenerated, not hand edited. The one removed sidecar assertion belonged to the obsolete mocked route resolver; the real isolated models fixture now resolves that route. Existing auth, cancellation and persistence assertions remain. Runtime metadata validation passed for all nine changed ordinary procedures; routes and provider/widget declarations were synced through supported loaders. After plugin reload, root typecheck was repeated successfully (`.mauzcode/tmp/ol/typecheck-verify.log`). Strict OpenSpec validation passed.

## Limits

- 12 existing fast-suite skips remain; no new skips were introduced to obtain a green result.
- Integration/live suites were not run as part of this acceptance. No real external accounts were exercised.
- 544 graph warnings remain, not resolved by the zero-error result.
- No full historical attribution claim; retain unchecked research tasks until their evidence exists.
- No automatic archive, commit, push or deployment.

## Closure review

**Verdict: do not archive yet.** This review changes documentation/task status only, not implementation. It confirms recorded green results, not completion of every promised investigation deliverable. Baseline and final log SHA-256 values match their manifests; the ledger reconciles 86 failed tests in 25 files and 330 diagnostics in 124 files. No source mtime newer than the final fast run was found, but the manifest does not capture a dirty-tree content fingerprint; HEAD alone is not a reproducible snapshot of uncommitted repairs. Full suites were not rerun merely to recover existing evidence.

Completed tasks: **1.2, 2.1–2.4, 3.1–3.2, 4.1–4.2, 5.2, 6.1** (11/23). Focused evidence is linked from `.mauzcode/tmp/ol/ledger.json`; integrated logs remain listed above. Approval status in 5.2 relies on the existing recorded exact-path approvals and backups; this review grants no new removal authority.

Remaining closure requirements:

| Tasks | Evidence gap / required next step |
|---|---|
| 1.1 | Baseline manifest still says historical command/revision recovery is pending; finish recorded-execution inspection, recover available command/Bun information and explicitly document unavailable environment/revision facts. Unknown historical facts are allowed; inventing them is not. |
| 1.3 | Group candidates are not the promised exact contract/change links and discriminating checks. Attach supported candidate paths, contract evidence and next checks; keep unsupported origins unattributed. Proving an originating change for every item is not required. |
| 1.4, 3.3 | Deliver actual compiler/import/declaration and source/loader chains for overlays, frontend, models and opencode-go. The general explanation of tsconfig exclusions is insufficient. |
| 2.5, 4.5 | `docs/testing.md:26` and `src/_testCtx.entry.ts:9` still show legacy mock-route examples. Reconcile these with current fixtures and add the required fixture-contract coverage. |
| 4.3 | Error-body narrowing in `frontend/src/lib/mauzcode.ts:25–30` lacks the requested boundary regression coverage (for example null/non-object bodies and non-string message/error values). Existing frontend suite success alone does not supply that new coverage. |
| 4.4 | Type ledger entries have final check dispositions but lack individual repair/cause and focused-verification mapping required by the task/design. |
| 5.1, 5.3 | Complete mounted/source-only inventory and dependency/caller/type/UI impact checks for retained and removed extensions. Green typecheck and unload success are not complete runtime-consumer evidence. |
| 6.2 | Baseline dispositions are verified, but a complete reconciliation trail for newly discovered failures is not delivered. Reopened pending that audit; this is not a claim that the saved checks failed. |
| 6.3 | Strict validation and sampled diff review pass; the promised final change-link and dependency-impact evidence remains incomplete. Reopened until the remaining review obligations are documented. |

Review-time checks: `git diff --check` passed; strict OpenSpec validation passed; `code.quality({})` returned `ok:true`, 0 errors and 544 warnings. No new implementation defect was established by this review; the unresolved items above concern required evidence, documentation and regression coverage. Any subsequent source edits require renewed acceptance checks.
