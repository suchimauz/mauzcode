## 1. Baseline

- [ ] 1.1 Record the current `bun test src/models` result, `procs.dev.typecheck({})` diagnostics and `code.quality({})` warnings in agent scratch storage, and separate pre-existing failures (verify: baseline note saved and referenced in the PR description)

## 2. Protocol contract and shared protocols

- [ ] 2.1 Add public types `src/models/ProtocolEndpoint.ts`, `Protocol.ts` (generic `Endpoint`) and `SharedProtocol.ts` with JSDoc; run `procs.dev.genTypes` (verify: `types.models.Protocol` resolves in typecheck)
- [ ] 2.2 Add `models.protocol.common.normalizeBase`, `checkedFetch` and `openaiModels` with unit tests for invalid URLs, HTTP failure body cancel without exposing bodies, de-duplication and malformed arrays (verify: `bun test src/models/protocol/common`)
- [ ] 2.3 Implement `openaiChat`, `openaiResponses`, `anthropic` and `gemini` (`definition`, `baseUrl`, `apiKeyHeaders`, `listModels`, `probe`) with per-protocol unit tests against a local `Bun.serve` fixture covering paths, headers, bodies, versioned bases and missing test model (verify: `bun test src/models/protocol`)
- [ ] 2.4 Add `models.protocol.get` (single object-literal registry, "Unsupported custom protocol" for unknown ids, no request made) and `models.protocol.list` with tests (verify: test asserts order and unknown id rejection; `rg -n "openai-chat|gemini" src/models --glob '!protocol/**' --glob '!*.test.ts'` shows only the custom declaration select)

## 3. Custom provider on the registry

- [ ] 3.1 Add `provider/custom/customEndpoint.ts`; rewrite `customListModels` and `customTest` on protocol methods, keeping manual-models merge and result codes; delete `provider/custom/customProtocol.ts` (verify: no `protocol ===` in `src/models/provider/custom`)
- [ ] 3.2 Rewrite `src/models/custom.test.ts` onto the provider/protocol API with all existing assertions for the four protocols, plus a test that the declaration's select options equal `models.protocol.list({})` (verify: `bun test src/models/custom.test.ts`)

## 4. Claude and Codex private protocols

- [ ] 4.1 Add `provider/claude/claudeProtocol.ts` (static list, `/api/oauth/usage` probe) and switch `claudeTest`/`claudeListModels` to it without changing reasons, messages, headers or errors (verify: `bun test src/models/claudeProtocol.test.ts src/models/claudeAuth.test.ts` with unchanged expectations)
- [ ] 4.2 Add `provider/codex/codexProtocol.ts` (`/codex/models` discovery and probe via `codexWireAuth`, `codexVersion`, `codexWireChecked`) and switch `codexTest`/`codexListModels` to it (verify: `bun test src/models/codex.test.ts src/models/codexParity.test.ts src/models/provider/codex` with unchanged expectations)
- [ ] 4.3 Confirm neither private protocol appears in `models.protocol.list` and that no declaration in `$modelProvider_claude.ts`/`$modelProvider_codex.ts` changed except call targets (verify: test + `git diff` review)

## 5. Minimal public facade

- [ ] 5.1 Rewrite every internal caller of the 23 removed root names to full namespace names, using `code.callers` per name (verify: `code.callers` returns no project caller for each removed name)
- [ ] 5.2 Delete the 23 root forwarding files, run `procs.dev.genTypes` and reload `models` (verify: `code.quality({})` reports no calls to missing names in `src/models`)
- [ ] 5.3 Update root tests to full names; reduce `connections/`, `inference/` and `transport/` `compatibility.test.ts` groups to remaining delegates; update `internalCompatibility.test.ts` and `fixtures/public-contract.baseline.json` to the minimal facade plus a test that no other root forwarding procedure exists (verify: `bun test src/models`)
- [ ] 5.4 Update `docs/models-providers.md`: internal names (e.g. `models.inference.resolveReasoning`, `models.transport.parseSSE`), minimal facade list and a "Wire protocols" section on shared vs private protocols (verify: `rg` finds no removed root name in docs)

## 6. Verification

- [ ] 6.1 Run `runtime.docs.validate({ strict: true, typecheck: false })` for every new or changed procedure, one `procs.dev.typecheck({})`, `code.quality({})` and `bun test src/models`; compare with the baseline from 1.1 (verify: no new diagnostics, warnings or failures)
- [ ] 6.2 Manual check: through the Models settings page, test and refresh an existing custom, Claude and Codex connection (verify: same status, reason and model lists as before)

## Workflow follow-up

- Archive with `openspec archive models-protocol-strategies --yes` after review.
