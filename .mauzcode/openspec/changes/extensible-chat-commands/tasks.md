# Tasks

## 1. Registry and declarations

- [ ] 1.1 Add `types.commands.Command`, `KindHandler`, `Section` and the `$loader_command` loader for `.ts`, `.json` and `.md` declarations, with per-file validation and diagnostics; verify with unit tests for valid files, a missing field, an unknown kind and a duplicate name across two files, reloading the same file without a duplicate error, a kind loaded after its command (pending then accepted), and option limits.
- [ ] 1.1a Add unload of `command`, `commandKind` and `commandSection` entries to `procs/dev/watch` when their file is deleted; verify a deleted declaration disappears from the catalogue and is then rejected as unknown.
- [ ] 1.1b Unload a plugin's `command`, `commandKind` and `commandSection` entries when the plugin is disabled, uninstalled or replaced; verify its commands disappear from the catalogue and are rejected as unknown, and come back after it is re-enabled.
- [ ] 1.2 Implement namespacing (`<module>:<name>`, `builtin` only in `commands`/`planning`, reserved `project`/`user`) and the new parser regex; verify with `commands.parse` tests for namespaced names, nested `/a.b:run` names, unknown commands, `/file.txt` as ordinary text and absolute paths.
- [ ] 1.3 Move the tool icon allow-list into a shared server function used by tool presentation and commands; verify the existing tool presentation tests pass and an unknown command icon falls back with a diagnostic.
- [ ] 1.4 Document `$command_`, `$commandKind_` and sections in `docs/runtime-authoring.md`; verify the example declaration in the doc loads in a unit test fixture.

## 2. Kinds and dispatch

- [ ] 2.1 Add the `action`, `prompt` and `client` kind handlers the `types.commands.ActionHandler` contract and the two-phase dispatch wrapper (claim transaction with request-key deduplication, invocation event and `blockWhileRunning`; handler run outside it; result transaction; `running` results finished by the handler); verify with unit tests for each kind, `prompt` argument substitution and stored typed text, `client_only` rejection, duplicate/conflicting request keys and a retry while a long handler is running.
- [ ] 2.2 Declare `/plan`, `/compact`, `/trigger` (all as `action` with `builtin: true`; `/trigger` keeps `commands.trigger`) the "File" client command and `/goal` as a built-in `client` command with `clientAction: open-goal`; declare `/compact` with `requiresSession` and `blockWhileRunning`; remove name branches from `parse` and `dispatch`; verify the existing planning, compact, trigger command flow and idempotency tests pass unchanged.

## 3. Availability and presets

- [ ] 3.1 Compute the per-agent catalogue in this order: static flags, preset filtering of `fn` and `available`, then the remaining `available` checks in parallel with a timeout; enforce the same checks in dispatch; verify with tests for a running agent, a failing check a preset that denies a handler (hidden and rejected), a preset that cannot hide built-ins, `prompt` commands not filtered by presets, an `available` function denied by the preset never being called, and two slow checks finishing within one timeout.

## 4. HTTP API

- [ ] 4.1 Return catalogue version 2 from `GET /commands?agentId=` keeping v1 fields, add `GET /v1/agents/:id/commands`; verify with route tests for v1 field compatibility, v1 omitting `client` commands, and mobile auth.
- [ ] 4.2 Update the catalogue contract in `docs/planning-mode.md`; verify it matches the route test fixtures.

## 5. Project and user commands

- [ ] 5.1 Load `/user:<name>` Markdown commands from `USER_PLUGINS/commands/` and `/project:<name>` from the agent workspace's `.mauzcode/commands/` (local and SSH) with file count and size limits and a short cache keyed by file names, sizes and mtimes; allow only `prompt` for project and `prompt`/`client` for user commands; verify with tests for a valid project command, an oversized file, a project `action` rejected, an edited file picked up after the cache period, and SSH reads via a stubbed host.

## 6. Composer menu

- [ ] 6.1 Render `CommandMenu`/`useCommandMenu` only from the catalogue: sections and order, icons from the shared map, disabled with reason, filter by name and label; accept namespaced input in the menu pattern (any letter case, digits, `_`, `-`, `.` segments and one `:`); remove per-name tables, the hard-coded `/goal` row and the client `compact` flag; verify with updated `command-menu` and `command-editor` tests (including typing `/git:re` and `/a.b:` keeps the menu open and filtered) and a story with a plugin section.
- [ ] 6.2 Run client commands locally (`attach-file`, `open-canvas`, `open-goal`) and replace the `/goal` name check in `LiveComposer` with the catalogue `clientAction`; and show the command's static argument options after the command name, filtered locally; verify with tests that "File" opens attachments and `/goal <text>` opens the goal editor without a dispatch request, that options filter as the person types, and that free text not in the options can still be submitted.

## 7. Integration check

- [ ] 7.1 Add a test plugin command `$command_x.ts` with its own icon and section, hot-reload it and submit it end to end; then run the `commands`, `planning`, `agentPreset` and frontend test suites, one full typecheck and `code.quality`, and record the results.
