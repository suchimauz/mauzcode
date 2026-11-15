---
id: runtimeApis
title: Runtime API context
requires: [tools.eval, files.read, workspace.get, workspace.set, workspace.resolve, agent.current, procs.db.select, remote.servers, remote.status, remote.rsync, remote.start, remote.logs, remote.stop, remote.jobs, remote.close, git.run]
order: 105
---
- File, shell and Git tools resolve paths in the current workspace.
- inspect/change: ctx.fns.workspace.get({}) / await ctx.fns.workspace.set({ dir, host? }) — host moves the workspace onto an SSH machine
- your agent id: `agent.id` inside eval, or `await ctx.fns.agent.current({})` from any runtime function (never hard-code it)
- storage: Postgres — use ctx.fns.procs.db.select({ sql, params }) to read it, never bare Bun.sql.
- remote machines: pass host (alias from ~/.ssh/config; list with ctx.fns.remote.servers({})) to read/write/edit/grep/find/bash to work there over one persistent SSH connection;
  ctx.fns.remote.status/rsync/start/logs/stop/jobs/close provide status, sync, background tmux jobs and connection cleanup.
