# Design

## Context

See proposal.md for motivation. Today `commands.list` returns three literal entries; `commands.parse` validates against that list and returns a union typed to those names; `commands.dispatch` branches: `compact` and `trigger` go to their own functions, everything else is treated as `/plan`. The composer adds a client-only "File" entry and maps names to icons, labels, sections and disabled states in `useCommandMenu.ts` and `CommandMenu.tsx`.

The runtime already has a pattern for declared extension points: `$tool_`, `$dock_`, `$input_`, `$attach_` files are collected by `$loader_<kind>.ts` into `ctx.state`, keyed by module, and hot-reloaded by `dev.sync`. Tool presentation already uses a server icon allow-list (`tools.normalizePresentation`) mapped to Lucide on the client (`toolIcons.ts`). Presets expose a trusted `allows` predicate (`agentPreset.predicate`).

## Goals / Non-Goals

**Goals:**
- One declaration format for built-in, plugin, project and user commands.
- An open set of command kinds behind one dispatcher.
- A catalogue that fully drives the composer menu and the mobile API.

**Non-Goals:**
- Localized labels; declarations provide the text.
- Arbitrary SVG or dynamic Lucide icons.
- Changes to the mobile client UI, which is not in this repository.
- Changing the specified behavior of `/plan`, `/compact` or `/trigger`.

## Decisions

### D1. Declaration files and loader
`src/commands/$loader_command.ts` collects `<module>/$command_<name>.ts` (default export `types.commands.Command`), `.json` (same fields) and `.md` (frontmatter fields, body as the `prompt` template) into `ctx.state.commands.registry`, keyed by full name, and records the source file (`entry.rel`) of every entry. Re-loading a file first removes the entries that file registered before, so reloading the same file never counts as a duplicate; a name collision is only between different source files. Each file is validated on its own (fields, name, option limits, and `kind` against the kind registry); failures are logged with `entry.rel` and skipped.

Removal: `dev/watch` today keeps a deleted file's state (`deleted: types only`). This change adds an unload step for the `command`, `commandKind` and `commandSection` kinds: when such a file is deleted, the watcher calls the loader with a removal entry and the loader drops every entry registered from that file. Other loader kinds keep their current behavior.
Plugin disable and uninstall: when the plugin lifecycle disables, uninstalls or replaces a plugin, the loader drops every `command`, `commandKind` and `commandSection` entry whose source file lies in that plugin's directory, and re-validates commands of removed kinds. A re-enabled plugin registers its declarations again through the normal load.
*Alternative:* a plugin manifest field. Rejected: modules in `src/` have no manifest, and file-per-declaration matches existing extension points and hot reload.

### D2. Naming
Full name = `<module>:<name>`, where `<module>` is the declaring module path with `/` replaced by `.`. Declarations in the `commands` and `planning` modules may set `builtin: true` to keep a short name; the loader rejects `builtin` elsewhere. `project` and `user` are reserved namespaces that only the project and user loaders may use. Module paths may contain dots (`a/b` → `a.b`), so the parser regex becomes `^\/([a-zA-Z][\w-]*|[a-zA-Z][\w-]*(?:\.[a-zA-Z][\w-]*)*:[a-zA-Z][\w-]*)(?:\s+([\s\S]*))?$`. Dots are allowed only before `:`, so `/file.txt` and other dotted text without `:` stay ordinary messages, as today. Absolute paths still fail to match because their second segment follows `/`.
The composer menu uses the matching partial pattern while the person types (letters of any case, digits, `_`, `-`, `.` segments before `:`, and one `:`), so `/git:re` and `/a.b:` still filter the menu instead of closing it.
*Alternative:* flat names with conflict rejection. Rejected by the user in favor of always-namespaced extension commands.

### D3. Command kinds as a registry
`$commandKind_<kind>.ts` default-exports `types.commands.KindHandler`: `validate(decl)`, optional `dispatch({agentId, command, text, args, requestId})`, and `describe(decl)` for extra catalogue fields (for example `clientAction`). The command loader checks `kind` at load time. Because loader order between modules is not guaranteed, a command whose kind is not registered yet is held as pending and re-checked whenever a kind is loaded; commands still pending when boot (or a `dev.sync` pass) finishes are reported with a diagnostic naming the file and stay out of the catalogue. When a kind file is reloaded or removed, commands of that kind are re-validated; commands whose kind disappeared are dropped with a diagnostic.
- `action`: calls the function named by `fn`. That function MUST be an action handler with the signature `(ctx, session, {agentId, command, text, args, requestId}) => Promise<ActionResult>`, where `ActionResult` is `{status: 'completed'|'running', result: JSON}`; ordinary runtime functions are not valid targets. The contract is the type `types.commands.ActionHandler`; the loader checks that the named function exists and documents the contract in `docs/runtime-authoring.md`.
- `prompt`: appends one human message whose text is the rendered template; the message also stores the exact typed command text (`/name args`) as metadata, which the chat shows above the expanded text. The template is substituted only for `{{args}}`, with the arguments inserted verbatim as plain text (no other placeholders, no Markdown or HTML interpretation). Both the typed text and the rendered template are human-role content, never system text. `/trigger` keeps its own action handler (`commands.trigger`) and is not migrated to `prompt`, so its stored message stays exactly as today.
- `client`: no `dispatch`; the dispatcher returns 400 `client_only`. `clientAction` is one of `attach-file`, `open-canvas` with `{kind, args}`, or `open-goal`. `/goal` becomes a built-in `client` command declared in the `commands` module (`builtin: true`, label "Goal", section `commands`, `clientAction: open-goal`); the composer opens the goal editor with the typed arguments as today. The `/goal` name check in `LiveComposer` is replaced by running the catalogue entry's `clientAction`.
*Alternative:* a closed union of kinds. Rejected: the user asked to leave room for future kinds.

