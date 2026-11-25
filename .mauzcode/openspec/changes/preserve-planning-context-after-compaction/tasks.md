## 1. Synchronization and regression coverage

- [x] 1.1 Compare guidance against the effective compact history while preserving fork, fallback and tool-boundary behavior.
- [x] 1.2 Add and run regression tests for restoration, subsequent stable prefix, retained guidance, fallback, read-only preview and unsafe boundaries.

## 2. Verification

- [x] 2.1 Validate runtime metadata, run the project typecheck, and activate the updated synchronization procedure.
- [x] 2.2 Run a separate synthetic smoke check on real GPT-6.2-Sol and record the measured input and cache-read counts after native compaction.

### Verification evidence

- 38 tests passed across `syncPlanningContext`, `buildLlmRequestOAuth`, `compaction/project` and `midTurnCompaction.unit`. The full project typecheck and strict runtime metadata check passed; the synchronization procedure was hot-reloaded.
- Manual GPT-6.2-Sol smoke (outside CI): compact a synthetic conversation containing mode guidance with the native Codex endpoint, retain a numbered inventory, then prepare three turns with the same checkpoint and cache key. Use production synchronization, request assembly and transport with in-memory fixture storage; send no existing session data. All three responses were `OK`. Mode guidance was appended only on the first turn. Provider cache-read/input tokens: **0/5,803**, **5,760/5,823**, **5,760/5,843**. Provider cache hits are observations, not CI thresholds.
