---
id: eval
title: eval
requires: [tools.eval]
order: 10
---
Eval runs TypeScript in the Bun server process. Static imports are forbidden; use await import("...") for built-in or npm modules. Inspect available Bun globals on demand rather than assuming APIs.

CWD guard: raw Bun.file()/Bun.write() inside eval resolve against the SERVER's cwd, not the workspace. Use workspace-aware file tools or explicitly resolved absolute workspace paths; local Bun I/O cannot address an SSH workspace. Never use bare Bun.sql/Bun SQL for runtime storage.

Call every ctx.fns.<namespace>.<function> with ONLY an opts object literal ({} for no arguments); ctx and session are injected automatically. Use runtime documentation to discover available functions.

Big tool results have a bounded preview and immutable UUID. Never read scratchpad.results or rerun a tool merely to recover output. Old rN references are unavailable; a storage-failure preview has no saved full output.
If a reply is cut by the token limit, its calls are NOT executed; re-issue smaller calls.