### D4. Shared dispatch wrapper
`commands.dispatch` resolves the command from the per-agent catalogue, enforces availability, then runs common steps around the kind handler. It uses two phases:
1. **Claim** — a short transaction with the agent row locked: request-key deduplication in `agent_command_requests` (identical retry → stored result, different text → conflict), `planning.assertIdle` when `blockWhileRunning`, the `command_invocation` event, and a `running` claim row.
2. **Run** — the kind handler runs outside the claim transaction. Short handlers (`/plan`, `prompt`) may do their own transactional work; long handlers (`/compact`) keep their existing two-phase design. The wrapper then saves the result and emits `command_result` in a second short transaction. A handler that returns `status: 'running'` keeps the claim open and finishes it itself, as `/compact` does today; the route answers 202.

Orphaned `running` claims are marked `interrupted` by the existing compact recovery, generalized to all commands. Retries never re-run a handler whose claim exists. The existing `/plan` transaction body moves into `planning`'s action handler; `compact` keeps its existing function as its action handler.

### D5. Presentation and icons
The tool icon allow-list moves to a shared server function (for example `ui.iconKeys`), used by both `tools.normalizePresentation` and the command loader. The client keeps one key→Lucide map (`toolIcons.ts`, renamed to a shared icon module) and adds the keys built-in commands need (`alarm-clock`, `list-checks`, `circle-dashed`, `paperclip`, `target`). Sections come from `$commandSection_<id>.json` or from the `sections` export of a command module; `add` and `commands` are built in.

### D5a. Static argument options
A command may declare `args: {placeholder?, options?}`. Options travel with the catalogue and the composer filters them by prefix and substring of value and label. Declarations with too many or too long options are rejected by the loader.
*Alternative:* a server suggestion function queried per keystroke through a separate route. Rejected for now: it adds a route, timeouts and preset checks for little current need. A future `suggest` field can be added without changing `options`.

### D6. Availability and presets
Catalogue entries are computed per agent: static flags (`blockWhileRunning`, `requiresSession`), then preset filtering using the agent's frozen snapshot via `agentPreset.predicate`: a command is visible only if its `fn` and `available` functions are allowed. Only then do the remaining commands' optional `available` functions run, in parallel, each under a short timeout (default 500 ms, failures → disabled with reason). A function the preset denies is therefore never called, and one slow check does not delay the others. `/compact` is declared with `requiresSession: true` and `blockWhileRunning: true`, which replaces the client-side `compact` flag of `useCommandMenu`; the composer no longer decides its availability. Commands without server functions (`prompt`, `client`) are not filtered by presets: they only add a human message or act in the client, which the person could do by hand. Built-in commands (`builtin: true`) are always visible: their handlers are core lifecycle operations, and a preset cannot hide `/plan`, `/compact` or `/trigger`. The dispatcher repeats every check. Calls without an agent (new-session composer) get static flags only and `requiresSession` commands are disabled.

### D7. API shape
`GET /commands?agentId=` returns `{version: 2, sections, commands, csrfToken}`; command objects keep the v1 fields unchanged and add `kind`, `label`, `icon`, `section`, `order`, `args`, `clientAction`, `enabled`, `reason`. `GET /v1/agents/:id/commands` returns the same catalogue for the mobile token principal. The `version: 1` shape (requested with `?version=1`, and the default when no `version` parameter is given until the web client switches) omits `client` commands, because v1 clients cannot run them; v2 includes them with `clientAction`. A v2 client that does not support a `clientAction` value hides that command. Argument options are static data inside each command (`args.options: [{value, label?, description?}]`, at most 100 entries of 200 characters each); the client filters them locally, so no suggestion endpoint exists.

### D8. Project and user commands
Project files are read on each `list`/`dispatch` from the agent's workspace (local or SSH via the workspace file helpers), limited to 50 files of 32 KB each; results are cached per workspace for a short TTL (5 s) keyed by the list of file names with each file's size and mtime, so editing a file invalidates the cache even when the directory mtime does not change. User commands are loaded from `USER_PLUGINS/commands/` by the same loader at startup and on plugin reload. Frontmatter fields are the same as `.md` declarations; `kind` defaults to `prompt`. Project and user commands may use only the `prompt` kind (and, for user commands, `client`); any other kind, including `action`, is rejected with a diagnostic. A repository therefore cannot make the server run a function by adding a file.

## Risks / Trade-offs

- [Per-agent catalogue costs: availability checks and SSH reads on every menu open] → timeouts, short-TTL caches, and the client fetches once per menu open.
- [Moving `/plan` and `/compact` could change idempotency or event order] → keep their existing tests as regression tests and add dispatch tests that compare results before and after.
- [Project command text is untrusted] → it is only ever a human message, never system text; project and user commands cannot use the `action` kind at all.
- [Namespaced names are longer to type] → the menu filters by both the full name and the label.

## Migration Plan

1. Add the registry, kinds and catalogue v2 alongside the current list; built-in declarations reproduce the current entries exactly.
2. Switch `parse`/`dispatch` to the registry; run the existing command, planning and trigger tests.
3. Switch the client to the catalogue fields and remove the per-name tables.
Rollback: revert the commits; no data migration is involved.
