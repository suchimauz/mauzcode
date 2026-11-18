# Tasks

## 1. Claude version resolution

- [x] 1.1 Add the `detectCliVersion` boolean field (default true) to `$modelProvider_claude.ts` and reject an override together with an explicit `detectCliVersion: true` in `claudeValidate.ts`; verify with unit tests for both-set rejection, a stored override without the key being accepted, and invalid override rejection
- [x] 1.2 Refactor `claudeCodeCliVersion` to cache `{ value, detected }`, accept `refresh`, and stop reading `CLAUDE_CODE_CLI_VERSION`; add `models.provider.claude.claudeClientVersion({ conn, refresh? })` returning `{ version, source, detail? }` with override (re-validated) → detected (when enabled) → fallback; verify with unit tests for every source, detection disabled (no command), refresh, and env ignored (update `claudeCodeCliVersion.test.ts`)
- [x] 1.3 Switch `claudeWireHeaders` to the resolver and remove `CLAUDE_CODE_USER_AGENT`; verify that the user agent contains the reported version for each source, that the environment variable is ignored, and update `claudeProtocol.test.ts`

## 2. Codex version resolution

- [x] 2.1 Add the `detectCliVersion` boolean field (default false) to `$modelProvider_codex.ts` and reject it together with an override in `codexValidate.ts`; verify with unit tests
- [x] 2.2 Add `models.provider.codex.codexCliVersion({ refresh? })` (local `codex --version`, 8 s / 12 s timeouts, 4 KB cap, 5 min / 30 s cache, shared in-flight promise); verify with unit tests using a fake `codex` on PATH for success, `codex-cli` prefix parsing, missing binary, hang/kill, cache reuse and refresh
- [x] 2.3 Add `models.provider.codex.codexClientVersion({ config, refresh? })` with override → detected (when enabled, also older than the SDK default, with detail) → default; make `codexVersion` an async wrapper and await it in `codexListModels`, `codexTest` and `codexWireResponses`; verify with unit tests for every source, an older detected version, detection disabled (no command), and that `codex.test.ts` / `codexParity.test.ts` still pass

## 3. Provider SDK hook and API

- [x] 3.1 Add optional `clientVersion(ctx, conn, { refresh })` to `ProviderDefinition`, `hasClientVersion` to `ProviderView`, and implement it in both provider definitions; verify that `models.providers({})` reports `hasClientVersion` true only for claude and codex
- [x] 3.2 Add `models.connections.clientVersion({ id, refresh? })` with output shape validation and the POST action `clientVersion` in `src/models/api.ts`; verify with tests for a claude connection, refresh, a provider without the hook (null, no provider code runs), an unknown id, a non-owner/missing CSRF request, and that the response holds no secret values, references or command output
- [x] 3.3 Update `src/models/fixtures/public-contract.baseline.json`, `docs/models-providers.md` (setting, hook, action) and `docs/anthropic-subscription-operations.md` (removed environment variables); verify the public-contract test passes

## 4. Settings UI

- [x] 4.1 Add `connectionClientVersion(csrf, id, refresh?)` and the `hasClientVersion` type to `frontend/src/lib/modelConnections.ts` and `frontend/src/extensions/types.ts`; verify the frontend typecheck passes
- [x] 4.2 In the connection form, uncheck and disable "Detect CLI version" while the override is not empty and send `detectCliVersion: false` with an override; verify with a `settings-models.test.tsx` case
- [x] 4.3 Show `v<version> (<source label>)` with a detail tooltip and a loading placeholder on the connection card in `ModelsPanel.tsx`, loaded lazily and refreshed after save, plus a Re-detect button when detection is enabled; verify with `settings-models.test.tsx` cases for Claude detected, Codex detected and default, override after save, re-detect, failure without toast and a provider without the hook

## Verification evidence

- `bun test ./src/models/ --timeout 20000`: 480 pass, 0 fail (48 files, 2795 assertions), including public-contract and bounded CLI integration tests.
- Settings UI suite: 35 pass. Frontend typecheck (`tsc -b frontend/tsconfig.json`) passes after linking existing workspace dependencies (no installation).
- Full frontend run: 828 tests pass; 4 unrelated Git suites cannot load `react-diff-view/src/index.ts` through the shared dependency symlink (`/@fs/...` resolution).
- Whole-project typecheck after generated declarations: only 4 errors in the unchanged `plugins/opencode-go` provider (unmounted `opencodeGo` namespace); no changed-file diagnostics.
- `code.quality({})`: ok=true, 0 errors, 570 existing warnings. This checks the running host index, not this undeployed worktree.
- Strict OpenSpec validation passes; `git diff --check` passes.
- After merge to `main`: models namespace hot-reloaded with `procs.repl.load`; `models.providers({})` reports `hasClientVersion` only for claude and codex; `models.connections.clientVersion` on live connections returns Claude `2.1.322 (detected)` and Codex `0.157.1 (default)`, also with `refresh: true`.
- `bun run frontend:build` passes on `main`; `code.quality({})` on the running host: ok=true, 0 errors.
- Running-app Settings → Models cards (version, source, Re-detect) confirmed by the user in the browser.

## 5. Integration

- [x] 5.1 Run `ctx.fns.code.quality({})`, the models backend tests and the frontend tests, and check in the running app that a Claude and a Codex card show the version and source and that re-detect works
