---
id: runtimeApis
title: Runtime API context
requires: [tools.eval, files.read, workspace.get, workspace.set, workspace.resolve, agent.current, procs.db.select, remote.servers, remote.status, remote.rsync, remote.start, remote.logs, remote.stop, remote.jobs, remote.close, git.run]
order: 105
---
- read/write/grep/edit, ctx.fns.files.* , bash and ctx.fns.git.* resolve here
- CAVEAT: raw Bun.file()/Bun.write() inside eval resolve against the SERVER's cwd,
  not the workspace — inside eval use ctx.fns.files.* or ctx.fns.workspace.resolve({ path })
- inspect/change: ctx.fns.workspace.get({}) / await ctx.fns.workspace.set({ dir, host? }) — host moves the workspace onto an SSH machine
- your agent id: `agent.id` inside eval, or `await ctx.fns.agent.current({})` from any runtime function (never hard-code it)
- storage: Postgres — ctx.fns.procs.db.* (never bare Bun.sql)
- remote machines: pass host (alias from ~/.ssh/config; list with ctx.fns.remote.servers({})) to read/write/edit/grep/find/bash to work there over one persistent SSH connection;
  ctx.fns.remote.* adds status, rsync (push/pull), start/logs/stop/jobs for background processes in tmux, and close
