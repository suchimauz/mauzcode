# Proposal

## Why

Chat slash commands are hard-coded: the server catalogue lists exactly `/plan`, `/compact` and `/trigger`, parsing and dispatch branch on those names, and the composer menu picks icons, labels, sections and availability by command name. Core modules, plugins, projects and users cannot add their own commands without editing the core and the client. We want an extensible command surface that future command kinds can also plug into.

## What Changes

- Add a server-side command registry. Modules and plugins declare commands as files; the registry hot-reloads them like tools and dock entries.
- Plugin and module commands are always namespaced as `/<module>:<name>`. Project commands are `/project:<name>` and user commands are `/user:<name>`. The built-in `/plan`, `/compact` and `/trigger` keep their short names.
- Command kinds form an open registry. This change ships three kinds:
  - `action`: a server handler runs without starting a model turn;
  - `prompt`: a template plus the person's arguments becomes an ordinary human message for the agent;
  - `client`: a declared UI-only action, such as attaching a file, that the server never executes.
  Unknown kinds are rejected at load time.
- Each command declares its own presentation: label, description, an icon key from the shared server icon allow-list, menu section and order, input hint, usage examples and an argument placeholder and an optional static list of argument options that the client filters as the person types.
- Each command declares its availability: blocked while the agent is running, requires an existing session, an optional server availability check, and preset filtering. Commands that the agent's preset does not allow are hidden and rejected.
- Deleting a command declaration file, or disabling or uninstalling its plugin, unloads its commands.
- `/plan`, `/compact`, `/trigger`, the composer's "File" entry and the client-only `/goal` move onto the registry with unchanged behavior (`/goal` and "File" as `client` commands).
- The command catalogue API returns the richer, per-agent catalogue (version 2, backward-compatible with version 1 fields; version 1 responses omit client-only commands). A mobile API route exposes the same catalogue.
- Projects and users can add Markdown prompt commands in `<workspace>/.mauzcode/commands/` and `USER_PLUGINS/commands/`. They cannot declare `action` commands, so adding a file never makes the server run a function.
- The composer menu renders only from the catalogue. Per-name icon, label, section and availability tables are removed from the client.

## Capabilities

### New Capabilities
- `chat-command-registry`: how chat slash commands are declared, named, presented, made available, listed and dispatched, including extensible command kinds and project and user commands.

### Modified Capabilities
<!-- None: `/trigger` and planning commands keep their specified behavior; chat-trigger-management requirements are unchanged. -->

## Impact

- Runtime: `procs/dev/watch` gains an unload step for command declaration kinds.
- Server: `commands` module (`list`, `parse`, `dispatch`, `http`, `compact`, `trigger`), a new loader for command declarations and command kinds, planning command declaration, preset allow checks, `GET /commands`, a new `GET /v1/agents/:id/commands` route, and `POST /v1/agents/:id/messages` dispatch.
- Shared icon allow-list used by tool presentation, now also used for commands.
- Frontend: `CommandMenu`, `useCommandMenu`, `lib/commands`, the composers' "File" entry, and the `command-menu` and `command-editor` tests and stories.
- Docs: `docs/planning-mode.md` (catalogue contract) and `docs/runtime-authoring.md` (declaring commands and command kinds).
- No database schema changes: idempotency keeps using `agent_command_requests`.
