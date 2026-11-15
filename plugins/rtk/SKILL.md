# RTK

Official plugin that owns the instance-wide state of the optional [RTK](https://github.com/rtk-ai/rtk) integration: owner intent (enabled/disabled), the latest availability check and a monotonic revision. RTK is **off by default**. Applying RTK to local bash tool calls is not implemented yet (planned by the `add-rtk-shell-integration` change); today this plugin only checks, enables and disables.

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

## Not done by this plugin

It never installs or updates RTK, has no editor for a binary path (install RTK on the server PATH and run a check), and never edits RTK configuration, Claude/agent hooks or permission files.
