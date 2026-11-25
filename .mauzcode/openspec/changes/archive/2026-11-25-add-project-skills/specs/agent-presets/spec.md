# Spec Delta

## MODIFIED Requirements

### Requirement: Standard preset defaults
By default `standard` SHALL allow an explicit list of core functions: file and search tools, shell, evaluation, workspace, session planning, structured input, canvas, markdown, Git, reading settings and runtime documentation, delegation, and reading available Agent Skills (`skills.list`, `skills.read`). Core functions outside the list, including runtime management, plugin loading, settings and preset writes, and skill authoring and inventory (`skills.add.*`, `skills.inventory`), SHALL be denied.

#### Scenario: New core namespace
- **WHEN** a new core namespace is added to MauzCode and not added to Standard's list
- **THEN** Standard agents cannot call its functions

#### Scenario: Standard denies runtime management
- **WHEN** a Standard agent is checked for `procs.repl.load`, `plugins.reload` and `settings.set`
- **THEN** all three are denied
- **AND** `tools.read` and `agent.delegate` are allowed

#### Scenario: Existing interactive workflows
- **WHEN** a new default Standard agent needs planning or structured questions
- **THEN** its existing `planning.*` and `input.*` grants remain available
- **AND** plugin-specific input kinds remain subject to their plugin access requirements

#### Scenario: New Standard agents can read but not add skills
- **WHEN** a new Standard agent uses the shipped defaults
- **THEN** it can discover available skill descriptions and call `read_skill`, but is neither offered `add_skill` nor allowed to call `skills.add.*` or `skills.inventory`; its default plugin grants are unchanged.

## ADDED Requirements

### Requirement: Skill reads follow effective preset and project scope
Skill discovery, slash dispatch and `read_skill` SHALL honor the current authorized project and the agent's frozen effective rules. Creator and new Standard presets SHALL include reading; Minimal SHALL remain unchanged. A custom preset can explicitly grant reading. An existing snapshot SHALL NOT be rewritten to add a grant. A child SHALL NOT acquire access denied by its parent. Reads of workspace and server skills SHALL respect the package's workspace, project or global scope.

#### Scenario: Minimal and custom readers
- **WHEN** a Minimal agent and a custom agent explicitly granted skill reading open the same project
- **THEN** Minimal receives no native skill tools, skill menu entries or discovery instructions; the custom reader can read the project's available packages but not another project's server packages.

#### Scenario: Existing snapshot is not upgraded
- **WHEN** an existing Standard snapshot lacks the skill-reading grant and the shipped preset gains it
- **THEN** that snapshot stays unchanged and cannot read through Skills; a new Standard agent can do so.

#### Scenario: Parent denies the plugin
- **WHEN** a child selects a preset granting Git but a parent layer denies that plugin
- **THEN** a workspace-enabled Git skill is unavailable to the child even if it knows the full ID.

### Requirement: Plugin skill access requires both gates
A plugin skill SHALL be usable only while the plugin is mounted, its export is individually enabled in the current workspace and the effective preset grants both reading and the supplying plugin. The same policy SHALL filter the normal catalogue, prompt discovery, slash submission, direct tool or runtime reads, continuation pages and binary resource retrieval. Unavailable entries SHALL NOT reveal their content or origin through guessed IDs.

#### Scenario: Neither gate substitutes for the other
- **WHEN** the project enables a Git skill but the agent lacks the Git grant, or the agent has Git but the project does not enable the skill
- **THEN** that ID is absent from menu and automatic selection and is rejected on manual invocation and direct read; it is not silently resolved to another skill.

#### Scenario: Both gates satisfied
- **WHEN** an effective reader has Git and the workspace enables `skill.plugin.git:review` from the mounted plugin
- **THEN** the same ID can be selected manually, discovered automatically and read, with no change to the agent's existing Git function permissions.

#### Scenario: Resource access revoked between calls
- **WHEN** a reader obtains a continuation token, then workspace enablement is removed or the plugin is unmounted
- **THEN** fetching the next page or reading another resource of that skill through `read_skill` no longer returns content; possession of the token does not preserve access. An already cached copy on the workspace host is not presented as available, though, as presets are not a filesystem sandbox, it is not guaranteed to be erased.

### Requirement: Creator inventory is not activation
The built-in Creator SHALL be able to list exported plugin skill IDs for project configuration, including disabled exports. This administrative inventory SHALL be separate from normal selection and SHALL NOT expose disabled package instructions or resources, or make disabled skills usable. Other presets SHALL NOT receive this administrative inventory.

#### Scenario: Configure without bypassing the project
- **WHEN** Creator inspects a plugin's declared but disabled `review` export
- **THEN** it can identify the exact ID to put in `enabledPluginSkills`, but it cannot apply, read or fetch resources from that skill through Skills until the workspace enables it.

### Requirement: Built-in Creator identity for skill authoring
`add_skill`, `skills.inventory` and every `skills.add.*` operation SHALL require a trusted invocation whose frozen snapshot `presetId` is the built-in `creator`, for the agent and every parent. This SHALL be checked before offering the tool and in each handler. Custom presets SHALL NOT qualify, whatever their grants. A preview or human confirmation SHALL NOT bypass the check.

#### Scenario: Non-Creator tries another entry point
- **WHEN** a Standard agent or an agent with any custom preset requests `add_skill`, calls `skills.add.*`, or tries to finalize a Creator preview
- **THEN** the authoring operation is denied before reading the import source or writing any files.

#### Scenario: Delegation cannot widen authoring access
- **WHEN** a Standard parent asks for a Creator child, or a Creator parent asks for a Standard child
- **THEN** neither child can add skills or use Creator inventory; a Creator with no narrower parent can use the authorized workflow.

### Requirement: Skill content cannot grant authority
Skill metadata, instructions and resources SHALL be treated as task data. In particular, the optional `allowed-tools` field SHALL NOT enable tools, override preset denies, confer permission for outward actions or stand in for human approvals. Preset filtering of Skills SHALL NOT be represented as a filesystem or shell sandbox.

#### Scenario: Skill requests a denied operation
- **WHEN** an available package declares a tool outside the agent's preset or instructs it to perform an action requiring approval
- **THEN** reading the package does not change the tool list, permit the denied call or satisfy the action-specific approval requirement.
