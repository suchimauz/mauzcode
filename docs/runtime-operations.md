# Host runtime operations and storage

These are MauzCode **host** operations. The agent's target workspace can be unrelated or remote: do not assume its cwd, OS, service manager, port, dependencies or database are those of the host. Inspect the live configuration and launcher before changing them. Never apply host policy to another project merely because MauzCode runs the agent.

## Server and REPL

`script/run-service.ts` supervises `src/$main.ts`, rotates `.runtime/server.log` / `server.error.log`, forwards termination signals and handles staged updates from `.runtime/update-pending.json`. It health-checks updates and can roll back checkout/database changes. It defaults to `PORT=3010`, but the actual installation may override that. `.runtime/port` and the running launcher are evidence; neither 3010 nor a particular OS/service manager is universal.

`script/install-service.sh` is specifically a **macOS launchd** installer: its plist is `~/Library/LaunchAgents/com.suchimauz.mauzcode.plist`, with `KeepAlive` and a 10-second throttle, and wrapper logs `.runtime/service.out.log` / `service.error.log`. On that installation `launchctl list` and `launchctl kickstart -k gui/$(id -u)/com.suchimauz.mauzcode` are applicable. Do not run launchctl on Linux or invent a systemd unit: discover the actual owner/launcher first.

Restart boots the **working tree**, not HEAD: inspect `git status` and coordinate with other agents before disrupting uncommitted work. If restarting has no effect or logs repeat `EADDRINUSE`, inspect the actual listener, its cwd, command and parent. An orphaned child may retain the port even after its supervisor exits. Verify ownership before stopping it; never kill an unrelated process or assume PID/port identity. `lsof`/`ps` are useful where installed, not guaranteed host capabilities.

`bun script/repl.ts 'ctx.fns.session.list({})'` evaluates inside the host process; `-f <file>` and stdin are also supported. Use agent-owned scratch paths for scripts. The client reads `.runtime/port` and `.runtime/repl-token`. `POST /procs/repl` requires a run-signed JWT (token file mode 0600), loopback access, and is forbidden in production. Never expose tokens. Eval captures console/print and returns the final expression. Prefer [hot reload](runtime-authoring.md#reload-and-validate) over restarting.

## Database

Storage is **Postgres**, not the legacy SQLite file. Use async `ctx.fns.procs.db.*`, never bare `Bun.sql`/`new SQL()` in application code: their default connection is not the runtime database. Inspect live `information_schema.columns` rather than treating old migrations as current schema.

- `select({ sql, params })` returns rows; `run` returns `{ changes, lastInsertRowid: 0, rows }` (use `RETURNING` and `rows`, or `insert` for IDs). `insert({ into, values })` returns `{ id, changes }`; `exec({ sql })` handles multi-statement DDL without params; `conn({})` returns the runtime pool. Calls are async. `?` placeholders are translated to `$n` internally.
- `DATABASE_URL` is required unless the declared `package.json procs.prod."procs/db".url` supplies it. Do not commit credentials. Keep pool `prepare: false` (Bun 1.3.14 pipelining workaround).
- BIGINT timestamps and counts arrive as strings; convert with `Number()` where appropriate. Quote camelCase aliases, use `GREATEST` rather than scalar `MAX`, and `ILIKE` rather than `COLLATE NOCASE`.
- Migrations are async `{ up(ctx), down?(ctx) }` in `$migration_<YYYYMMDDHHmmss_name>.ts`, tracked in `_migrations(id)`.

The shipped compose setup uses ParadeDB, `mauzcode-db`, loopback `127.0.0.1:54393`, database/user `mauzcode`; these are installation defaults, not universal connection settings. `script/install.sh` generates credentials into `~/.mauzcode/.env` and the application URL; there is **no default password**. The repo `docker-compose.yml` is the source configuration (installed copies can need synchronization). Never publish the DB port on all interfaces. Server settings belong in compose `command: -c …`, not `ALTER SYSTEM` from a REPL. In particular, a quoted comma-list for `shared_preload_libraries` can be interpreted as one library filename and prevent boot. Restarting the DB stops every agent: obtain user approval first.

Tests use a separate template/worker database, **not per-context pg_temp schemas**; see [testing](testing.md). The old `.mauzcode/_runtime/sessions` is retained legacy data; `script/migrate-sqlite-to-pg.ts` is a one-shot migration, not a normal boot step.

## Queue and transcript invariants

- The DB is the source of truth; `ctx.state.agent[id]` is a runtime view. Mutate messages/events only through `session.append*`, `replace*`, `truncate*`, `delete*` and refresh with `session.syncAgentState`. Never push into `agent.messages` or `agent.events` or bypass persistence with direct transcript SQL.
- The queue is inline in `agents(next_run_at, run_state, last_processed_msg_idx)`, **not an agent_jobs table**. `agent/$start.ts` starts one in-process `workerLoop`, claiming work atomically with `UPDATE … RETURNING id`. Do not casually rename `agent.run`/`workerLoop`; reloading the function does not replace a running worker promise.
- Providers use native JSON tools from the `$tool_*.md` registry. `agent.run` persists assistant `tool_calls`, `tools.call` validates arguments, and tool results are `role='tool'` messages with `tool_call_id` and `excluded_from_cursor=true`. There is no active text-marker parser.
- Message/event indices are per-agent contiguous and allocated **inside the insert** (`SELECT COALESCE(MAX(idx),-1)+1 … RETURNING idx`, jittered retry on duplicate). A separate SELECT races with overlapping appends. See `session/appendMessage.ts` and `appendEvent.ts`.
- Forks store `parent_id` and `fork_offset`; use `session.getFullMessages({ id })` for the effective transcript, never copy parent transcripts.
- Eval typechecks its code against the live project with an in-process TypeScript language service. The declared `repl.typecheckEval` / `EVAL_TYPECHECK` controls the default; internal callers can override a single call with `typecheck: false`.
- Prompt composition lives in `agent/SYSTEM_PROMPT_BASE.md`, module `$prompt_*.md` files and `agent.fullSystemPrompt`; the old CORE file is not active. See [runtime authoring](runtime-authoring.md#access-and-prompt-review) and [architecture](architecture.md) for section gates and fixtures.

## Secret handling

Discover existing references with `secrets.list` before asking for credentials; never ask for plain-text secrets in chat. Use secret inputs and tool `secrets` maps without resolving values into the transcript. References are `env://NAME`, `op://vault/item/field`, or local-only `secret://namespace/name` (written through supported secret storage/input APIs).

Runtime consumers use `secrets.get({ ref })`, **not `secrets.resolve`**. `get` checks memory, encrypted `local_secrets`, then the external provider on a miss and persists fetched values. Direct `resolve` always invokes `op`, so it can fail at unattended boot with a locked vault. `src/secrets/callers.test.ts` guards repository calls; `resolve` logs a direct-call event for external callers too. Secret values must never appear in logs, errors, tool results or transcripts; report only safe resolution failure metadata.
