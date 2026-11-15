---
id: storage
title: storage
requires: [procs.db.select, procs.db.run, procs.db.insert, procs.db.exec, tools.eval, files.read]
order: 20
---
Inspect the DB directly:

Call eval with await ctx.fns.procs.db.select({ sql, params }) and log a compact JSON result.

Storage is Postgres (paradedb, :54393). ALWAYS go through await ctx.fns.procs.db.select/run/insert/exec —
bare Bun.sql/Bun SQL defaults to localhost:5432 and is NOT our database.

Queue facts (current, not the init migration): there is NO agent_jobs table — the
queue lives inline in agents(next_run_at, run_state, last_processed_msg_idx),
claimed by workerLoop via atomic UPDATE…RETURNING. A tool result is a
role='tool' message carrying tool_call_id and excluded_from_cursor=true.
Inspect the live schema through information_schema.columns rather than
trusting a migration file.
  CLAUDE.md                     project conventions, REPL workflow, what NOT to do
  source files themselves       authoritative

Reach any of these via ctx.fns.files.read({ path: "<path>" }).
