# Tasks

## 1. Baseline and attribution ledger

- [x] 1.1 Recover exact baseline commands, revision and environment from recorded execution; deliver metadata with explicit unknowns, raw log references and checksums, without repeating existing runs solely for output recovery.
- [x] 1.2 Expand the design matrix into an individual ledger of all 86 failing tests and 330 type diagnostics; verify reconciliation with 25 failing test files and 124 diagnostic files and retain unmatched items as unattributed.
- [x] 1.3 Read relevant archived/current proposal, design and spec contracts for each candidate; attach exact change paths, log locations and next discriminating checks. Verify that every confirmed causal label has direct code-path or comparative evidence.
- [x] 1.4 Resolve the declared compiler invocation and transitive inclusion of overlays/plugins/frontend despite tsconfig exclusions; deliver the import/declaration chains and explain why 314 versus 330 cannot establish regression without comparable evidence.

## 2. Model fixtures and inference contracts

- [x] 2.1 Diagnose and repair request/context fixtures (buildLlmRequestOAuth, contextBudget, goalRequestContext, contextDetails, jevContextRequest, authorship); verify focused tests and record which failures actually involve requireModel or route resolution.
- [x] 2.2 Diagnose and repair compaction fixtures (both midTurnCompaction suites and autoCompactBudget); verify focused tests cover retained context, native/fallback behavior and provider-neutral routing without real provider calls.
- [x] 2.3 Diagnose and repair run lifecycle, input wait, cancellation, runKnowledge and instantSteering failures; verify focused tests retain cancellation, persistence and steering assertions rather than masking errors.
- [x] 2.4 Diagnose and repair updateGoalSidecar, workerGoalFailure and workerPush failures; verify focused tests preserve terminal/usage-limit policy and stop using retired llm mocks where established.
- [x] 2.5 Reconcile current mock-route/test-context conventions with docs/testing.md and shared fixture helpers; add focused fixture contract coverage and verify documented examples match supported inference APIs.

## 3. Models facade and discovery

- [x] 3.1 Diagnose models architecture/internalCompatibility failures against reorganize-models-internals; repair implementation or stale expectations with focused tests proving public signatures, routes and discovery remain valid.
- [x] 3.2 Diagnose repl preset and browser prompt failures against preset/discovery changes; verify focused tests exercise allowed/denied capabilities and refreshed metadata without weakening access boundaries.
- [x] 3.3 Trace missing registry namespaces/types to authoritative source and loaders, including models and opencode-go; use documented regeneration rather than editing generated declarations and verify affected focused contracts and targeted compiler diagnostics.

## 4. Proxy, frontend and remaining core repairs

- [x] 4.1 Investigate socksProxy browserApi/registry failures and legacy-table access against current migrations; repair disposable fixtures or code and verify focused proxy tests without working-database changes.
- [x] 4.2 Diagnose settings/files and frontendBridge/icon test failures; preserve intended behavior and verify both focused suites, recording attribution independently of model failures.
- [x] 4.3 Repair frontend, frontendBridge, UI and navigation diagnostics using precise types/narrowing; add relevant boundary regression tests and verify every affected baseline diagnostic is resolved.
- [x] 4.4 Repair remaining core diagnostics across agent/api/auth/canvas/code/files/plugins/procs/goal/transport/tools/webPush and all residual ledger files; split into small owned batches with focused tests and ledger evidence for each fix, including vendored-boundary discipline.
- [x] 4.5 Update documentation alongside any changed public contract or fixture convention; verify docs against actual APIs and revise proposal/spec deltas before implementing any newly necessary behavioral change.

## 5. Optional plugins and private integration disposition

- [x] 5.1 Deliver an inventory of mounted/source-only plugins and affected private procedures with error counts, dependency/caller/type/UI impact and retain/remove recommendations; verify it covers browser, opencode-go, telegram and gh/myhealthGaps/skill/tunnel overlay errors.
- [x] 5.2 Obtain and record separate exact-path removal approval. Owner confirmed discovery, telegram-bot and .mauzcode/myhealthGaps before deletion; backup and observed removal evidence are recorded in design.md. Later exact-path approvals for .mauzcode/skill/circlebackMeetingReady.ts and .mauzcode/tunnel/ensure.ts are recorded in verification.md. Other extensions remain retain-and-repair; dependency and integrated acceptance checks remain in 5.3.
- [x] 5.3 Repair retained plugin/private-integration diagnostics and add focused coverage where behavior changes; verify dependency availability and do not install providers or broaden grants silently. If a removal is explicitly approved, document its exact scope and verify dependent callers/types/UI remain valid.

## 6. Integrated acceptance

- [x] 6.1 Designate one complete-check owner and run one fast suite plus one full project typecheck for a settled repair batch; preserve full logs, commands, revision and exit codes, and verify both exit zero without narrowed coverage or newly hidden failures.
- [x] 6.2 Reconcile all baseline items and newly discovered failures against final evidence; verify every item has a disposition, candidate/unattributed links remain honestly labeled, and source edits after checking invalidate acceptance.
- [x] 6.3 Verify the final diff contains no unauthorized plugin removals, working-data mutations, generated-declaration hand edits, blanket suppressions or weakened assertions; run strict OpenSpec validation and deliver the final change-link matrix and remaining limitations.

## Workflow follow-up

- Implementation plan approved by the owner; separate exact-path deletion confirmations received. Baseline copies and SHA-256 verification completed in .mauzcode/tmp/ol/baseline. All 416 ledger items now have final check dispositions; see verification.md for commands, results, removal evidence and attribution limitations. Follow-up completed the missing evidence, fixture documentation and boundary tests, then identified and isolated route.test.ts's shared declaration writer. All 23 tasks are now evidenced; see followup-acceptance.md for the final settled checks, stable compiler-input hashes and remaining limitations. Unsupported historical origins remain explicitly unattributed, not falsely confirmed.
- Archive only after implementation, ledger closure and required review/checks; no automatic commit, push or deployment is authorized.
