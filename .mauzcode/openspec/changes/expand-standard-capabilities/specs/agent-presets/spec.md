## MODIFIED Requirements

### Requirement: Standard preset defaults
By default `standard` SHALL allow an explicit list of core functions: file and search tools, shell, evaluation, workspace, session planning, structured input, canvas, markdown, Git, reading settings and runtime documentation, and delegation. Core functions outside the list, including runtime management, plugin loading, settings and preset writes, SHALL be denied. It SHALL additionally allow `projects.list` and `projects.get` and grant exactly `openspec`, `git`, `websearch`, `browser`, `gh`, `terminal` and `glab`.

#### Scenario: New core namespace
- **WHEN** a new core namespace is added to MauzCode and not added to Standard's list
- **THEN** Standard agents cannot call its functions

#### Scenario: Standard denies runtime management
- **WHEN** a Standard agent is checked for `procs.repl.load`, `plugins.reload` and `settings.set`
- **THEN** all three are denied
- **AND** `tools.read` and `agent.delegate` are allowed

#### Scenario: Explicit default plugin selection
- **WHEN** a new agent receives the shipped Standard preset
- **THEN** its plugin grants are exactly `openspec`, `git`, `websearch`, `browser`, `gh`, `terminal` and `glab`
- **AND** no wildcard or other plugin grant is added

#### Scenario: Project discovery without project administration
- **WHEN** a new default Standard agent checks project capabilities
- **THEN** `projects.list` and `projects.get` are allowed
- **AND** project creation, deletion, modification and `projects.chats` are not granted by this change

#### Scenario: Existing interactive workflows
- **WHEN** a new default Standard agent needs planning or structured questions
- **THEN** its existing `planning.*` and `input.*` grants remain available
- **AND** plugin-specific input kinds remain subject to their plugin access requirements

### Requirement: Built-in presets are editable and resettable
A built-in preset SHALL be editable like any other preset. Resetting a built-in preset SHALL restore its shipped default definition. A built-in preset MUST NOT be deletable. A custom preset SHALL be deletable unless it is the configured default preset.

#### Scenario: Reset after edit
- **WHEN** Standard was changed to grant `redmine` and is then reset
- **THEN** Standard grants exactly `openspec`, `git`, `websearch`, `browser`, `gh`, `terminal` and `glab`
- **AND** its core grants include `projects.list` and `projects.get`

#### Scenario: Delete a built-in
- **WHEN** deletion of `creator` is requested
- **THEN** the operation fails and `creator` remains

## ADDED Requirements

### Requirement: Conservative Standard default upgrade
The default upgrade SHALL update a stored Standard definition only when it matches the recognized previous factory definition. It SHALL preserve customized definitions and all existing agent snapshots. The upgrade SHALL be idempotent and SHALL NOT change Creator or Minimal defaults.

#### Scenario: Untouched factory definition
- **WHEN** the upgrade encounters the previous unmodified factory Standard definition
- **THEN** the stored definition receives the new shipped defaults
- **AND** subsequently created agents receive the new grants
- **AND** previously created agents retain their original snapshots

#### Scenario: Customized definition
- **WHEN** any user-configurable field differs from the recognized previous factory Standard definition
- **THEN** the stored definition is left unchanged
- **AND** documentation explains explicit opt-in to the new defaults

#### Scenario: Repeated upgrade
- **WHEN** the upgrade runs again after successful application
- **THEN** it makes no additional preset changes and does not rewrite agent snapshots

### Requirement: Expanded grants preserve existing guards
The added grants SHALL retain deny precedence, child access intersection and capability-filtered discovery. They SHALL NOT bypass human confirmation requirements, Plan mode restrictions or external service prerequisites.

#### Scenario: Denied granted plugin function
- **WHEN** a snapshot grants a selected plugin but denies one of its functions
- **THEN** the denied function remains unavailable

#### Scenario: Restricted child
- **WHEN** a parent without a selected plugin delegates with Standard as the child preset
- **THEN** the child's access does not exceed the parent's applicable restrictions

#### Scenario: Discovery and confirmation
- **WHEN** a new Standard agent discovers an installed granted plugin
- **THEN** its authorized documentation and instructions are discoverable
- **AND** an outward action still requires its existing confirmation process

#### Scenario: Plan mode and prerequisites
- **WHEN** a Standard agent has OpenSpec access but remains in Plan mode
- **THEN** the grant does not authorize writing artifacts before approval
- **AND** other plugin grants do not automatically install or authenticate external tools
