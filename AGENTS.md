---
description: mauzcode — procs-based Bun codebase with a self-extending agent at `/`.
alwaysApply: true
---

# MauzCode — project guide

This file governs the **MauzCode product checkout**, not every project an agent opens through MauzCode. The **host** is the running Bun/procs server; the **target workspace** can be another project or SSH machine. Inspect that target's own instructions and declared configuration before editing it. Never infer its language, OS, paths, database, launcher or UI conventions from the host. `CLAUDE.md` links here.

## Working rules

- Use Bun for this project (`bun`, `bun test`, `bunx`, `bun build`); prefer built-ins over npm packages. `.env` loads automatically. This is not a runtime prescription for other projects.
- Scope and bound searches; preserve ignore rules. Prefer structured file tools or `rg` / `rg --files`; summarize JSON with `jq`, not grep/sed. Check unavailable commands once and use installed alternatives, never install without permission. `rg` exit 1 means no matches. Structured grep can fall back in-process; shell commands do not automatically do so.
- Runtime eval executes in the **host process**. Raw relative Bun file I/O uses server cwd, not workspace; use workspace-aware tools, explicit resolved paths and SSH host-aware tools as appropriate. Scratch files go through `workspace.tmp` to `.mauzcode/tmp/<agent-id>/`, never root or `src/`.
- One anonymous default-exported function per file. Call `ctx.fns.namespace.function({ ... })` with only options: context/session are injected. No project cross-imports (including types), no module-level mutable state; use global types and namespace-owned `ctx.state`. Never edit generated `src/ctx_ns.d.ts`.
- Core dependencies belong in `src/`, never solely in the gitignored `.mauzcode/` overlay. Keep vendored `src/procs/` patches minimal and marked `mauzcode:`; no application features there. Private substantial integrations belong in configured `USER_PLUGINS`, not official plugins.
- Inspect source/dependencies with `code.slice` before unfamiliar runtime edits and `code.callers` before signature changes. Discover live schemas before calls. Before creating/changing extensions, read `runtime.docs.get({ name: "procs.dev.createFunction" })`; it works from external workspaces without locating this checkout. See [runtime authoring](docs/runtime-authoring.md) for grammar, placement, metadata, generated types and reload workflow.
- Hot-reload changed functions with `procs.repl.load`; do not restart by default. Coordinate **one typecheck owner and one complete project check per settled batch**; preserve full diagnostics and invalidate them after edits. Validate function metadata without repeated project typechecks. Tests use isolated Postgres and mock LLMs, never working data/accounts. See [testing](docs/testing.md).

## Commit messages and OpenSpec references

- Use `type(scope): description` in English, with a short imperative description and a subject of at most 80 characters. Use a stable subsystem scope in lowercase kebab-case (`models`, `agent-preset`, `new-session`), not a change ID. Separate the subject, explanatory body and reference blocks with blank lines. Put implementation details and verification evidence in the body; never claim checks that were not run.
- Use `spec(openspec):` for OpenSpec-only changes: proposals, designs, requirements, task lists/status, acceptance evidence and archiving. Use `docs(scope):` for ordinary documentation and contributor/agent instructions. Changes to the OpenSpec plugin's code are **not** `spec` merely because they concern OpenSpec.
- Classify implementation commits by their main effect: `feat` for new behavior, `fix` for corrections, `refactor` for restructuring without behavior changes, `test` for test changes, `style` for presentation/formatting-only changes, and `chore` for maintenance. Updating OpenSpec tasks alongside code does not turn an implementation commit into `spec`. Use `chore(merge): merge <branch>` for merges and `revert(scope): <what is undone>` for reverts; retain the reverted commit reference in the body.
- Keep commits focused. Before committing, review the staged diff, exclude unrelated changes and secrets, and verify the checks appropriate to the change. Obtain action-specific approval for committing, rewriting history and pushing; approval for one does not authorize the others. Never rewrite history or force-push as routine cleanup.
- For work tied to OpenSpec, append the following reference block (no indentation):

```text
OpenSpec-Change: add-rtk-shell-integration
OpenSpec-Spec: plugin-settings-sections, rtk-shell-integration
OpenSpec-Tasks: 4.1-4.3, 5.1-5.4
```

