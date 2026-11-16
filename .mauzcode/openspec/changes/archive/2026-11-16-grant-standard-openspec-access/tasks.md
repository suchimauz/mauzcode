## 1. Additive OpenSpec grant

- [x] 1.1 Add isolated regression coverage for additive Standard plugin updates, all mounted OpenSpec functions, unrelated plugin denial and unchanged old snapshots; verify the targeted test passes.
- [x] 1.2 Document an additive OpenSpec opt-in preserving other grants and explain new-agent scope; verify the example against the management API.
- [x] 1.3 Update this installation's stored `standard` through the supported API; read back `nrepl` plus `openspec`, compare unrelated fields and verify every mounted OpenSpec function against a fresh snapshot.

## 2. Integration verification

- [x] 2.1 Run the complete fast suite, project typecheck and code quality check once for the settled batch; record results and distinguish unrelated failures.
- [x] 2.2 Validate this change with `openspec validate grant-standard-openspec-access --strict` and record final task progress.

## Verification evidence

- Live stored preset readback: `plugins: ["nrepl", "openspec"]`; every unrelated field is preserved. All six mounted OpenSpec functions are allowed by a new Standard snapshot; the pre-update snapshot still denies them.
- New additive OpenSpec regression passes in the full suite (49.92 ms) and targeted runner (38.80 ms). No evidence of fixture leakage was found: test registry containers are copied, and the plugin stub is restored in `finally`. That file totals 5 pass / 1 fail due to a timeout in the existing strict CRUD test.
- Complete fast suite: 3701 pass / 12 skip / 11 fail across 623 files. Analysis completed: three OpenSpec failures expect no plugin grants despite HEAD factory defaults already granting OpenSpec; these expectations predate this change. Other failures are four timeouts, a model signature mismatch (`cacheOnly`), two transaction fixture failures and a prompt-budget excess. Those other failures were not baseline-executed, so their pre-existing status is unconfirmed. This is not a clean full-suite result; unrelated fixes are outside this configuration change.
- Complete unfiltered typecheck: `ok: true`, no errors. Code quality: `ok: true`, 0 errors and 559 warnings.
- Strict OpenSpec validation and `git diff --check` pass.
- Complete diagnostics: `.mauzcode/tmp/rb/full-test.log`, `targeted-test.log`, `typecheck.json`, `quality.json` and `failure-context.log`.
