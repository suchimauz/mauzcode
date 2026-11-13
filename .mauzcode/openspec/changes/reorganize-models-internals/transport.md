# Block 3 evidence

Moved fetch, parseSSE and validateTransport implementations to `models.transport`; moved listModels, refreshAll and setModelEnabled to `models.catalog`. Six original root signatures remain typed delegates. Root parseSSE remains an async generator delegating with yield*; its leaf returns an AsyncGenerator without wrapping it in a Promise. No schema/cache migration, timer change or lifecycle source edits. `$start` still calls root refreshAll with exactly its original schedule. Existing connection/catalog calls remain compatible through public roots.

Existing transport tests retain their assertions and now wire nested delegates in partial fixtures. Coverage includes destination validation, saved proxy/SSH use, timeout before headers and through body streaming, abort, late tunnel acquisition/release, and no direct fallback. Additional direct leaf/root tests check SSE event boundaries and stream lock release, and direct leaf pre-IO rejection. Existing availability/connections/provider tests verify disabled models, manual fallback, cache refresh and retention through facades into the moved implementations.

Verification after all source edits:
- Six leaves and six public facades explicitly hot-reloaded and docs validated with strict:true/typecheck:false: all pass.
- One full procs.dev.typecheck: 418 diagnostic identities exactly equal to pre-migration baseline; no new errors. Full output `.mauzcode/tmp/hl/transport-typecheck.json`.
- Models, frontendBridge/models and affected code-index suites: 183 pass, zero fail, 1218 assertions, 17 files. Output `.mauzcode/tmp/hl/transport-tests.log`.
- Full reindex/quality: baseline eight errors remain, zero model errors; 578 warnings (not warning-free).

Reload leaves by full dotted names or exact `models/transport` and `models/catalog` directories, then facades. For rollback restore original six root bodies, matching test fixture setup and remove added source only after review, regenerate types and reload roots. Do not assume reload removes retained registry entries: verify with isolated fresh discovery. No service restart performed.
