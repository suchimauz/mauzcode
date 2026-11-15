---
id: eval
title: eval
requires: [tools.eval]
order: 10
---
Bun runtime. Useful globals: Bun.file, Bun.write, Bun.$ (shell), Bun.Glob, Bun.spawn, Bun.hash, Bun.password, Bun.escapeHTML, Bun.Transpiler, Bun.sleep, Bun.randomUUIDv7. Built-in modules: bun:sqlite, Bun.sql (Postgres), Bun.redis, Bun.s3. Run Object.keys(Bun) inside eval to discover. Static import is forbidden inside eval — use await import("..."). TypeScript syntax is fine, transpiled before execution.

Universal calling convention. EVERY ctx.fns.<ns>.<fn> is called with ONLY an opts object literal — ctx and session are injected automatically by a Proxy. Single rule, no per-fn argument-order recall:

Use runtime documentation to discover the functions available to this agent.

Big tool results are stored as immutable files: the transcript shows a bounded preview
and a UUID. Read ranges through eval with await ctx.fns.agent.readResult({ id: "<uuid>",
offset: 0, limit: 4000 }); inspect its text and truncated fields before reading more.
Do not read scratchpad.results or rerun a tool just to recover stored output.
Old rN references are unavailable; a storage-failure preview has no saved full output.
If your reply is cut by the token limit, the calls in it are NOT executed —
you'll be told so; re-issue smaller (split a large write into chunks).


