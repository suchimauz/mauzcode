# agent-presets Specification

## Purpose
Define agent presets: named, stored compositions that decide which runtime functions, native tools, plugins and prompt guidance an agent receives, fixed per agent at creation and enforced as a guardrail over tools, system prompt and evaluation.

## Requirements

### Requirement: Agent preset definition
An agent preset SHALL be a persistent composition with an identifier, a display name, a description, a sort order, a built-in flag, `allow` function patterns, `deny` function patterns, granted plugins, excluded prompt sections and a system-prompt addition. Preset identifiers MUST be unique, non-empty kebab-case strings.

#### Scenario: Duplicate identifier
- **WHEN** a preset is created with the identifier of an existing preset
- **THEN** the operation fails and the existing preset is unchanged

### Requirement: Function patterns and plugin entries
A function pattern SHALL match full runtime function names (`<namespace>.<function>`, nested namespaces separated by dots), where `*` matches any sequence of characters including dots. A granted plugin entry SHALL be a plugin name or `*` for every plugin.

#### Scenario: Pattern matches nested names
- **WHEN** a preset allows `procs.*`
- **THEN** `procs.dev.typecheck` and `procs.db.select` are matched by that pattern

#### Scenario: Wildcard plugin entry
- **WHEN** a preset grants `*`
- **THEN** every installed plugin is granted

### Requirement: Function access resolution
A function in a plugin namespace SHALL be allowed only when its plugin is granted and no `deny` pattern matches it; `allow` patterns MUST NOT grant plugin functions. Any other function SHALL be allowed when an `allow` pattern matches it and no `deny` pattern does. Functions from project-local runtime roots SHALL always be allowed unless a `deny` pattern matches them. Every other function MUST be denied.

#### Scenario: Allow does not grant plugins
- **WHEN** a preset allows `*` and grants no plugins
- **THEN** `files.read` is allowed and `redmine.myIssues` is denied

#### Scenario: Project-local functions
- **WHEN** a Standard agent calls a function defined in the project's `.mauzcode/skill/` root
- **THEN** the call is allowed

#### Scenario: Deny wins
- **WHEN** a preset allows `*` and denies `procs.*`
- **THEN** `procs.repl.load` is denied and `files.read` is allowed

#### Scenario: Unlisted function
- **WHEN** a preset allows only `tools.read`
- **THEN** `tools.bash` is denied

#### Scenario: Deny narrows a granted plugin
- **WHEN** a preset grants plugin `redmine` and denies `redmine.prepare*`
- **THEN** `redmine.myIssues` is allowed and `redmine.prepareTimeEntry` is denied

### Requirement: Manual plugin grants
A plugin SHALL be available to an agent only when its preset grants that plugin by name or with `*`. Granting a plugin SHALL allow every function in every namespace the plugin's manifest declares. A newly installed official or user plugin MUST NOT be added to any preset automatically. A granted plugin that is not installed SHALL be ignored without error.

#### Scenario: New user plugin
- **WHEN** a user plugin is installed while Standard grants no plugins and Creator grants `*`
- **THEN** a new Creator agent can use the plugin
- **AND** a new Standard agent cannot use it

#### Scenario: Plugin with several namespaces
- **WHEN** a preset grants plugin `browser`, which declares namespaces `browser`, `cdp` and `chrome`
- **THEN** functions in all three namespaces are allowed

#### Scenario: Missing plugin
- **WHEN** a preset grants plugin `foo` that is not installed
- **THEN** agents with that preset are created and run normally

### Requirement: Snapshots freeze rules rather than registry contents
An immutable snapshot SHALL preserve access rules, not enumerate the functions installed at creation. Rules SHALL be evaluated against current registry origins. Loading, unloading, overriding functions or changing namespace origin metadata SHALL invalidate cached access decisions and affected discovery and prompt caches without modifying snapshots.

#### Scenario: Existing agent gains wildcard matches
- **WHEN** a plugin is installed after an agent was created with `plugins: ["*"]`
- **THEN** the existing agent can use its functions subject to every snapshot layer and deny pattern
- **AND** its stored snapshot is unchanged

#### Scenario: New function in a granted core namespace
- **WHEN** an agent allows `files.*` and a new core function is registered in `files`
- **THEN** the existing agent can call it unless another layer or deny pattern forbids it
- **AND** its stored snapshot is unchanged

#### Scenario: Origin changes after a cached decision
- **WHEN** a function's origin changes from project-local to an ungranted plugin after its allowed result was cached
- **THEN** the next access check denies it using the current registry origin
- **AND** discovery and generated prompts no longer advertise it as available

### Requirement: Filtered plugin discovery
Standard SHALL allow `plugins.search`, `plugins.read` and `plugins.functions`. Agent-facing discovery SHALL omit ungranted plugins and documentation of denied functions. The generated plugin workflow and index SHALL be omitted when no mounted granted plugin has a reachable function.

