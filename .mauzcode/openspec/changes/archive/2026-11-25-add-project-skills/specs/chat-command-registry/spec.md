# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
