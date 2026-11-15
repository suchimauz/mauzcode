# Agent prompt optimization record

Change: `optimize-agent-preset-prompts` (left unarchived).

## Controlled measurements

Fixture: isolated `testCtx`, workspace `/fixture/workspace`, empty per-agent instructions, one `openspec` plugin with description `Spec workflow` and a stub `run` function. These are character counts, not exact model tokens or the full conversation payload.

| Preset | Prompt before | Prompt after | Reduction | Generated before / after | Native schema before / after |
|---|---:|---:|---:|---:|---:|
| Minimal | 3,009 | 2,214 | 26.4% | 1,944 / 996 | 6,716 / 6,716 |
| Standard | 20,285 | 17,490 | 13.9% | 8,914 / 7,843 | 13,305 / 13,305 |
| Creator | 32,287 | 23,077 | 28.6% | 10,540 / 9,469 | 13,305 / 13,305 |

Native schemas retain their baseline SHA-256, not merely their lengths. Baseline counts/hashes are committed in `src/agent/presetPrompt.before.fixture.json`; fixture assertions and budgets are in `presetPrompt.test.ts`. Temporary detailed measurements: `.mauzcode/tmp/oc/baseline-before.json`, `.mauzcode/tmp/oa/measurement-settled.json`. Repeat via `PROMPT_MEASUREMENT_OUT="$PWD/.mauzcode/tmp/oa/measurement-repeat.json" bun test --timeout 120000 ./.mauzcode/tmp/oc/prompt-baseline.test.ts` while scratch artifacts remain available; the committed test fixture also verifies final budgets and native hashes.

Standard misses the 25–35% target because full Canvas/Input guidance and other collaboration safeguards remain in scope. This is intentional: do not remove safety or redesign those generated sections just to hit a percentage. Creator meets the target; Minimal shrinks rather than grows. AGENTS.md shrank from roughly 32.7 KB to 6.1 KB; topic references retain detailed rules on demand rather than erasing them.

## Reviewed shortening and relocation

- Base: remove filler and host-stack prescription; explicitly separate host from target and preserve secrets/transcript/approval safeguards, unavailable-capability discipline and effect verification.
- `evalLegacy`: replace manual namespace and ctx/agent catalogues with existing English-keyword discovery and schema reading. No new instruction loader.
- `eval`: remove speculative Bun API catalogue; retain opts-only convention, server-cwd and SSH constraints, bounded-result rules. Optional readResult guidance is gated inside the original section.
- `codeGraph`: remove the large API catalogue and denied `code.index` example; retain slice/callers/quality/coverage and explicit runtime index scope.
- `authoring`: keep a short entry point; detailed procedure contract, metadata, placement and validation/reload rules are available in `runtime.docs.get({name:"procs.dev.createFunction"})`, even outside this checkout, and `docs/runtime-authoring.md`.
- `storage` / `projectDocs`: remove relative references that falsely described another workspace and the historical queue dump. Runtime DB safety remains; queue and operations details live in `docs/runtime-operations.md` and architecture docs.
- Tool guidance: consolidate read-before-edit/readId and shell discovery wording; Minimal no longer suggests unavailable grep/find tools. Native parameter schemas are unchanged.
- Messaging: peer trust and asynchronous reply rules remain; optional agent lookup is gated inside the existing section. Shared-agent lookup/results are independently gated within their original section, retaining allowed delegation and its safety rules under partial denies. Plugin discovery requires its complete workflow API set; direct plugin generation also checks discovery access.
- AGENTS.md: merge duplicated UI/SSR/runtime blocks into scoped rules and links to runtime-authoring, runtime-operations, testing and ui-maintenance. The detailed UI consumers, secrets, Postgres and testing constraints remain in those documents.

Section identifiers, additions order, grants, stored preset definitions and snapshots were not changed. Existing exclusions still suppress the corresponding section and optional paragraphs. Historical `creator-prompt.before.md`, relocations and scoped-splits evidence were not rewritten; current invariant tests replace blanket historical paragraph equivalence.

## Verification and limitations

- Final targeted run: **33 passed, 0 failed**, 256 assertions across `src/prompts/sections.test.ts`, `src/tools/tools.test.ts`, `src/agent/presetPrompt.test.ts`, `src/agent/systemPromptAuthoring.test.ts`, `src/agent/__fixtures__/creator-prompt.test.ts`.
- Full fast suite after fixing four stale wording assertions: **3,557 passed, 12 skipped, 86 failed** across 614 files. Full log: `.mauzcode/tmp/oa/fast-settled.log`. The remaining failures involve untouched browser test setup, models/mock connections, agent lifecycle and related paths. A clean pre-change full-suite baseline was not captured; these are unresolved failures outside the changed assertions, not a proven clean project or a blanket claim that every failure predates this change.
- Full-project typecheck was repeated after test edits and generated declaration refresh: **314 diagnostic lines**, none naming the changed source/test files. Complete diagnostics: `.mauzcode/tmp/oa/typecheck-settled.json`. Missing legacy `llm` / private runtime namespaces and existing type/test mismatches remain outside this change. The earlier check had a different generated registry state (57 diagnostic lines) and is superseded; do not compare its count as a regression metric.
- `code.quality({root:"core",severity:"error"})`: clean after reindex. Unscoped graph reports 13 unresolved calls in user plugins/overlay; these were investigated but not changed as part of prompt optimization.
- Strict metadata validation passed for fullSystemPrompt, plugins.promptSection and createFunction. Owning namespaces/functions were hot-reloaded; no server or DB restart, preset migration, commit or publication occurred.
- Integration tests were not run: no transport, persistence or browser execution logic changed. OpenSpec strict validation is recorded in the change's task evidence.

Global suite/typecheck failures remain a review limitation. Do not archive or claim a fully green repository until those are resolved or separately accepted.
