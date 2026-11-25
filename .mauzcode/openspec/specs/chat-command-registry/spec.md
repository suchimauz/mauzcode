# chat-command-registry Specification

## Purpose
Defines how chat slash commands are declared by core modules, plugins, projects and users, how they are named, presented, made available, listed to clients and dispatched, so that new commands and command kinds can be added without changing the core or the client.

## Requirements

### Requirement: Declared commands
The system SHALL build the chat command catalogue only from declarations provided by core modules, plugins, projects and users, including skill entries derived from packages visible to the current project and preset. Adding, changing or removing a module declaration SHALL take effect after the declaring module is reloaded, without a server restart. Built-in commands SHALL use the same declaration mechanism as plugin commands.

#### Scenario: Plugin adds a command
- **WHEN** a plugin adds a command declaration and the plugin is reloaded
- **THEN** the command appears in the catalogue and can be dispatched without changes to core command code or to the client.

#### Scenario: Declaration removed
- **WHEN** a declaration file is deleted and the hot reload runs
- **THEN** the command disappears from the catalogue and typing it is rejected as an unknown command.

#### Scenario: Plugin disabled
- **WHEN** a plugin that declares commands is disabled or uninstalled
- **THEN** its commands, command kinds and sections disappear from the catalogue, and typing its commands is rejected as an unknown command.

#### Scenario: Declaration file reloaded
- **WHEN** a declaration file is edited and reloaded under the same command name
- **THEN** the new declaration replaces the old one and is not rejected as a duplicate.

#### Scenario: Skill is a dynamic entry, not a second command list
- **WHEN** a client requests commands for a project with a visible skill
- **THEN** the same server catalogue that supplies ordinary commands includes the skill's qualified name, kind, source label, description and section; no client-side package scan is required.

### Requirement: Invalid declarations are isolated
A declaration with an invalid name, an unknown kind or missing required fields SHALL be rejected with a diagnostic that names its source file. A rejected declaration SHALL NOT appear in the catalogue and SHALL NOT prevent other valid declarations from loading.

#### Scenario: Unknown kind
- **WHEN** a declaration uses a kind that no registered command kind handles
- **THEN** loading reports an error for that file and all other commands remain available.

### Requirement: Namespaced command names
Commands declared by modules and plugins SHALL be named `/<module>:<name>`. Project commands SHALL be named `/project:<name>` and user commands `/user:<name>`. The built-in `/plan`, `/compact` and `/trigger` SHALL keep their short names. Names SHALL be unique across the catalogue; a declaration whose full name already exists SHALL be rejected as invalid. The `skill.` namespace prefix SHALL be reserved for canonical skill IDs; ordinary declarations MUST NOT claim it.

#### Scenario: Plugin command name
- **WHEN** the `git` plugin declares a command `review`
- **THEN** the catalogue lists it as `/git:review` and typing `/git:review` dispatches it.

#### Scenario: Duplicate name
- **WHEN** two different declaration files resolve to the same full name
- **THEN** the later one is rejected with a diagnostic and the first stays unchanged.

#### Scenario: Command does not shadow a skill
- **WHEN** Git also exports an enabled `review` skill
- **THEN** `/git:review` remains the ordinary command and `/skill.plugin.git:review` invokes the skill; an ordinary declaration attempting to claim the latter is rejected even when the skill is absent.

### Requirement: Typed command recognition
Composer text that starts with `/` followed by a command-shaped name, or by a namespace (module path segments separated by `.`), one `:` and a name, SHALL be treated as a command. A command-shaped name that is not in the agent's catalogue SHALL be rejected as an unknown command and SHALL NOT be sent to the model. Text that is not command-shaped, such as an absolute path, SHALL be sent as an ordinary message.

#### Scenario: Unknown namespaced command
- **WHEN** the person submits `/nope:thing now`
- **THEN** the request is rejected as an unknown command and no model turn starts.

#### Scenario: Absolute path
- **WHEN** the person submits `/home/user/file.txt`
- **THEN** the text is accepted as an ordinary message.

#### Scenario: Nested module namespace
- **WHEN** the module `a/b` declares a command `run` and the person submits `/a.b:run`
- **THEN** the command is recognized and dispatched.

#### Scenario: Dotted text without namespace
- **WHEN** the person submits `/file.txt`
- **THEN** the text is accepted as an ordinary message.

### Requirement: Extensible command kinds
Every command SHALL declare a kind. Kinds SHALL be provided by a registry of kind handlers, so a new kind can be added by declaring a handler without changing existing kinds or the dispatcher. The system SHALL provide the kinds `action`, `prompt` and `client`.

