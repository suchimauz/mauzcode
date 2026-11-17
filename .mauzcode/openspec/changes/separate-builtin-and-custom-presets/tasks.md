# Tasks

## 1. Canonical code and database sources

- [x] 1.1 Inspect preset API dependencies/callers and all `agent_presets` consumers using the runtime index and scoped source search; verify a documented consumer inventory covers snapshot resolution, startup, owner Settings and new-session defaults before editing.
- [x] 1.2 Implement code-first `get` and merged `list` using `agentPreset.defaults` and custom database rows; add tests proving generated Standard equality, no shadowing or duplicates, stable ordering, fresh independent results and no database writes on reads.
- [x] 1.3 Route resolution and default validation through the effective catalogue; add tests for fresh installations, shipped-definition updates, unknown IDs, missing custom defaults, unchanged old snapshots and child-access intersections.
- [x] 1.4 Update preset API documentation and the source/snapshot sections of `docs/agent-presets.md`; verify they describe generated built-ins, database-only custom definitions and the unchanged snapshot contract.

## 2. Custom-only mutations and legacy migration

- [x] 2.1 Reserve code-defined IDs in create/update/remove, retain validation and configured-custom-default protection, and make reset a no-write compatibility read; verify management tests cover authorized built-in write rejection with an empty table, custom CRUD, independent copies and existing capability gates.
- [x] 2.2 Add the atomic forward migration preserving differing reserved rows with collision-safe custom IDs and recognizable names, converting non-reserved legacy builtin rows to custom, and removing obsolete reserved rows; verify isolated-Postgres tests cover equality with reordered rules, every editable field, the observed `nrepl`/`openspec` case, collisions, rollback and idempotence.
- [x] 2.3 Retire active startup seeding and ongoing stored-Standard upgrade behavior without rewriting historical migration history; verify fresh and upgraded migration chains finish with only custom rows and repeated boot creates no built-in rows or extra preservation copies.
- [x] 2.4 Verify migration leaves existing custom records, configured defaults, agent identifiers and snapshot bytes unchanged; add tests and document preserved-ID discovery, explicit selection of the old settings and the breaking meaning of a default `standard`.
- [x] 2.5 Document the guarded deployment and downgrade procedure alongside migration behavior; verify it requires backup and separate operational approval and does not silently delete preserved custom data.

## 3. Consistent owner and new-session presentation

- [x] 3.1 Update owner and new-session bridges to consume the effective catalogue; extend endpoint tests for empty preset storage, stale Standard rows, custom presets, missing defaults, auth, read-only/no-cache guarantees and unchanged minimal new-session response fields.
- [x] 3.2 Update Settings presentation to label built-ins as code-managed and retain custom update timestamps; add frontend tests covering no epoch date, distinct preserved custom cards, default markers, wildcards, empty fields and existing accessibility behavior.
- [x] 3.3 Update owner-facing preset documentation to match the two kinds and explain why preserved custom rules differ from code-defined Standard; verify examples against the endpoint and rendered panel tests.

## 4. Cross-layer verification

- [x] 4.1 Run focused preset, migration, bridge and frontend suites using project-approved isolated fixtures; verify the same Standard definition reaches Settings and newly created snapshots while existing agents retain their old rules, and preserve the test results.
- [x] 4.2 After the batch is settled, hot-reload changed functions through supported APIs, validate metadata and run one coordinated complete project check plus the runtime quality check; preserve complete diagnostics, investigate failures and distinguish any pre-existing errors without changing production preset data as a test.
- [x] 4.3 Run `openspec validate separate-builtin-and-custom-presets --strict` through `openspec.run` and review the final diff against all change scenarios; verify only implemented, evidenced tasks are checked and no unrelated files or live data were changed.

## Verification evidence

- Consumer inventory: `docs/agent-presets.md`; source/dependency audit confirmed both bridges already delegate to `get`/`list`, so no parallel catalogue or response-shape change was introduced.
- Preset/snapshot/capability regression suite: 110 passed, 0 failed. Legacy upgrade tests inspect raw historical storage rather than the new effective catalogue.
- Forward migration suite: 9 passed, 0 failed, 54 assertions, including concurrent reruns, rollback, all editable fields, preserved-ID collisions and unchanged snapshot/settings bytes. Final run used the approved 20-second test runner; an earlier bare `bun test` attempt hit its default 5-second fixture-startup timeout.
- Owner/new-session endpoint suites: 30 passed, 0 failed, 380 assertions. Settings component suite: 6 passed, 0 failed.
- Final complete fast suite: `bun run test` — 3775 passed, 12 skipped, 0 failed across 628 files. Complete final output: `.mauzcode/tmp/xe/full-fast-final.log`.
- Frontend typecheck/build passed; Vite reports its bundle-size warning. Output: `.mauzcode/tmp/xe/frontend-build.log`.
- Complete project typecheck passed after fixing one new migration callback-result typing error; initial and final diagnostics retained in `.mauzcode/tmp/xe/typecheck.json` and `typecheck-final.json`. The full fast suite was rerun after that correction.
- Hot-reloaded `agentPreset` and `frontendBridge.agentPresets`, regenerated declarations through the supported API, and validated all ten changed ordinary functions with strict metadata checks, without typechecking per function. Lifecycle code is covered by isolated tests, not replayed against working data.
- Runtime quality: `ok: true`, 0 errors, 569 advisory warnings; complete report `.mauzcode/tmp/xe/quality-final.json`. `git diff --check` is clean.
- No production migration, preset data mutation, commit, push, restart, archive or deployment was performed. The forward migration remains pending for a separately approved maintenance window; existing snapshots and configured defaults are not refreshed by this implementation.
