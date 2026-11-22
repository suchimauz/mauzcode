# Runtime authoring reference

This is a **MauzCode host runtime** reference, not a technology policy for every project opened in MauzCode. A target workspace may use another language, framework, machine or database. Follow its own instructions. Runtime calls act in the running host; changing the workspace does not retarget the host registry.

From an external workspace, discover the current authoring contract without guessing a host path:

```ts
await ctx.fns.runtime.docs.get({ name: "procs.dev.createFunction" });
```

That API's documentation includes portable authoring guidance. This file is the longer reference in the **host MauzCode checkout**, alongside its `AGENTS.md`; do not resolve it against an unrelated target or copy host policy into that target. The API schema and source are authoritative.

## Procedure contract and placement

- Use Bun and prefer its built-ins over npm dependencies in this codebase.
- One anonymous default-exported procedure per file: `export default async function (ctx: Context, session: Session | null, opts: {...})`. A zero-option function accepts `_opts?: {}` and is called with `{}`.
- `ctx.fns` injects context and session: **every call has only an options object**, e.g. `ctx.fns.mod.fn({})`, never `fn(ctx, ...)`.
- No cross-imports of project files or project types. Call `ctx.fns`; import only Bun, `node:*` or npm. State belongs under the owning namespace on `ctx.state`, never in module-level variables.
- Capitalized type files become global `types.mod.Name`. `Context` and `Session` are global; `Session` is request context, not an agent transcript. Never hand-edit generated `src/ctx_ns.d.ts`.
- Framework functions are `ctx.fns.procs.*` and cannot be shadowed. `src/procs/` is vendored: keep patches minimal and marked `mauzcode:`, prefer upstream fixes and re-vendoring; no application features there.
- Committed application dependencies, routes, migrations and types belong in `src/`. Nothing core depends on may live only in the gitignored `.mauzcode/` overlay. The overlay is scanned after `src/` and overrides by name; it is suitable for small project-local extensions. Substantial private integrations belong in the configured `USER_PLUGINS` directory, not the official plugins tree.
- Scratch data belongs in `.mauzcode/tmp/<agent-id>/` via `workspace.tmp`, not root or `src/`. Controlled test fixtures belong in `.test-tmp/`. Scanner exclusions include `_runtime`, `_test_*`, `_tmp_*`, `tmp_*`, and `node_modules` segments.

## File grammar

| File under a runtime source root | Meaning |
|---|---|
| `mod/fn.ts` | `ctx.fns.mod.fn` |
| `mod/Name.ts` | global `types.mod.Name` |
| `mod/$route_<path>_<METHOD>.ts` | `_` → `/`, `$id` → `:id`; handler `(ctx, session, { req, params })` |
| `mod/$middleware[_<path>].ts` | middleware under the prefix |
| `mod/$start.ts`, `$stop.ts` | lifecycle in `package.json procs.prod` order |
| `mod/$config.ts` | config resolved by `procs.config.resolve({ module })` |
| `mod/$migration_<id>.ts` | async `{ up(ctx), down?(ctx) }`, `_migrations(id)`, ids `YYYYMMDDHHmmss_name` |
| `mod/$setting_<key>.ts` | declared setting in `ctx.state.settings.registry`; read `docs/settings.md` before changing configuration |
| `mod/$script_<name>.js` or `.css` | bundled browser asset, not a runtime function |
| `mod/$cli_<cmd>.ts` | command through `bun script/cli.ts <cmd>` |
| `$main.ts`, `$test.ts`, `*.test.ts`, `*.entry.ts`, `*.d.ts` | skipped by the function scanner |

`src/$main.ts` boots the Proxy registry; `src/$test.ts` provides test contexts. `src/agent/` drives turns; `src/session/` owns persistence; `src/llm/` dispatches providers. `.runtime/` holds instance-generated ports, tokens and assets. `.mauzcode/_runtime/sessions` is legacy SQLite data, **not current storage**.

## Chat commands

A file `reviews/$command_summary.md` declares `/reviews:summary`:

```markdown
---
kind: prompt
label: Review summary
description: Summarize the requested changes
icon: book
section: commands
---
Summarize these changes: {{args}}
```

A JSON object or a TypeScript default export satisfying `types.commands.Command` uses the same metadata; set `template` explicitly instead of providing a Markdown body. The file stem supplies the name. Only core `commands` and `planning` files can set `builtin: true` for a short name. `project` and `user` namespaces are reserved. Optional `args.options` accepts up to 100 `{value,label?,description?}` entries, at most 200 characters per string. Use a key from `ui.iconKeys({})`; unknown icons fall back to `wrench` with a warning.

