# Testing MauzCode

Use Bun and `bun:test`; tests are `*.test.ts`. These instructions apply to the MauzCode checkout, not every target workspace. `bun run test` and a complete project typecheck must be clean; run `bun run test:all` before push/deploy. Coordinate **one typecheck owner and one whole-project check per settled batch**; retain full diagnostics, distinguish pre-existing failures and invalidate results after edits. See [runtime authoring](runtime-authoring.md#reload-and-validate).

| File | Kind | May use | Command |
|---|---|---|---|
| `*.test.ts` | fast | code, stubs, isolated test Postgres | `bun run test` |
| `*.it.test.ts` | integration | controlled processes, git repos, Docker SSH/Chrome, tsgo | `bun run test:it` |
| `*.live.test.ts` | live | real network/accounts | `bun run test:live`, manually only |

`test:all` is fast + integration, **never live**. `script/test.ts` lists kinds, writes `.runtime/test-report-<kind>.xml` and supplies the default 20-second timeout (`TEST_TIMEOUT_MS` or `--timeout=` overrides). The current runner uses `--parallel=4 --no-isolate`; inspect the script rather than assuming worker count or runtime duration. A new test is fast unless it needs external processes; fast files taking roughly over one second or spawning processes belong in integration. Narrow by explicit paths, e.g. `bun script/test.ts it ./src/remote` or `bun test ./src/remote/`. Bare filters (`bun test src/remote`) scan unrelated trees including harnesses and can exhaust descriptors (`EBADF`). Tests also appear by kind at `/code/tests`.

## Test database — verified implementation

`src/$test.ts`, `src/_testDb.entry.ts` and `src/_testPreload.entry.ts` implement migrated template databases, **not a new pg_temp schema per context**:

- Use `TEST_DATABASE_URL`, otherwise move `DATABASE_URL` to port 54399. Port 54393 (the shipped working DB port) is explicitly rejected. A custom URL still must identify a disposable test server; this port check does not prove that an arbitrary custom endpoint is safe.
- The shipped `mauzcode-db-test` binds loopback `127.0.0.1:54399` with fsync off (`docker compose up -d db-test` in the installation compose directory, commonly `~/.mauzcode`). CI provisions ParadeDB. Inspect configuration before starting services; do not touch the working DB.
- One migrated `mauzcode_test_t_<hash>` template per core migration set; one `mauzcode_test_w_<hash>_<pid>` database per test process, using ordinary public search_path. Template creation is serialized by an advisory lock.
- Preload resets dirty databases after tests and between files: truncate rows/reset sequences and remove objects created beyond the template. Pools are tracked and closed by preload lifecycle hooks. Code is loaded once per worker; test contexts copy that state. `bunfig.toml` declares the preload.

## Fixtures and isolation

Use `mkTestCtx()` from `src/_testCtx.entry.ts`: real registry/Proxy, migrations, routes and isolated database, deterministic environment, and `markdown.highlight/render` / `repl.eval` stubs. Overrides on `ctx.state.registry.<mod>.<fn>` use the **raw** signature `(_ctx, _session, opts)`. Route tests use `procs.http.dispatch({ method, url, body, headers })` and inspect real `Response` objects.

Tests that exercise model calls use `mkModelsTestCtx()` from `src/agent/modelsTestCtx.entry.ts`, not the base context alone. This test-only facade stubs `models.resolveRoute`, `models.listModels` and `models.stream`; there is no `streamMock` API. Start with `await ctx.fns.agent.start({ model: 'mock/default:test' })` (route grammar: `mock/<account>:<model>`), then set `agent.scratchpad.mockLLM`. Supported controls are `echoUser`, `userText`, `defaultText`, and ordered `turns: [{ text, toolCalls: [{ id?, name, args? }] }]`. `mockTurn` advances on each stream call; an exhausted `turns` list returns `defaultText` or `'done'`. Streaming rejects non-mock connections and unknown agent sessions. Route resolution delegates non-mock routes to the real resolver, so always use explicit mock routes. Never call real LLM providers. Test fixtures go in gitignored `.test-tmp/`, never scanned `src/` or `.mauzcode/`; agent scratch work instead uses `workspace.tmp`.

Fixture contracts are covered by `src/agent/modelsTestCtx.contract.test.ts` (real Proxy/raw registry override, mock routes/streams, and in-process HTTP `Response`). The base helper's legacy `db: false` option does **not** disable Postgres; prefer its default isolated database, and never pass a working database URL.

Frontend tests use Vitest (`bun run frontend:test -- <explicit-path>`), not `bun test`. `frontend/src/lib/mauzcode.test.ts` covers the shell's `requestJson` boundary: unsuccessful JSON responses choose a non-empty string `message`, then a string `error`, then the HTTP-status fallback. Null, primitive bodies and non-string fields must still produce `ApiError` with the original status. Non-JSON responses retain the sign-in error (HTTP 200 becomes 401); successful JSON is returned unchanged. This is separate from the plugin SDK helper in `frontend/src/sdk/api.ts`.

External systems require disposable controlled fixtures (prefer Docker), seeded/reset/torn down by the test. Never depend on user servers, real accounts, `~/.ssh`, or ambient network state. `test/ssh/` supplies reusable sshd containers and private config via `MAUZCODE_SSH_CONFIG` / `MAUZCODE_SSH_CONTROL_DIR`; `test/chrome/` supplies browser fixtures. Docker-dependent suites use `describe.skipIf(!dockerAvailable)` and support `MAUZCODE_SKIP_DOCKER_TESTS=1`, so missing Docker is a skip rather than a platform assumption.