#### Scenario: New kind added
- **WHEN** a module declares a new kind handler and a command of that kind
- **THEN** the command is listed and dispatched through that handler without changes to other kinds.

### Requirement: Action commands
An `action` command SHALL name a server function that implements the command action handler contract. The system SHALL run it with the target session, the exact command text, its arguments and the request key, without starting a model turn. The system SHALL record the command invocation and its result in the session history.

#### Scenario: Action command runs
- **WHEN** the person submits an available action command
- **THEN** its handler runs once, the invocation and result appear in the chat, and no model turn is scheduled unless the handler schedules one.

### Requirement: Prompt commands
A `prompt` command SHALL append one ordinary human message to the session, built from its declared template and the person's arguments, and SHALL schedule one normal turn. The template SHALL substitute only the arguments placeholder, inserting the arguments verbatim as plain text. The message SHALL keep the exact typed command text for display. Arguments and template text SHALL be treated as data and SHALL NOT become system instructions or grant privileges.

#### Scenario: Prompt command with arguments
- **WHEN** the person submits a prompt command with arguments
- **THEN** one human message containing the template and the arguments is appended and one normal turn is scheduled.

### Requirement: Client commands
A `client` command SHALL declare one client action from a server-defined allow-list, initially attaching a file, opening a canvas tab and opening the goal editor. The built-in `/goal` SHALL be a `client` command. The server SHALL NOT execute client commands: submitting one to the dispatch endpoint SHALL be rejected with a `client_only` error.

#### Scenario: Pick a client command
- **WHEN** the person picks the "File" command in the composer menu
- **THEN** the composer opens the file attachment flow and no request is sent to the command dispatch endpoint.

#### Scenario: Goal command
- **WHEN** the person submits `/goal ship the release`
- **THEN** the composer opens the goal editor with `ship the release` and no request is sent to the command dispatch endpoint.

#### Scenario: Client command posted to the server
- **WHEN** a client posts a client command to the dispatch endpoint
- **THEN** the server responds with a `client_only` error and changes nothing.

### Requirement: Replay-safe dispatch
Dispatch of server-handled commands SHALL deduplicate retries by the per-agent command request key. An identical retry SHALL return the stored result without running the handler or scheduling a turn again. Reusing a key for different command text SHALL be rejected as a conflict. A long-running handler SHALL run outside the transaction that claims the request key, and a retry while it is running SHALL return the running state without starting it again.

#### Scenario: Retry during a long command
- **WHEN** a client resends `/compact` with the same request key while the first compaction is still running
- **THEN** it receives the running state and the compaction is not started again.

#### Scenario: Retry after lost response
- **WHEN** a client resends a dispatched command with the same request key and text
- **THEN** it receives the original result marked as a duplicate and no work repeats.

### Requirement: Declared presentation
Each command SHALL declare its label, description, icon, menu section, order, input hint and usage examples, and MAY declare an argument placeholder and a static list of argument options. The icon SHALL be a key from the shared server icon allow-list; an unknown key SHALL fall back to a default icon with a load diagnostic.

#### Scenario: Unknown icon key
- **WHEN** a declaration uses an icon key outside the allow-list
- **THEN** the command is listed with the default icon and a diagnostic names the file.

### Requirement: Menu sections
The catalogue SHALL include the menu sections with a label and order. The sections `add` and `commands` SHALL always exist; modules MAY declare additional sections. A command that names an unknown section SHALL be placed in `commands`.

#### Scenario: Plugin section
- **WHEN** a plugin declares a section and a command in it
- **THEN** the composer menu shows that section with its label in its declared order.

### Requirement: Static argument options
A command MAY declare a bounded static list of argument options with a value and optional label and description. The options SHALL be delivered with the catalogue. After the person types the command name and a space, the composer SHALL filter the options locally by the typed text without contacting the server, and picking one SHALL insert its value as the argument. Typed text that matches no option SHALL still be submittable.

#### Scenario: Filter options locally
- **WHEN** the person types `/git:review ma` for a command that declares options `main` and `master`
- **THEN** the composer shows both options without a server request, and picking `main` inserts it as the argument.

#### Scenario: Free text
- **WHEN** the typed argument matches no declared option
- **THEN** the composer shows no options and the person can still submit the command.

#### Scenario: Too many options
- **WHEN** a declaration exceeds the option count or length limit
- **THEN** it is rejected with a diagnostic that names its file.

### Requirement: Declared availability
A command SHALL be able to declare that it is unavailable while the agent is running, that it requires an existing session, and a server availability check returning enabled or disabled with a reason. A failing or timed-out check SHALL make the command disabled. Dispatch SHALL enforce availability, not only the menu.