- `OpenSpec-Change` is the change ID, not a path or archive date. `OpenSpec-Spec` lists capability IDs on one comma-separated line. `OpenSpec-Tasks` lists the actual task IDs/ranges touched by this commit, not a `tasks.md` path; use comma-separated ranges within each numbered section. Preserve lettered IDs such as `2.1a`. Use IDs and names valid at the time of the commit, including for archived changes.
- Include one block per change, separated by a blank line, when a commit spans multiple changes; do not mix their task numbers. Do not repeat `OpenSpec-Spec` lines within a block or substitute `OpenSpec-Proposal`/`OpenSpec-Design` path trailers for these fields. Explanatory document links may remain in the body.
- References describe scope, not completion: proposal/review commits reference the tasks they define or revise; implementation commits reference the tasks they implement; archive commits may reference the full archived task list. Explain removed or unperformed tasks in the body, not in the task-ID field. Verify references against the actual diff and OpenSpec documents rather than guessing from the subject.
- Never invent a change or task mapping. If only a specification is relevant, use `OpenSpec-Spec` alone. If a change/spec is confirmed but no numbered task fits, omit `OpenSpec-Tasks`. If no OpenSpec connection exists, omit the block. Ask the person when an intended association is ambiguous.

## Non-negotiable host invariants

- Postgres is runtime storage. Use async `procs.db.*`, not bare `Bun.sql`/`new SQL()` defaults. Inspect the live schema; never commit credentials or expose DB ports beyond loopback. Database restarts affect all agents and require user approval.
- The DB owns transcripts/events; use authorized `session.*` persistence helpers and sync state, never direct array mutation or transcript SQL. Preserve atomic index allocation and the inline `agents` queue; do not casually rename `agent.run`/`workerLoop`. Details: [runtime operations and queue](docs/runtime-operations.md).
- Never expose secrets in chat, logs, errors or tool results. Discover references with `secrets.list`; use secret inputs/tool secret maps. Runtime consumers use `secrets.get`, never direct `secrets.resolve`.
- Presets are guardrails, **not a sandbox**. Classify new core namespaces and review new functions under wildcard grants; preserve direct-call guards, capability-gated discovery, prompt section IDs and exclusions. Keep the base generic/API-free and project policy here or in topic docs. See [agent presets](docs/agent-presets.md), [authoring](docs/runtime-authoring.md#access-and-prompt-review) and [architecture](docs/architecture.md).

## UI — product-scoped

Before designing, implementing or reviewing **MauzCode's UI**, read [Apple Design skill](docs/skills/apple-design/SKILL.md) and its [scope notes](docs/skills/apple-design/README.md). Respect user intent, existing accessible components/light-dark tokens, focus and reduced motion. Do not enforce this preference in other projects or global settings.

The primary shell is React/Vite; new trusted extensions use public `@mauzcode/ui` and host React. Plugin UI stays in its own `ui/`, with declared grants and exact bundle approval where required. Frontend grants never replace backend auth, ownership, CSRF or explicit human approval. Shared SSR, Canvas renderers, secure inputs and Redmine approval authority still have consumers: **do not delete them because `/old-ui` redirects**. Bridge dispatch is not proof of execution. Read [UI maintenance](docs/ui-maintenance.md) and [UI architecture](docs/ui-architecture.md) before changing these contracts; [live updates](docs/live-updates.md) covers resync.

## On-demand references

- [Runtime authoring](docs/runtime-authoring.md): procedure contract, file grammar, placement, createFunction, hot reload and access review.
- [Runtime operations](docs/runtime-operations.md): launcher discovery (no OS assumptions), REPL, Postgres, queue/transcripts and secrets.
- [Testing](docs/testing.md): test kinds, fixtures, current template/worker test DB and verification discipline.
- [UI maintenance](docs/ui-maintenance.md): SDK contract and residual SSR/screen/tour guarantees without duplicated shell guidance.
- [Agent presets](docs/agent-presets.md), [architecture](docs/architecture.md): snapshot/access and prompt composition contracts.

Use runtime Git helpers where available (`git.run/stage/commit/push/status/stageCommitPush`) for quoting `$` paths and explicit repo selection; honor action-specific approvals. No documentation grants permission to commit, push, restart or deploy.
