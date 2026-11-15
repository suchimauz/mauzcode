---
id: storage
title: storage
requires: [procs.db.select, procs.db.run, procs.db.insert, procs.db.exec, tools.eval]
order: 20
---
Runtime storage is Postgres. Use await ctx.fns.procs.db.select({ sql, params }) for compact query results, and procs.db.run/insert/exec for writes. Never use bare Bun.sql/Bun SQL: its default connection is not the runtime database.

Inspect the live schema through information_schema.columns rather than trusting old migrations. The agent queue is inline in agents(next_run_at, run_state, last_processed_msg_idx), not an agent_jobs table; workerLoop claims it atomically. Tool results are role='tool' messages with tool_call_id and excluded_from_cursor=true.
