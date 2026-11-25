# Tasks

## 1. Model error contract and safety

- [x] 1.1 Inventory agent-reachable core, custom and plugin inference adapters, their HTTP/stream/transport failure paths, and their shared-helper or standalone coverage. Verify every registered route family maps to a capture point and a fixture; document the contract for plugin authors.
- [x] 1.2 Add optional safe diagnostic fields and a shared bounded normalizer without changing existing classification. Test supported envelopes, absent/malformed fields and lengths, and assert secrets, verification URLs, request echoes, control characters and arbitrary metadata cannot leak through values or identifiers.

## 2. Capture provider evidence

- [x] 2.1 Normalize a failed HTTP response once, independently of whether a classifier exists, handles it or throws. Test Antigravity 400 and 403, non-Google 4xx/5xx, empty bodies, non-JSON and oversized responses. Assert exact safe wording, known status and unchanged policy metadata.
- [x] 2.2 Capture errors in each supported shared stream format (Gemini, Anthropic, OpenAI Chat and Responses). Test provider error frames before and after deltas, and malformed/truncated streams; assert no invented provider explanation, HTTP rejection or change in replay behavior.
- [x] 2.3 Wire remaining native, custom and plugin adapter paths from the inventory; map no-response transport failures separately from user cancellation. Verify representative standalone and plugin fixtures and check that every route family is covered.

## 3. Run history and operator visibility

- [x] 3.1 Propagate the terminal attempt's safe diagnostic into the existing run error history and current failure summary. With an isolated agent fixture, reload the history after a later successful turn and verify the earlier message remains readable and attributed to the correct provider and run.
- [x] 3.2 Verify the owner-facing chat renders diagnostic text without executing markup and reads older status-only entries. Add regression coverage proving raw bodies, sensitive values and prompt fragments do not reach stored events, last-error summaries, diagnostic logs or chat output.
- [x] 3.3 Exercise retry success, retry exhaustion, quota parking and cancellation against the existing policies. Verify no new terminal error for recovery/parking/cancellation and no change to retry counts or delays. Run relevant suites, the project fast tests and full typecheck; record results before review.

## Verification

- `bun run test`: 4,422 fast tests passed, 0 failed. Includes protocol/adapter fixtures and persisted run readback. No real model accounts used by the tests.
- `bun run frontend:test -- frontend/src/test/error-row.test.tsx`: 8 tests passed.
- Full `procs.dev.typecheck({})`: clean. Runtime procedures reloaded and metadata checked. Before the final fix, two regression tests reproduced the omission of Google's location rejection. After the fix, the live normalizer preserved the wording of a synthetic HTTP 400 `FAILED_PRECONDITION` response on a normal Gemini user turn and withheld a separate prompt echo. No external call was needed to verify the fix.
