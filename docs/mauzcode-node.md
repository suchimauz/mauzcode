# MauzCode node relay — retired

The former MauzCode node inference relay is not part of the runtime. Its source
is preserved at `legacy/src/node/`, alongside `legacy/src/llm/` and
`legacy/src/llms/`, for historical reference and possible later reuse. None of
these directories is a scanned function root.

- No `node`, `llm` or `llms` procedures, start hooks, settings or compactors are registered.
- `/node/v1/models`, `/node/v1/usage` and all other `/node/v1/*` endpoints return
  not found. Legacy model settings and usage routes are also unavailable.
- `mauzcode/<node>:<model>` and other legacy inference routes are not accepted by
  the production resolver. There is no hidden relay or provider fallback.
- Applied `_migrations` rows and legacy tables such as `llm_nodes` and
  `llm_node_clients` remain intact. Moving source does not undo migrations,
  revoke historical records or delete stored credentials.

Use the [models provider SDK](models-providers.md): connections declare their
provider and transport; `models.resolveRoute` resolves `provider/account:model`,
and `models.stream`, `models.call` and `models.compact` perform inference.
Connections are managed in the native Models settings surface, with owner-only
backend authorization, cookie-bound CSRF checks and existing approval boundaries.
SSH transport is a models connection transport, not the retired node protocol.

## Deployment verification

After moving legacy code, regenerate declarations and route tables and start a
fresh process. Assert that the three namespaces are absent, the old HTTP endpoint
returns 404 and `migrate.up` succeeds without removing historical rows or tables.
An isolated worktree boot/restart proves the source behavior only; it is not a
production restart. Shared SSR rendering and unrelated compatibility consumers
remain supported.
