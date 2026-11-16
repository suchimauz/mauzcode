# Acceptance evidence

Original implementation evidence was collected in worktree `~/wt/disable-model-provider`, branch `feat/disable-model-provider` (from `main` 9a8ee98a). The implementation is now committed on main as `87327e1d`.

## Checks run

- `bun test ./src/models/providerDisabled.test.ts` — 17 pass: setting shape validation and unknown-id retention; read-through reader; stream/compact/call/countTokens refused with `PROVIDER_DISABLED` and zero instrumented provider invocations while `fetch` fails on any request; provider check precedence over connection/model checks and over `CONNECTION_NOT_FOUND` in `resolveRoute` (before `connections.list`/`resolve`); never-retryable via `agent.retryCodes().never` + `agent.retryDecision` even with an allowing policy; action(login) refused before resolve; test/usage `disabled`; refresh serves cache; `refreshAll` skips; create rejected while stored connections stay manageable; `modelDefault` skips disabled providers; API owner-only + CSRF + validation, GET/providers `enabled`/`enabledLocked`, idempotent and concurrent toggles both persisted, rejected write reaches caller without poisoning the queue, file-fixed → 409 `SETTING_FIXED` with path; structured `SETTING_FIXED` from `settings.set` while unrelated storage failures keep their identity; two deterministic barrier race tests (admitted stream finishes after the disable write; a check reading after the write blocks provider invocation).
- `bun test ./src/models/ ./src/frontendBridge/modelCatalogue.test.ts ./src/settings/ ./src/agent/retryDecision.test.ts ./src/agent/retryLifecycle.test.ts` — 514 pass, 0 fail (includes extended catalogue test: disabled-provider models flagged, groups `enabled:false, unavailable:false`, cache-only reads; updated facade/compatibility fixtures for the new `models.disabledProviders` root procedure and `State.disabledProvidersQueue`).
- `bun run frontend:test -- frontend/src/test/settings-models.test.tsx frontend/src/test/model-group.test.ts frontend/src/test/model-picker.test.tsx` — 50 pass: provider headers with switch (also without connections), one `setProviderEnabled` POST + reload, failed toggle announced with stored state kept, disabled-provider dimmed cards with Test/Update models/Login blocked and connection switch operable, disabled providers hidden from Add connection, all-disabled note, `enabledLocked` read-only switches with file hint and no request; picker policy never offers disabled-provider models nor unavailable notices.
- `bun script/cli.ts types` + `bunx tsc --noEmit -p tsconfig.json` — clean.
- `bunx tsc -b frontend/tsconfig.json` — clean.
- `code.quality` (host index) — ok:true, 0 errors (pre-existing warnings unchanged).
- `openspec validate disable-model-provider` — valid (3 pre-existing long-requirement warnings). The new "Provider actions and discovery of a disabled provider" requirement was moved from MODIFIED to ADDED so archive will not refuse the delta.

## Notes

- `models.listModels` facade gained the documented `cacheOnly` passthrough option (additive; the catalogue projection uses it for disabled providers).
- All 29 tasks in tasks.md are complete; documentation added in docs/models-providers.md and docs/settings.md.
- Archive readiness review: all 29 tasks and all eight capability deltas were checked against implementation and test sources; no blocker found. The latest complete fast-suite log confirms all 17 providerDisabled tests pass. That overall run still has 11 failures elsewhere; this is not a claim of a clean full-suite run.
- Current strict OpenSpec validation passes without warnings; the long-requirement warnings above describe the historical implementation run.
- The owner explicitly authorized sequential archival and commits. No push is included.