#### Scenario: Standard discovers a granted plugin
- **WHEN** a new Standard agent is created with mounted plugin `openspec` granted
- **THEN** it can discover the plugin with search, read its workflow and list its allowed functions
- **AND** its system prompt includes the plugin workflow and index unless explicitly excluded

#### Scenario: Discovery does not expose denied functions
- **WHEN** a Standard agent searches plugins or requests an ungranted plugin through read or functions
- **THEN** no documentation for the ungranted plugin is returned
- **AND** denied functions of granted plugins are also omitted from discovery

#### Scenario: No granted plugins
- **WHEN** a default Standard agent has no granted plugins
- **THEN** its generated system prompt omits the plugin workflow and index
- **AND** plugin discovery remains callable and returns no plugin entries

### Requirement: Built-in presets
The system SHALL provide three built-in presets, `standard`, `creator` and `minimal`. Their default definitions SHALL ship with the code and SHALL be written to storage when absent.

#### Scenario: Fresh installation
- **WHEN** the system starts with no stored presets
- **THEN** `standard`, `creator` and `minimal` exist with their default definitions

### Requirement: Standard preset defaults
By default `standard` SHALL allow an explicit list of core functions: file and search tools, shell, evaluation, workspace, session planning, structured input, canvas, markdown, Git, reading settings and runtime documentation, and delegation. Core functions outside the list, including runtime management, plugin loading, settings and preset writes, SHALL be denied. It SHALL grant no plugins.

#### Scenario: New core namespace
- **WHEN** a new core namespace is added to MauzCode and not added to Standard's list
- **THEN** Standard agents cannot call its functions

#### Scenario: Standard denies runtime management
- **WHEN** a Standard agent is checked for `procs.repl.load`, `plugins.reload` and `settings.set`
- **THEN** all three are denied
- **AND** `tools.read` and `agent.delegate` are allowed

### Requirement: Creator preset defaults
By default `creator` SHALL allow `*` and grant `*`.

#### Scenario: Creator allows everything
- **WHEN** a Creator agent is checked for any runtime or plugin function
- **THEN** the function is allowed

### Requirement: Minimal preset defaults
By default `minimal` SHALL allow only the shell, read, write and edit tools and grant no plugins, so its prompt contains only the base prompt and the file and shell sections.

#### Scenario: Minimal tool set
- **WHEN** a Minimal agent's request is built
- **THEN** its native tools are exactly the shell, read, write and edit tools

### Requirement: Built-in presets are editable and resettable
A built-in preset SHALL be editable like any other preset. Resetting a built-in preset SHALL restore its shipped default definition. A built-in preset MUST NOT be deletable. A custom preset SHALL be deletable unless it is the configured default preset.

#### Scenario: Reset after edit
- **WHEN** Standard was changed to grant `redmine` and is then reset
- **THEN** Standard again grants no plugins

#### Scenario: Delete a built-in
- **WHEN** deletion of `creator` is requested
- **THEN** the operation fails and `creator` remains

### Requirement: Default preset for new sessions
A setting SHALL select the preset used when a new agent is created without an explicit preset; its default value SHALL be `standard`. When the setting names a missing preset, agent creation MUST fail with an error naming the missing preset rather than silently using another preset.

#### Scenario: Create without a preset
- **WHEN** an agent is created without a preset and the setting is `standard`
- **THEN** the agent's preset is Standard

### Requirement: Preset snapshot per agent
On creation every agent SHALL record its preset identifier and an immutable snapshot of the resolved preset definition. All enforcement for that agent SHALL use the snapshot. Later changes or deletion of the preset MUST NOT change existing agents. An existing agent's preset MUST NOT be switchable. The agent's preset name SHALL be visible in the chat.

#### Scenario: Preset edited after creation
- **WHEN** agent A is created with Standard and Standard is later updated to grant `redmine`
- **THEN** A still cannot use `redmine`
- **AND** an agent created afterwards with Standard can use `redmine`

#### Scenario: Preset deleted after creation
- **WHEN** a custom preset is deleted while agents created with it exist
- **THEN** those agents keep running with their snapshots

### Requirement: Existing agents keep current behaviour
Agents that existed before presets were introduced SHALL receive the Creator preset and its snapshot, so their available tools, prompt sections and functions are unchanged.

#### Scenario: Upgrade
- **WHEN** the system is upgraded with existing agents
- **THEN** every existing agent has preset `creator` and can call every function it could call before

### Requirement: Native tools follow the preset
An agent's model request SHALL declare only native tools whose implementing runtime function is allowed by the agent's snapshot. An agent's explicit tool selection, when present, SHALL further narrow this set and MUST NOT widen it.

#### Scenario: Plugin tool hidden
- **WHEN** a Standard agent's request is built while the `redmine` plugin is mounted and not granted
- **THEN** no Redmine tool is declared

#### Scenario: Tool selection narrows
- **WHEN** a Standard agent has a tool selection containing only `read`
- **THEN** only the read tool is declared

