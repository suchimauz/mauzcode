# Tasks

## 1. Provider version resolution

- [ ] 1.1 Refactor `claudeCodeCliVersion` to cache whether the value was detected or fell back while keeping its string return, and add `models.provider.claude.claudeClientVersion({ conn })` returning `{ version, source, userAgentOverridden }`; verify with unit tests for override, env, detected, fallback and `CLAUDE_CODE_USER_AGENT` (existing `claudeCodeCliVersion.test.ts` still passes)
- [ ] 1.2 Switch `claudeWireHeaders` to the resolver and verify with a test that the user agent version equals the reported version for each source
- [ ] 1.3 Add `models.provider.codex.codexCliVersion({})` (local `codex --version`, timeout, output cap, 5 min / 30 s cache, shared in-flight promise); verify with unit tests using a fake `codex` on PATH for success, `codex-cli` prefix parsing, missing binary, hang/kill and cache reuse
- [ ] 1.4 Add `models.provider.codex.codexClientVersion({ config })` with precedence override → `CODEX_CLI_VERSION` → detected (ignored when older than the SDK default) → default, make `codexVersion` an async wrapper and await it in `codexListModels`, `codexTest` and `codexWireResponses`; verify with unit tests for every source and the floor, and that `codex.test.ts` / `codexParity.test.ts` still pass

## 2. Provider SDK hook and API

- [ ] 2.1 Add optional `clientVersion` to `ProviderDefinition`, `hasClientVersion` to `ProviderView`, and implement the hook in `$modelProvider_claude.ts` and `$modelProvider_codex.ts`; verify with a test that `models.providers({})` reports `hasClientVersion` true only for claude and codex
- [ ] 2.2 Add `models.connections.clientVersion({ id })` with output shape validation and the POST action `clientVersion` in `src/models/api.ts`; verify with tests for a claude connection, a provider without the hook (null, no provider code runs), an unknown id and a non-owner/missing CSRF request
- [ ] 2.3 Update `src/models/fixtures/public-contract.baseline.json` and `docs/models-providers.md` (hook, action, `CODEX_CLI_VERSION`) and verify the public-contract test passes

## 3. Settings UI

- [ ] 3.1 Add `connectionClientVersion` and the `hasClientVersion` type to `frontend/src/lib/modelConnections.ts` and `frontend/src/extensions/types.ts`; verify the frontend typecheck passes
- [ ] 3.2 Show `v<version> (<source label>)` with a detail tooltip on the connection card in `ModelsPanel.tsx`, loaded lazily and refreshed after save; verify with `settings-models.test.tsx` cases for Claude detected, Codex detected and default, override after save, failure without toast and a provider without the hook

## 4. Integration

- [ ] 4.1 Run `ctx.fns.code.quality({})`, the models backend tests and the frontend tests, and check in the running app that a Claude and a Codex card show the version and source