#### Scenario: Blocked while running
- **WHEN** the agent is running and a command declared as blocked while running is submitted
- **THEN** the menu shows it disabled and dispatch rejects it without side effects.

#### Scenario: Availability check fails
- **WHEN** a command's availability check throws or times out
- **THEN** the command is listed as disabled and dispatch rejects it.

### Requirement: Availability check order
Availability checks SHALL run only for commands the agent's preset allows, and SHALL run concurrently. Whether `/compact` is available SHALL be decided by its declaration, not by the client.

#### Scenario: Check denied by preset
- **WHEN** the agent's preset does not allow a command's availability function
- **THEN** that function is not called and the command is omitted from the catalogue.

### Requirement: Preset filtering
A command whose handler or availability check is not allowed by the agent's preset SHALL be omitted from that agent's catalogue and SHALL be rejected at dispatch as an unknown command. Commands without server functions (`prompt`, `client`) SHALL NOT be filtered by presets. The built-in `/plan`, `/compact` and `/trigger` SHALL always be available regardless of the preset. Presets are guardrails and SHALL NOT be presented as a sandbox.

#### Scenario: Preset denies a handler
- **WHEN** an agent's preset does not allow a command's handler function
- **THEN** the command is not shown in that agent's menu and posting it is rejected.

### Requirement: Command catalogue API
The authenticated catalogue endpoint SHALL return, for an optional agent, a version 2 catalogue with sections and commands, each with name, kind, label, description, icon, section, order, input hint, usage, argument placeholder and options, attachments flag, client action when applicable, enabled state and reason. Fields of version 1 SHALL keep their names and meaning. A version 1 response SHALL omit `client` commands. The mobile API SHALL expose the same per-agent catalogue.

#### Scenario: Version 1 client
- **WHEN** an older client reads `name`, `description`, `inputHint`, `attachments` and `usage`
- **THEN** those fields keep their previous meaning for `/plan`, `/compact` and `/trigger`, and no `client` command such as "File" is listed.

#### Scenario: Mobile catalogue
- **WHEN** an authenticated mobile client requests the commands of its agent
- **THEN** it receives the same commands, sections and availability as the web composer for that agent.

### Requirement: Built-in commands keep behavior
`/plan`, `/compact` and `/trigger` SHALL keep their specified behavior, arguments, idempotency and results after moving to declarations. Their catalogue entries SHALL carry their current icons, labels and sections.

#### Scenario: Toggle planning
- **WHEN** the person submits bare `/plan` in execute mode
- **THEN** planning mode turns on without starting a model turn, exactly as before.

### Requirement: Project and user prompt commands
The system SHALL load Markdown prompt commands from the agent workspace's `.mauzcode/commands/` as `/project:<name>` and from the user plugins directory's `commands/` as `/user:<name>`. Project commands SHALL be read from the agent's own workspace, including SSH workspaces, with limits on file count and size. Files over the limits SHALL be skipped with a diagnostic.

#### Scenario: Project command
- **WHEN** the workspace has `.mauzcode/commands/release-notes.md` with a valid header
- **THEN** that agent's catalogue lists `/project:release-notes` and submitting it appends its template as a human message.

#### Scenario: Oversized file
- **WHEN** a project command file exceeds the size limit
- **THEN** it is not listed and a diagnostic names the file.

### Requirement: Project command freshness
An edited project command file SHALL be picked up on the next catalogue request after a short cache period, even when the directory itself did not change.

#### Scenario: Edited project command
- **WHEN** the person edits the template of an existing project command file
- **THEN** after the cache period the catalogue and dispatch use the new template.

### Requirement: Project and user commands cannot gain privileges
A project command SHALL use only the `prompt` kind; a user command SHALL use only the `prompt` or `client` kind. Any other kind, including `action`, SHALL be rejected with a diagnostic naming the file. Project and user command content SHALL be treated as untrusted data.

#### Scenario: Project command declares an action
- **WHEN** a project command file declares `kind: action` with any function name
- **THEN** the command is rejected with a diagnostic, is not listed, and no server function becomes callable through it.

### Requirement: Client renders only the catalogue
The composer command menu SHALL derive every command's label, icon, section, order, availability, argument hint and client action from the catalogue. It SHALL NOT contain behavior or presentation tied to specific command names. While the person types, the menu SHALL accept and filter namespaced names, including upper-case letters, `.` module segments and one `:`.

#### Scenario: New plugin command in the menu
- **WHEN** a plugin command with its own icon and section is added and reloaded
- **THEN** the composer menu shows it with that icon in that section without a client release.