### Requirement: Modular system prompt
The system prompt SHALL consist of a base prompt shared by every agent followed by capability sections. Each capability section SHALL declare the function patterns it requires. A section SHALL be included only when every required function is allowed by the agent's snapshot and the snapshot does not exclude the section by identifier. The base prompt MUST NOT describe a capability that has its own section. Plugins SHALL be able to ship their own capability sections.

#### Scenario: Section included by access
- **WHEN** a Standard agent's prompt is built and the delegation section requires `agent.delegate`, which Standard allows
- **THEN** the prompt contains the delegation section

#### Scenario: Section excluded by preset
- **WHEN** a preset allows `canvas.show` and excludes the `canvas` section
- **THEN** the prompt does not contain the canvas section

#### Scenario: Plugin section
- **WHEN** plugin `openspec` ships a section requiring `openspec.run` and Standard does not grant `openspec`
- **THEN** the Standard prompt does not contain that section
- **AND** a Creator prompt does

### Requirement: Project policies stay in project instructions
The base prompt SHALL instruct every agent to read and follow applicable workspace `AGENTS.md` instructions. MauzCode-specific UI design and implementation policies SHALL reside in the MauzCode repository's `AGENTS.md`, with their required documentation links and project scope preserved, rather than in the generated base prompt or capability sections. This instruction MUST NOT depend on permission to call `ui.eval`.

#### Scenario: Project instructions for every built-in preset
- **WHEN** a Creator, Standard or Minimal agent's system prompt is assembled
- **THEN** it contains the generic instruction to follow applicable workspace `AGENTS.md`
- **AND** it does not embed MauzCode-specific UI policies

#### Scenario: Intentional relocation during prompt split
- **WHEN** Creator prompt equivalence is checked against the pre-split snapshot
- **THEN** only exact project-policy paragraphs recorded in a reviewed relocation manifest may be omitted
- **AND** the check verifies that the relocated guidance is covered in the project's `AGENTS.md`
- **AND** any other missing paragraph fails the check

### Requirement: System prompt follows the preset
An agent's system prompt SHALL describe only tools, plugins, canvas kinds and input forms reachable through allowed functions, and SHALL include the snapshot's prompt addition. Guidance for denied capabilities MUST NOT appear.

#### Scenario: Standard prompt
- **WHEN** a Standard agent's system prompt is built
- **THEN** it lists no plugins and does not describe plugin reloading or runtime function creation

#### Scenario: Prompt addition
- **WHEN** a preset's prompt addition is "Answer in English"
- **THEN** the system prompt of a new agent with that preset contains "Answer in English"

### Requirement: Evaluation is filtered by the preset
When an agent evaluates code, every runtime function reached directly from the evaluated code SHALL be checked against the agent's snapshot. A denied call MUST fail before the function runs, with an error naming the function and the preset. Calls made by an allowed function during its own execution SHALL NOT be checked.

#### Scenario: Denied call in evaluation
- **WHEN** a Standard agent evaluates a call to `procs.repl.load`
- **THEN** the call fails with an error naming `procs.repl.load` and Standard
- **AND** nothing is reloaded

#### Scenario: Allowed function with internal calls
- **WHEN** a Standard agent with plugin `openspec` granted calls `openspec.run`, which internally uses denied functions
- **THEN** the call succeeds

### Requirement: Presets are a guardrail, not a sandbox
The system SHALL document that preset enforcement limits what an agent is offered and calls directly, and that evaluation and shell commands still run with server process privileges. Preset enforcement MUST NOT be presented as an isolation or security boundary.

#### Scenario: Documentation states the limit
- **WHEN** the preset documentation is read
- **THEN** it states that evaluation and shell are not isolated by presets

### Requirement: Child agents never widen access
A delegated or forked child agent SHALL inherit its parent's snapshot. A child MAY be created with a narrower preset; its snapshot SHALL then be the intersection of both: `allow` patterns permitted by both, the union of `deny` patterns, plugins granted by both and both prompt additions. A child MUST NOT gain any function the parent's snapshot denies.

#### Scenario: Standard parent asks for Creator
- **WHEN** a Standard agent delegates a child with preset Creator
- **THEN** the child cannot call `procs.repl.load`

#### Scenario: Default inheritance
- **WHEN** a Standard agent forks without naming a preset
- **THEN** the child has the parent's Standard snapshot

### Requirement: Preset management
The runtime SHALL provide operations to list, read, create, update, delete and reset presets, and to resolve a preset into a snapshot. Write operations SHALL be available only to agents whose snapshot allows them: built-in Creator allows them, Standard and Minimal deny them. An allowed write SHALL NOT require a separate human confirmation. Invalid definitions (unknown fields, malformed patterns, missing identifier) MUST be rejected.

#### Scenario: Creator grants a plugin to Standard
- **WHEN** a Creator agent updates Standard to grant `openspec`
- **THEN** the update succeeds without a confirmation prompt
- **AND** new Standard agents can call `openspec.run`

#### Scenario: Standard tries to edit a preset
- **WHEN** a Standard agent calls the preset update operation
- **THEN** the call fails as denied by Standard
