# Tasks

## 1. Account inventory and catalogue metadata

- [x] 1.1 Add a synthetic `fetchAvailableModels` fixture with both supported providers, group suffixes, native IDs, visibility lists, a standalone model, GPT-OSS and a hidden service ID. Verify discovery filters out the latter two and makes no generation request during a connection test.
- [x] 1.2 Join `groupedModels` to eligible native members in provider listing order; publish distinct supported levels and safe limits. Test Neon with `xhigh`, Flash without `minimal`, a disabled/absent member, an ambiguous mapping, duplicate visibility entries and ungrouped IDs without invented levels.
- [x] 1.3 Update the provider description and discovery section of `docs/models-providers.md`; verify the Gemini-only promise and regex-derived levels are replaced, while the sign-in warning, single-account restriction and no-fallback policy remain.

## 2. Cache, selections and existing routes

- [x] 2.1 Add optional validated group/member metadata to `ModelInfo` and its cache projection, distinct from reasoning wire values. Verify a persistent-cache round trip preserves exact IDs, order/default and limits, rejects invalid links and does not carry unrelated provider fields.
- [x] 2.2 Use one cache-only projection for the chat picker, settings and `list_models`. Verify identical group routes and supported levels with no upstream fetch; member/group disables take effect immediately, and a second connection cannot borrow the first one's choices.
- [x] 2.3 Resolve Antigravity routes only against the current cached catalogue, with no migration or backfill. Test a legacy cache (no groups, no fetch), a route no longer present after refresh failing `MODEL_UNAVAILABLE`, a failed refresh keeping the last valid mapping, and an old-account refresh finishing after logout or replacement; verify no saved chat or preference is rewritten.

## 3. Exact dispatch and stream compatibility

- [x] 3.1 Add `reasoning.variants` resolution to `models.stream` (before the provider call) and `MODEL_UNAVAILABLE`, and make delegation validate explicit levels against the same variant levels. Inspect captured mock requests for explicit `xhigh`, saved `xhigh` on a group without it (`high` member, fallback reason), `off` without an `off` member, `auto` with eligible/foreign default, a disabled level member, all members disabled and a route missing from the catalogue; only valid cases may reach the transport, and providers without variants are unchanged.
- [x] 3.2 Exercise Gemini and Claude requests against isolated Antigravity protocol fixtures. Verify model ID, project envelope, incremental text, terminal usage, tool call and continuation on a second turn; preserve Gemini per-call signatures, required Claude continuation data and the account boundary. Reject a passing list test as inference evidence.
- [x] 3.3 Document grouped versus exact native routes in `docs/models-providers.md`; match the worked request examples to the dispatch tests and confirm neither sends an unadvertised ID or a contradictory thinking option.

## 4. Family quota observations and API

- [x] 4.1 Parse per-native-ID `quotaInfo` before grouping and implement provider usage on the connection transport. Test independent parsing of fraction/reset (0, 0.75, 1, absent, invalid), family attribution, one locally hidden member and exclusion of unrelated service entries. Assert `0.75` means 25% used.
- [x] 4.2 Preserve typed family, stable model identity and observation/reset timestamps through usage normalization, cache and `GET /api/v1/quotas`. Verify two families still yield one account, no synthetic standard periods, no dilution of a partial/truncated family, and independently measured native members even when values match.
- [x] 4.3 Share the connection's dated usage snapshot across reads. Test cache reuse, invalidation on sign-out/account replacement, safe failed refresh and zero remote calls with the connection/provider disabled; document percentage units and family fields alongside the quota API contract.

## 5. Sidebar and settings

- [x] 5.1 Add family summaries for the two views. Test identical readings, a 40–85% range, equal fractions with different resets, zero, absent and partial readings. Check model names, local reset times, worst-used severity and agreement between cards and settings for the same observation.
- [x] 5.2 Render Gemini/Claude cards, one per family with at least one enabled model, in consecutive slots of the existing sidebar grid, labeled Antigravity and remaining, without hover. Test a row boundary, two Antigravity accounts, a mixed-provider grid all-unknown data, an account without Claude models, all Claude models disabled and re-enabled, and no shown family (ordinary status card); ordinary providers retain their used percentages, status cards and extra-limit indicators.
- [x] 5.3 Expose family details by focus, pointer and activation, including touch. Verify readable accessible names, Escape and retained focus, long model lists, the paired cards in an expanded mobile section, and both family readings in the narrow rail's shared indicator. Document the distinction between remaining cards and used-period cards.

## 6. Integration acceptance

- [x] 6.1 Run a fixture-backed workflow from discovery to refresh/restart, chat and delegation selection, mock generation and quota views. Verify exact native dispatch, two visible cards for one account and no credentials, account dumps or live-generation dependency in the fixtures.
- [x] 6.2 Run the affected backend and frontend suites and the project's coordinated typecheck; record commands and results, distinguish pre-existing diagnostics, and re-run strict OpenSpec validation against the implemented scenarios.

## Verification evidence (implementation worktree)

- `bun script/test.ts fast ./src/models ./src/frontendBridge ./src/api ./src/tools ./src/agent ./src/session` — 2,059 passed. The acceptance test checks discovery, cache-only selection after restart, chat and delegated model choices, exact Gemini/Claude requests on a fake transport, and the normalized quota account against the synthetic JSON also rendered by the frontend. No live account or generation was used.
- `bun run frontend:test` — 1,242 passed. Coverage includes two accounts, hidden families, the compact rail and expanded mobile section, partial and missing readings, keyboard dismissal/activation, and agreement with Models settings.
- `bun script/test.ts it src/canvas/canvas.browser.it.test.ts` — 4 passed in isolated Chrome. At 640 × 300 the pointer can cross into the Gemini preview, scroll a long list, move to the adjacent Claude card and then leave without a stuck popup.
- `bun node_modules/typescript/bin/tsc --noEmit --pretty false` and `bun node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit --pretty false` — both exited 0, no diagnostics. `git diff --check` and strict OpenSpec validation (`validate group-antigravity-models-and-quotas --strict`) passed.
- Full `bun run test` — 4,452 passed across 703 files, 0 failed. The initial run had two failures because the OpenSpec plugin CLI was missing from this worktree. Installing the locked dependency (`bun install --frozen-lockfile` in `plugins/openspec`) resolved both without changing the manifest or lockfile.