#### Scenario: Typing a namespaced command
- **WHEN** the person types `/git:re`
- **THEN** the menu stays open and shows `/git:review`.

### Requirement: Project and preset context for the skill catalogue
The authenticated catalogue SHALL derive skill entries from the current workspace and effective preset of an existing chat, or the authorized selected project and preset (including the effective default) of a new chat before its first message. A client changing either selection SHALL discard stale entries. Requests without project context MUST NOT fall back to another project to discover skills.

#### Scenario: First message and existing chat agree
- **WHEN** the person selects a project and Standard in the new-session composer, then submits an available skill as the first message
- **THEN** the same ID and access policy apply to its first dispatch and subsequent discovery in the created agent's chat.

#### Scenario: Project or preset changes before submission
- **WHEN** the person switches project or selects Minimal after opening the menu or drafting a skill command
- **THEN** the menu refreshes for the new context and an ID no longer available cannot be invoked from the draft, even if the user pastes the old full command.

### Requirement: Skills menu and deliberate selection
The existing slash menu SHALL group visible skills under **Skills**, with a short name, source and description. Search SHALL match the short name as well as the full ID. Source labels SHALL distinguish coincident short names, including additional roots or plugins with similar labels. Picking a result by pointer or keyboard SHALL insert it without submitting and SHALL allow the person to append or edit the task. Searching SHALL NOT create a short-name invocation alias.

#### Scenario: Two review results
- **WHEN** the user types `/review` and both the Git and workspace skills are visible
- **THEN** the Skills group offers distinct rows such as `review · Git` and `review · Workspace`, with descriptions; picking the Git row inserts it without starting a turn.

#### Scenario: Same display label is insufficient
- **WHEN** two rows would otherwise have the same short name and source label
- **THEN** each row and its selected chip expose a distinguishing source qualifier, such as the plugin ID or named root.

#### Scenario: Unqualified text is not a runnable skill
- **WHEN** the person submits the literal `/review` without selecting a result and there is no ordinary command registered under that exact name
- **THEN** it is rejected as an unknown command, even if there is only one matching skill; neither matching package is invoked implicitly.

### Requirement: Friendly chips retain the exact invocation
A selected or recognized full skill invocation SHALL be represented by a source-labelled chip in the composer and in sent history, alongside the person's unmodified task text. Either chip SHALL offer an accessible copy action for the exact slash-prefixed ID. The underlying draft and command record SHALL retain the canonical invocation; the body of `SKILL.md` SHALL NOT replace the user's text in history. Ordinary slash-looking prose SHALL NOT be rendered as a skill chip.

#### Scenario: Select, copy and reopen history
- **WHEN** the person selects the Git `review` skill, types `check my changes`, sends it and later reopens the chat
- **THEN** the composer before send and the historical message after send show `[review · Git]` with the task; copying either chip gives `/skill.plugin.git:review`, not a localized label or the task text.

#### Scenario: Paste the full invocation or view a removed skill
- **WHEN** a person types or pastes `/skill.plugin.git:review check my changes` directly, or later views its accepted message after Git is disabled
- **THEN** an available typed invocation works without opening the menu, and the historical record remains legible and copyable even if the skill is later unavailable; copying does not reactivate it.

### Requirement: Skill dispatch starts one ordinary turn
On submission the server SHALL resolve the exact ID against current access. An accepted command SHALL keep the command and task as the user message, record a completed `read_skill({id})` call with its `skills.read` result, and schedule one ordinary turn; the skill is not run as a server action. A failed lookup SHALL NOT enqueue a turn or substitute another source. Retries SHALL follow the existing request-key rules, including new-session submissions.

#### Scenario: Disabled between selection and send
- **WHEN** someone disables the selected plugin export after the user picks it, or the requested workspace package disappears
- **THEN** submit reports the ID unavailable, with no fallback to a same-named skill and no model turn for that request.

#### Scenario: Skill instructions are present in the first turn
- **WHEN** the person sends `/skill.plugin.git:review check my changes`
- **THEN** the history contains the person's message, followed by a completed `read_skill` call for `skill.plugin.git:review` with its result, and the model's first response in that turn can follow the instructions without calling `read_skill` again.

#### Scenario: Chat without skill access
- **WHEN** a full skill invocation is submitted in an existing chat whose frozen preset lacks skill reading
- **THEN** it is rejected with a message that this chat's preset has no access to Skills and a new chat is needed, and no turn is scheduled.

#### Scenario: Retry after an uncertain response
- **WHEN** the same accepted invocation and request key are submitted again after the response was lost
- **THEN** the original result is returned without a second message, turn or new chat; reusing the key with different text is a conflict.
