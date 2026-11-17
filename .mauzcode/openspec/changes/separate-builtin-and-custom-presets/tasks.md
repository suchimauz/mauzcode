# Tasks

## 1. Canonical code and database sources

- [ ] 1.1 Inspect preset API dependencies/callers and all `agent_presets` consumers using the runtime index and scoped source search; verify a documented consumer inventory covers snapshot resolution, startup, owner Settings and new-session defaults before editing.
- [ ] 1.2 Implement code-first `get` and merged `list` using `agentPreset.defaults` and custom database rows; add tests proving generated Standard equality, no shadowing or duplicates, stable ordering, fresh independent results and no database writes on reads.
- [ ] 1.3 Route resolution and default validation through the effective catalogue; add tests for fresh installations, shipped-definition updates, unknown IDs, missing custom defaults, unchanged old snapshots and child-access intersections.
- [ ] 1.4 Update preset API documentation and the source/snapshot sections of `docs/agent-presets.md`; verify they describe generated built-ins, database-only custom definitions and the unchanged snapshot contract.

## 2. Custom-only mutations and legacy migration

- [ ] 2.1 Reserve code-defined IDs in create/update/remove, retain validation and configured-custom-default protection, and make reset a no-write compatibility read; verify management tests cover authorized built-in write rejection with an empty table, custom CRUD, independent copies and existing capability gates.
- [ ] 2.2 Add the atomic forward migration preserving differing reserved rows with collision-safe custom IDs and recognizable names, converting non-reserved legacy builtin rows to custom, and removing obsolete reserved rows; verify isolated-Postgres tests cover equality with reordered rules, every editable field, the observed `nrepl`/`openspec` case, collisions, rollback and idempotence.
- [ ] 2.3 Retire active startup seeding and ongoing stored-Standard upgrade behavior without rewriting historical migration history; verify fresh and upgraded migration chains finish with only custom rows and repeated boot creates no built-in rows or extra preservation copies.
- [ ] 2.4 Verify migration leaves existing custom records, configured defaults, agent identifiers and snapshot bytes unchanged; add tests and document preserved-ID discovery, explicit selection of the old settings and the breaking meaning of a default `standard`.
- [ ] 2.5 Document the guarded deployment and downgrade procedure alongside migration behavior; verify it requires backup and separate operational approval and does not silently delete preserved custom data.

## 3. Consistent owner and new-session presentation

- [ ] 3.1 Update owner and new-session bridges to consume the effective catalogue; extend endpoint tests for empty preset storage, stale Standard rows, custom presets, missing defaults, auth, read-only/no-cache guarantees and unchanged minimal new-session response fields.
- [ ] 3.2 Update Settings presentation to label built-ins as code-managed and retain custom update timestamps; add frontend tests covering no epoch date, distinct preserved custom cards, default markers, wildcards, empty fields and existing accessibility behavior.
- [ ] 3.3 Update owner-facing preset documentation to match the two kinds and explain why preserved custom rules differ from code-defined Standard; verify examples against the endpoint and rendered panel tests.

## 4. Cross-layer verification

- [ ] 4.1 Run focused preset, migration, bridge and frontend suites using project-approved isolated fixtures; verify the same Standard definition reaches Settings and newly created snapshots while existing agents retain their old rules, and preserve the test results.
- [ ] 4.2 After the batch is settled, hot-reload changed functions through supported APIs, validate metadata and run one coordinated complete project check plus the runtime quality check; preserve complete diagnostics, investigate failures and distinguish any pre-existing errors without changing production preset data as a test.
- [ ] 4.3 Run `openspec validate separate-builtin-and-custom-presets --strict` through `openspec.run` and review the final diff against all change scenarios; verify only implemented, evidenced tasks are checked and no unrelated files or live data were changed.
