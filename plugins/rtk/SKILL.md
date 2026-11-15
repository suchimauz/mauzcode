# RTK

Official plugin that owns the instance-wide state of the optional [RTK](https://github.com/rtk-ai/rtk) integration: owner intent (enabled/disabled), the latest availability check and a monotonic revision. RTK is **off by default**. When enabled, local bash tool calls are prepared with `rtk rewrite` (see below); SSH targets, remote workspaces, the Terminal plugin, other tools and internal subprocesses are never affected.

## State

- One row in `rtk_control` for the whole instance — not per agent, chat or workspace.
- `rtk.status({})` reads it (never probes). A missing row reads as disabled/unknown.
- Every transition increments `revision`; check/enable results computed against an older revision are discarded, so a disable or failure can never be overwritten by a late success.
- In-process verification (`ctx.state.rtk.verifiedRevision`) is cleared by plugin start/stop/reload and process restart. `rtk.revalidate({})` probes once before the first use of a persisted enabled state; a failed probe disables RTK.

## Probe

`rtk.probe` resolves `rtk` on the **server process PATH** (the same lookup a shell would do), then runs, with direct argv, no shell, closed stdin and a hard deadline and output cap:

1. `rtk --version` — must print `rtk <semver>` and exit 0;
2. `rtk rewrite "git status"` — must exit 0 or 3 with one nonempty line containing `rtk`. The rewrite is only inspected, never executed.

Unavailable reasons (`code`): `missing` (not on PATH), `permission` (not executable), `signal` (e.g. SIGILL — binary built for another CPU), `timeout`, `overflow`, `spawn`, `incompatible` (unexpected version or rewrite protocol), `policy` (RTK refused the read-only probe, exit 1/2, e.g. because of its configuration or permission rules).

## Operations

- `rtk.check({})` — records availability; failure turns RTK off; success never turns it on.
- `rtk.enable({})` — fresh probe in the same operation; commits only if neither the revision nor the plugin lifecycle changed meanwhile.
- `rtk.disable({ reason? })` — immediate and unconditional; invalidates in-flight checks/enables. A later healthy binary never re-enables RTK by itself.
- HTTP: `GET /rtk/api` (owner only: state + CSRF token, never probes), `POST /rtk/api` `{ action: "check" | "enable" | "disable" }` (owner, same origin, `x-csrf-token`, JSON ≤ 1 KiB; enable returns 409 when unavailable).

## Local bash preparation

`tools.bash` calls `rtk.prepare` once per local call (no `host`, or `host: "local"`, in a local workspace) unless the call passes `rtk: false` or the plugin is absent/unloaded — then bash behaves exactly as without RTK.

1. RTK disabled → nothing is consulted. Enabled but not yet verified in this process (restart, reload, change) → one `rtk.revalidate` probe; failure disables RTK.
2. `rtk` is resolved on the call's **effective PATH** (`env`/secrets included) in its cwd. If that is not the checked executable, RTK is skipped for this call (original runs, notice in the result) — it never switches binaries silently.
3. `rtk rewrite <command>` runs with the whole command as one argv argument, no shell, in the effective cwd/environment, within 5 s and 64 KiB and the remaining caller `timeout`. `RTK_REWRITE_HOST` is not set; no permission files are touched. RTK decides support for chains, quotes, redirects and substitutions itself.

| `rtk rewrite` result | What runs | RTK state |
| --- | --- | --- |
| exit 0 or 3, nonempty single command | the replacement, once | unchanged |
| exit 1, no output | the original, once | unchanged |
| exit 2 (with or without message) | **nothing** — denial result | unchanged |
| spawn error, signal, 5 s timeout, overflow, unknown code, empty/contradictory/malformed output | the original, once, with a `[rtk: disabled automatically …]` notice | **disabled**, reason recorded |
| caller deadline exhausted | nothing — timeout result | unchanged |

**Host-owned authority.** Exit 3 means RTK's Claude Code rules ask for approval or do not cover the command; MauzCode does not add a confirmation for it, and Claude Code `ask` rules are *not* an independent MauzCode barrier — MauzCode's own action-specific approvals still apply. Exit 0 is not an authorization grant either.

After a command starts it is never retried, replayed or re-run (also not when it fails, times out or RTK crashes at runtime); a nonzero exit of the user command never disables RTK. The tool-call details record the outcome, original and executed command with resolved secrets masked; no extra raw output is stored. To get full output later, an agent makes a new, separately justified call with `rtk: false` — nothing is replayed automatically.

## Not done by this plugin

It never installs or updates RTK, has no editor for a binary path (install RTK on the server PATH and run a check), and never edits RTK configuration, Claude/agent hooks or permission files.
