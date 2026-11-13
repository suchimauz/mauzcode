## 1. Baseline

- [ ] 1.1 Record the current `bun test src/models` result, `procs.dev.typecheck({})` diagnostics and `code.quality({})` warnings in agent scratch storage, and separate pre-existing failures (verify: baseline note saved and referenced in the PR description)

## 2. Protocol contract and shared protocols

- [ ] 2.1 Add public types `src/models/ProtocolEndpoint.ts` and `Protocol.ts` (single type; methods get `fetch` instead of `conn`, required `model` in `probe`, optional `signal`) with JSDoc; run `procs.dev.genTypes` (verify: `types.models.Protocol` resolves in typecheck)
- [ ] 2.2 Add `models.protocol.common.normalizeBase`, `checkedFetch` and `openaiModels` with unit tests for invalid URLs (including raw `?`/`#` with empty query or fragment), aborted signal, HTTP failure body cancel without exposing bodies, de-duplication and malformed arrays (verify: `bun test src/models/protocol/common`)
- [ ] 2.3 Implement `openaiChat`, `openaiResponses`, `anthropic` and `gemini` as `definition` (inline `baseUrl`, `defaultHeaders`, `apiKeyHeaders`), `listModels` and `probe` with per-protocol unit tests against a local `Bun.serve` fixture covering paths, headers, bodies, versioned bases, aborted signal and `anthropic-version` sent without an API key (verify: `bun test src/models/protocol`)
- [ ] 2.4 Add `models.protocol.get` (single object-literal registry, "Unsupported protocol" for unknown ids, no request made) and `models.protocol.list` returning `{ id, label }[]` with tests (verify: test asserts order and unknown id rejection; `rg -n "openai-chat|gemini" src/models --glob '!protocol/**' --glob '!*.test.ts'` shows only the custom declaration select)

## 3. Custom provider on the registry

- [ ] 3.1 Add `provider/custom/customEndpoint.ts` (case-insensitive merge via one `Headers`: `Accept`, `defaultHeaders()`, `apiKeyHeaders(key)`); rewrite `customListModels` and `customTest` on protocol methods, keeping manual-models merge and result codes, passing only `conn.fetch` to protocols and checking the test model in `customTest` before any request; delete `provider/custom/customProtocol.ts` (verify: no `protocol ===` in `src/models/provider/custom`)
- [ ] 3.2 Rewrite `src/models/custom.test.ts` onto the provider/protocol API with all existing assertions for the four protocols, plus tests that the declaration's select option values and labels equal `models.protocol.list({})` and that an anthropic connection without a key still sends `anthropic-version` (verify: `bun test src/models/custom.test.ts`)

## 4. Minimal public facade

- [ ] 4.1 Rewrite every caller inside `src/models` of any root name (the 23 removed and the 13 kept) to full namespace names, using `code.callers` per name (verify: `code.callers` returns no project caller for each removed name)
- [ ] 4.2 Delete the 23 root forwarding files, run `procs.dev.genTypes` and reload `models` (verify: `code.quality({})` reports no calls to missing names in `src/models`)
- [ ] 4.3 Update root tests to full names; reduce `connections/`, `inference/` and `transport/` `compatibility.test.ts` groups to remaining delegates; update `internalCompatibility.test.ts` and `fixtures/public-contract.baseline.json` to the minimal facade plus a test that no other root forwarding procedure exists (verify: `bun test src/models`)
- [ ] 4.4 Update `docs/models-providers.md`: internal names (e.g. `models.inference.resolveReasoning`, `models.transport.parseSSE`), minimal facade list and a "Wire protocols" section on shared protocols and the provider as the single entry point (verify: `rg` finds no removed root name in `docs`, `docs/skills`, `plugins/*/SKILL.md` or `~/.mauzcode/user`)

## 5. Verification

- [ ] 5.1 Run `runtime.docs.validate({ strict: true, typecheck: false })` for every new or changed procedure, one `procs.dev.typecheck({})`, `code.quality({})` (including `dead` and `test-only` for every new `models.protocol.*`) and `bun test src/models`; compare with the baseline from 1.1 (verify: no new diagnostics, warnings or failures)

## Workflow follow-up

- Archive with `openspec archive models-protocol-strategies --yes` after review.