`$commandSection_reviews.json` containing `{"label":"Reviews","order":30}` declares section `reviews`. Alternatively export `sections = [{id:'reviews', label:'Reviews', order:30}]` from a command module. `$commandKind_<kind>.ts` default-exports a `types.commands.KindHandler`: `validate(command, ctx)` throws on invalid data, `describe(command, ctx)` supplies public catalogue fields and optional `dispatch(ctx,session,opts)` implements execution. Commands of missing kinds remain unavailable until their kind loads. Reload the plugin after removing declarations; disabling or replacing it also withdraws its declarations. File-level validation diagnostics name the source.

For `kind: action`, `fn` must name a runtime action handler, not an arbitrary tool. Explicitly type its third parameter `types.commands.ActionInput` and return type `Promise<types.commands.ActionResult>` (callable contract: `types.commands.ActionHandler`); the loader verifies this metadata. For `prompt`, only `{{args}}` is substituted as literal human text. Project files may declare only prompts; user files may also declare client actions, never server function references.

## Create and document

Create runtime procedures through `procs.dev.createFunction`, after inspecting its live schema. Supply capability-focused `summary` and `description`, explicit `params` (including `[]`), `returnType` and `body`. It validates source and metadata, typechecks, and normally activates the function; consult the live contract for offline/dry-run options and root selection. Do not assume that a selected target workspace is a runtime source root.

Write actionable JSDoc explaining the exact capability and when to use it. Describe every option and meaningful `@default`, `@minimum`, `@maximum` constraints. Prefer precise types over `any`/`unknown`. Do not hand-write localized keyword lists or benchmark phrases: retrieval localization derives from honest metadata. Before unfamiliar edits use `code.slice({ name })`; before signature changes inspect `code.callers({ name })`. `code.quality` and `code.coverage` expose dependency risks; they do not replace tests.

## Reload and validate

Prefer hot reload to restart. After existing function edits:

1. `procs.repl.load({ name: "module.function" })` reloads a function; `{ name: "module" }` reloads a namespace and supported declarative kinds (including prompts, tools, settings, inputs and canvas kinds).
2. Validate each changed function with `runtime.docs.validate({ name, strict: true, typecheck: false })`.
3. Run **one** `procs.dev.typecheck({})` for the settled batch. Coordinate a single owner across parent/children and retain complete diagnostics, including pre-existing failures and the source state checked. Filtered output is not a clean project check; `filter` still compiles the whole project. Never loop typechecking validation or parallel full-project checks. Source changes invalidate the result.

After adding/removing files regenerate declarations with `procs.dev.genTypes({})`; after routes or browser assets use `procs.http.loadRoutes({})`; apply new migrations with `procs.migrate.up({})`. `procs.dev.sync({ rel })` handles an edited file and is normally invoked by the dev watcher (`WATCH=0` disables it). Verify the **served** browser asset, including overlays, not just the source on disk. Crons and plugin mounts retain explicit lifecycle handling.

Reload cannot replace an already-running promise/closure (notably `workerLoop`), replay `$start`/`$stop`, or re-bootstrap `$main.ts`. These and dependency changes may need a coordinated restart: the process retains previously imported dependencies after `bun install`. Inspect the actual host launcher; see [runtime operations](runtime-operations.md). Introspection also includes `procs.dev.doc`, `where` and `lint`.

## Access and prompt review

Classify every new core namespace in `src/agentPreset/coreCatalogue.ts` as Standard, Creator-only or internal and retain coverage tests. Review new functions under Standard wildcard grants: existing snapshots gain matches automatically; changing defaults does not rewrite snapshots. Narrow grants or add denies and test the decision when needed. Review plugin/project-local origins and direct-call guards independently of internal calls. Presets are guardrails, not isolation: eval and shell retain server privileges.

Prompt sections use unique `id`, `title`, `requires: [module.function]`, numeric `order`, and optional `generator: module.function` YAML metadata. Every required API must be allowed; any snapshot layer's `excludeSections` wins. Generators receive `{ allows }` and must filter advertised capabilities. Plugins use the same loader. Keep the base generic and API-free; put project policy in `AGENTS.md` and topic docs. Reload the owning namespace after edits, keep reviewed prompt fixtures/tests aligned with intentional changes, and preserve stable section IDs, capability gates and exclusions. See [agent presets](agent-presets.md) and [architecture](architecture.md).

Canvas/input kinds declare exact runtime `requires`, including `canvas.show`/`input.request` and advertised hint capabilities. Discovery requires every dependency live and allowed; unannotated kinds are omitted even for Creator but retained internally. This filters discovery, **not action authorization**. Split mixed guidance by requirements; keep markdown renderers independent.
