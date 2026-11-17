# agent-presets Specification

## Purpose
Define agent presets: named, stored compositions that decide which runtime functions, native tools, plugins and prompt guidance an agent receives, fixed per agent at creation and enforced as a guardrail over tools, system prompt and evaluation.

## Requirements

### Requirement: Agent preset definition
An agent preset SHALL have an identifier, name, description, sort order, built-in flag, allow and deny patterns, plugin grants, excluded prompt sections and a prompt addition. Built-in definitions SHALL come exclusively from shipped code; custom definitions SHALL persist exclusively in PostgreSQL. Identifiers MUST be unique non-empty kebab-case strings across both sources.

#### Scenario: Duplicate identifier
- **WHEN** a custom preset is created with the identifier of an existing custom or built-in preset
- **THEN** the operation fails and the existing definition is unchanged

#### Scenario: Custom definitions are not source files
- **WHEN** an authorized caller creates or edits a custom preset
- **THEN** its definition is persisted in PostgreSQL and no source file is generated or modified

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
The system SHALL provide `standard`, `creator` and `minimal` from current shipped code, including the reviewed core catalogue used to generate Standard. Their definitions MUST NOT depend on stored preset rows. Startup and ordinary reads MUST NOT seed, repair or upgrade database copies of built-ins.

#### Scenario: Fresh installation
- **WHEN** the system starts with an empty preset table
- **THEN** all three built-ins are available with their code-generated definitions
- **AND** startup and subsequent reads leave the preset table empty

#### Scenario: Stale database copy cannot override code
- **WHEN** a legacy database row for `standard` has different description, allow rules or plugin grants
- **THEN** every effective read of `standard` returns the current code definition, not the stored row

#### Scenario: Shipped definition changes
- **WHEN** an updated built-in definition is loaded and a new agent is created using its identifier
- **THEN** the new snapshot uses the updated code definition without a preset-row update or reset
- **AND** existing agent snapshots remain unchanged

### Requirement: Standard preset defaults
By default `standard` SHALL allow an explicit list of core functions: file and search tools, shell, evaluation, workspace, session planning, structured input, canvas, markdown, Git, reading settings and runtime documentation, and delegation. Core functions outside the list, including runtime management, plugin loading, settings and preset writes, SHALL be denied.

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

### Requirement: Standard preset project and plugin grants
By default `standard` SHALL additionally allow `projects.list` and `projects.get` and grant exactly `openspec`, `git`, `websearch`, `browser`, `gh`, `terminal` and `glab`.

#### Scenario: Explicit default plugin selection
- **WHEN** a new agent receives the shipped Standard preset
- **THEN** its plugin grants are exactly `openspec`, `git`, `websearch`, `browser`, `gh`, `terminal` and `glab`
- **AND** no wildcard or other plugin grant is added

#### Scenario: Project discovery without project administration
- **WHEN** a new default Standard agent checks project capabilities
- **THEN** `projects.list` and `projects.get` are allowed
- **AND** project creation, deletion, modification and `projects.chats` are not granted by this change

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
The system prompt SHALL contain a shared base followed by capability sections. Each section SHALL declare its required function patterns and appear only when every required function is allowed and its identifier is not excluded. The base MUST NOT describe a capability with its own section. Plugins SHALL be able to ship sections. Splitting or filtering guidance MUST preserve existing exclusion semantics.

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

#### Scenario: Existing exclusions survive prompt reorganization
- **WHEN** a stored snapshot excludes a section whose guidance is shortened, relocated or split into independently filtered blocks
- **THEN** the excluded guidance does not reappear under a replacement section or in generated guidance
- **AND** the stored exclusions and snapshot remain unchanged

### Requirement: Project policies stay in project instructions
The base SHALL instruct every agent to follow applicable workspace `AGENTS.md`. MauzCode project policies SHALL reside in its project instructions and linked documentation, not universal prompts. Historical prompt evidence MUST remain immutable. Reviewed shortening and relocation SHALL be checked by current behavior and safety invariants plus an optimization record, rather than exact paragraph preservation. This instruction MUST NOT depend on `ui.eval` access.

#### Scenario: Project instructions for every built-in preset
- **WHEN** a Creator, Standard or Minimal agent's system prompt is assembled
- **THEN** it contains the generic instruction to follow applicable workspace `AGENTS.md`
- **AND** it does not embed MauzCode-specific UI policies

#### Scenario: Intentional relocation during prompt split
- **WHEN** Creator guidance is shortened or relocated relative to the historical pre-split prompt
- **THEN** the historical `creator-prompt.before.md` remains unchanged
- **AND** a reviewed optimization record accounts for intentional removals, consolidations and relocation destinations
- **AND** tests verify current capability, scope and safety invariants and accessible destinations instead of rejecting every missing historical paragraph
- **AND** unreviewed loss of required behavior or safety guidance fails verification

#### Scenario: External target project
- **WHEN** an agent works in a workspace outside the MauzCode repository
- **THEN** it follows that project's instructions without inheriting MauzCode's source layout, stack or UI implementation policies
- **AND** runtime guidance does not send it to relative MauzCode documentation paths in the unrelated workspace

### Requirement: System prompt follows the preset
An agent's system prompt SHALL describe only tools, plugins, canvas kinds and input forms reachable through allowed functions, and SHALL include the snapshot's prompt addition. Guidance and examples for denied capabilities MUST NOT appear. Independent examples SHALL be gated by their own effective access, including custom denies and inherited snapshot intersections, without changing grants or authorization.

#### Scenario: Standard prompt
- **WHEN** a Standard agent's system prompt is built
- **THEN** it lists no plugins and does not describe plugin reloading or runtime function creation

#### Scenario: Prompt addition
- **WHEN** a preset's prompt addition is "Answer in English"
- **THEN** the system prompt of a new agent with that preset contains "Answer in English"

#### Scenario: Independently gated examples
- **WHEN** Standard permits code graph inspection but denies `code.index`, or a custom snapshot denies one shared-agent or agent-messaging operation
- **THEN** guidance retains allowed operations without advertising the denied operation
- **AND** direct generated guidance and full prompt assembly agree on capability availability

#### Scenario: Narrowed child guidance
- **WHEN** a child combines a parent snapshot with a broader requested preset
- **THEN** its guidance advertises only capabilities permitted by every inherited layer
- **AND** no allow/deny rule, plugin grant or persisted snapshot is widened to make an example usable

#### Scenario: Minimal remains self-contained
- **WHEN** the default Minimal prompt is assembled
- **THEN** it remains API-free and usable with its shell, read, write and edit tools
- **AND** it does not direct the agent to unavailable native grep/find tools or runtime discovery APIs

#### Scenario: User additions retain their order
- **WHEN** a prompt contains snapshot additions and per-agent additions
- **THEN** optimization preserves their text and existing assembly order
- **AND** shortening does not rewrite user additions or prior transcript content

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
The runtime SHALL list, read, create, update, delete, reset and resolve presets. Create, update and delete SHALL operate only on custom definitions; reset SHALL return a built-in's current code definition without writes and reject custom identifiers. Existing snapshot-based write permissions SHALL remain: Creator allows management, Standard and Minimal deny writes. Invalid definitions MUST be rejected; allowed non-destructive custom writes SHALL need no extra confirmation.

#### Scenario: Creator grants a plugin to Standard
- **WHEN** a Creator agent attempts to update Standard to grant `openspec`
- **THEN** the operation rejects the built-in update without writing data
- **AND** it directs the caller to create or edit a custom preset instead

#### Scenario: Creator grants a plugin to a custom preset
- **WHEN** a Creator agent updates a custom preset to grant `openspec`
- **THEN** the update succeeds without an extra confirmation prompt
- **AND** only subsequently created agents using that custom preset receive the changed rules

#### Scenario: Standard tries to edit a preset
- **WHEN** a Standard agent calls the preset update operation
- **THEN** the call fails as denied by Standard

#### Scenario: Reset compatibility
- **WHEN** an authorized caller resets `standard`
- **THEN** the operation returns the current code definition without database writes or snapshot changes

### Requirement: Preset-scoped runtime reflection
Within agent evaluation, enumeration, membership and descriptor reflection on `ctx.fns` SHALL advertise only live functions allowed by the immutable snapshot and namespaces with allowed descendants. Descriptor values MUST preserve the guard instead of exposing raw procedures or registry objects. Explicit denied calls SHALL retain their actionable rejection diagnostic.

#### Scenario: Reflection operators agree
- **WHEN** an agent uses `Object.keys`, `Object.values`, `Object.entries`, spread, `for...in`, `Reflect.ownKeys`, own-property names, descriptors, own-property checks or `in` on the guarded tree
- **THEN** all these surfaces advertise the same permitted properties
- **AND** raw server-state and file inspection remain outside this discovery guarantee

#### Scenario: Standard hides plugin namespaces
- **WHEN** a Standard agent with no plugin grants enumerates `ctx.fns` while GitHub, Redmine and Telegram plugins are mounted
- **THEN** their namespaces are absent from enumeration, membership and property-descriptor results
- **AND** allowed core namespaces remain discoverable

#### Scenario: Partially allowed namespace
- **WHEN** a snapshot allows `plugins.search`, `plugins.read` and `plugins.functions` but denies other functions in that namespace
- **THEN** reflection exposes those allowed functions only
- **AND** `plugins.list` and `plugins.reload` are absent from advertised properties

#### Scenario: Nested namespace visibility
- **WHEN** a snapshot allows one function in a nested namespace and denies its siblings
- **THEN** reflection retains every ancestor needed to reach the allowed function
- **AND** hides sibling functions and branches with no allowed descendants

#### Scenario: Guarded property descriptor values
- **WHEN** an agent obtains a visible namespace or procedure through `Object.getOwnPropertyDescriptor` or `Object.getOwnPropertyDescriptors`
- **THEN** the returned value observes the same snapshot as ordinary property access
- **AND** it does not expose an unguarded raw registry object or procedure

#### Scenario: Explicit denied calls remain actionable
- **WHEN** an agent explicitly calls a denied runtime function by its known full name
- **THEN** the call fails before execution with the existing function-and-preset diagnostic
- **AND** the callable rejection path does not make that function discoverable through reflection

#### Scenario: Creator and internal call compatibility
- **WHEN** a Creator agent enumerates the runtime function tree
- **THEN** all live permitted functions remain discoverable
- **AND** an allowed procedure's internal calls continue to use the ordinary runtime context rather than the agent discovery view

### Requirement: Preset-scoped capability catalogues
Supported agent-facing catalogues SHALL apply the snapshot access predicate to advertised callable capabilities and omit empty groups. Exact lookup of a denied capability SHALL return an unavailable result without its full catalogue entry. Unscoped internal calls SHALL retain existing behaviour.

#### Scenario: Supported discovery surfaces
- **WHEN** an agent uses plugin search/read/function lists, runtime documentation search/get/list, `tools.list`, `tools.schemas`, native tool declarations, generated guidance, or canvas/input kind catalogues and documentation
- **THEN** structured entries and dedicated capability guidance do not advertise denied capabilities as available
- **AND** opaque workflow prose and source-code text are not treated as permission boundaries

#### Scenario: Explicitly granted catalogue helpers
- **WHEN** a custom snapshot grants `tools.list`, `tools.schemas` and `runtime.docs.list` but denies some functions represented by their entries
- **THEN** each helper returns only entries for live permitted capabilities and omits empty groups
- **AND** granting a catalogue helper does not grant the capabilities it describes
- **AND** unscoped internal calls retain their existing results

#### Scenario: Standard discovery agrees across surfaces
- **WHEN** a Standard agent with no plugin grants requests supported discovery catalogues
- **THEN** plugin runtime functions and native tools are not advertised
- **AND** plugin-owned canvas and input kinds whose required implementing functions are denied are not advertised
- **AND** the generated prompt contains no dedicated instructions advertising those denied plugin capabilities

#### Scenario: Partial plugin grant and explicit deny
- **WHEN** a snapshot grants a plugin but denies some of its functions
- **THEN** structured discovery returns only permitted callable entries
- **AND** generated groups with no permitted entries are omitted
- **AND** exact documentation lookup of a denied function does not return that function's documentation

#### Scenario: Required implementation functions determine kind visibility
- **WHEN** a canvas or input kind requires a function denied by the snapshot
- **THEN** agent-facing kind discovery and generated guidance omit that kind
- **AND** granting its owning plugin alone does not override an explicit function deny
- **AND** visibility requires every explicitly declared required function, including the public use entrypoint, to be live and allowed

#### Scenario: Unrelated module grant does not expose a kind
- **WHEN** a snapshot allows an unrelated function in a kind's owner module but denies a declared required function
- **THEN** the kind is absent from catalogues and generated guidance, including full-system-prompt assembly

#### Scenario: Missing dependency metadata
- **WHEN** a registered kind has no explicit required-function metadata
- **THEN** scoped discovery omits it rather than inferring reachability from its module
- **AND** unscoped internal discovery retains its existing behaviour

#### Scenario: Creator omits unannotated external kinds
- **WHEN** Creator queries scoped canvas/input catalogues or generated guidance while an external plugin registers a kind without required-function metadata
- **THEN** that kind is omitted even if Creator permits all of the plugin's live functions
- **AND** the same kind remains present in unscoped internal discovery
- **AND** after dependency metadata is supplied, scoped discovery includes it if every required function is live and allowed
- **AND** this discovery rule does not change action authorization

#### Scenario: Prompt access does not grant advertised actions
- **WHEN** a custom snapshot allows canvas/input prompt generators but denies actions mentioned in their general instructions
- **THEN** both direct prompt calls and full-system-prompt assembly omit instructions advertising the denied actions
- **AND** permitted guidance is retained in separate blocks, such as instructions for allowed `canvas.show` without denied `canvas.close` or `canvas.setState`
- **AND** allowed `input.promptSection` does not advertise denied `input.request`

#### Scenario: Fully permitted and internal discovery compatibility
- **WHEN** Creator queries catalogues and guidance for annotated kinds whose required functions are live, or an unscoped internal caller queries discovery
- **THEN** existing permitted capabilities and useful guidance remain available
- **AND** filtering does not restrict allowed procedures' internal calls

#### Scenario: Agent-local filtering
- **WHEN** two agents with different snapshots query the same live catalogues
- **THEN** each receives results filtered by its own snapshot
- **AND** filtering does not mutate shared registries or another agent's results

### Requirement: Discovery tracks registry and snapshot lifecycle
Preset-scoped discovery SHALL use the agent's existing snapshot and current runtime origins. Mount, unload, reload and origin changes SHALL be reflected on subsequent discovery operations without restarting the server or changing the snapshot. Any visibility cache SHALL be invalidated with registry/access generation changes. Delegated and forked agents SHALL use the intersection of their inherited snapshot layers for discovery as well as calls.

#### Scenario: Retained view observes live changes
- **WHEN** an agent retains its guarded function view while a plugin or project-local function is mounted, replaced or unloaded
- **THEN** subsequent discovery on that view reflects current availability and origins under the same frozen snapshot
- **AND** no unloaded callable is advertised from a stale discovery cache

#### Scenario: Narrowed child
- **WHEN** a child inherits a Standard parent snapshot and an additional Creator layer
- **THEN** it cannot discover plugin functions denied to the parent through supported catalogues or reflection

#### Scenario: Existing session receives the corrected view
- **WHEN** a previously created Standard agent next evaluates code or receives newly generated discovery guidance after the implementation is loaded
- **THEN** its current snapshot is used for the corrected filtering without recreating the session
- **AND** prior transcript messages are not rewritten or claimed to be forgotten

### Requirement: Host runtime guidance is scoped and discoverable
Guidance SHALL distinguish the MauzCode host runtime from the target workspace. Evaluation guidance SHALL explain server-relative file access independently of administrative capabilities. Relocated runtime-authoring rules SHALL remain reachable through existing permitted runtime/plugin documentation, including outside the MauzCode repository. Guidance MUST NOT present the runtime code index as an index of an arbitrary workspace.

#### Scenario: Standard receives the cwd warning
- **WHEN** Standard can evaluate code and use workspace tools but cannot use administrative database or remote APIs
- **THEN** its guidance warns that raw Bun file operations resolve against the server cwd rather than the workspace
- **AND** it directs file access through permitted workspace-aware tools or path resolution

#### Scenario: Runtime index scope
- **WHEN** permitted code graph guidance appears for an agent in another project
- **THEN** it identifies the indexed runtime as its scope and does not imply coverage of arbitrary target-workspace code

#### Scenario: External runtime authoring
- **WHEN** an agent permitted to author runtime functions or plugins needs detailed rules outside the MauzCode repository
- **THEN** a short permitted discovery path reaches the authoring conventions and validation/reload instructions
- **AND** the route does not depend solely on the current workspace's AGENTS.md

#### Scenario: Runtime database guidance
- **WHEN** an agent receives guidance for accessing MauzCode storage
- **THEN** it retains the instruction to use `procs.db` rather than bare Bun SQL defaults

### Requirement: Prompt optimization preserves protective guidance
Shortening SHALL preserve actionable rules for secrets, exact approvals, structured-input waiting, peer-message trust, transcript/event integrity and verification of actual effects. An emitted or dispatched UI action MUST NOT be presented as proof of execution. Existing permission and authorization boundaries SHALL remain unchanged.

#### Scenario: Safety checks after shortening
- **WHEN** optimized built-in and custom prompts are verified
- **THEN** applicable protective instructions remain explicit and testable
- **AND** secrets are not requested in plain chat, peer messages do not authorize outward actions, and emitted UI events are not claimed as confirmed execution

### Requirement: Reproducible prompt optimization evidence
Optimization evidence SHALL compare before and after using the same registry, plugin fixture, workspace and empty per-agent additions. It SHALL report assembled text, generated sections and transmitted native schemas separately. Character counts MUST NOT be called exact model tokens. Measured savings SHALL NOT justify removing safety or capability guarantees.

#### Scenario: Comparable measurements
- **WHEN** an optimization result reports prompt savings
- **THEN** it identifies its fixed fixture and reports before/after sizes separately for prompt text, generated sections and native schemas
- **AND** any tokenizer estimate is distinguished from character counts and exact provider token usage

#### Scenario: Savings target does not override correctness
- **WHEN** Standard or Creator cannot safely reach the 25–35% reduction target within the approved scope
- **THEN** the report gives the measured reduction and remaining opportunities without broadening scope or weakening guarantees
- **AND** any increase in Minimal has a concrete justification

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

### Requirement: Owner read-only preset view
Full effective built-in and custom definitions SHALL be readable by the authenticated owner through the read-only Settings view and owner endpoint. Both SHALL use the same catalogue as snapshot resolution. New-session defaults SHALL expose only identifier, name, description and sort order, never rules or prompt content.

#### Scenario: Menu stays minimal
- **WHEN** the new-session defaults are requested
- **THEN** preset entries contain only `id`, `name`, `description` and `sortOrder`
- **AND** built-in entries come from code and custom entries come from PostgreSQL

#### Scenario: Viewing does not change snapshots
- **WHEN** the owner opens the Agent presets settings tab
- **THEN** no preset, setting or existing agent snapshot is modified

### Requirement: Unified effective preset catalogue
List, get, resolve, default validation, owner Settings and new-session consumers SHALL use one effective catalogue combining generated built-ins with stored custom presets, ordered by sort order then identifier. Reserved identifiers SHALL resolve to code definitions only. Unknown identifiers and missing configured defaults MUST retain their explicit errors without silent fallback.

#### Scenario: Consistent consumers
- **WHEN** a code-defined Standard and a stored custom preset are listed, selected and resolved
- **THEN** all consumers use the same definitions and ordering
- **AND** each identifier appears exactly once

#### Scenario: Missing custom default
- **WHEN** the configured default names a missing custom preset
- **THEN** Settings reports that identifier as missing and creation without an explicit preset fails
- **AND** the system does not silently select Standard

### Requirement: Built-in identity and immutability
Built-in identifiers SHALL be reserved independently of database contents. Creating, updating or deleting them MUST fail without writes and explain that customization requires a distinct custom preset. Custom presets SHALL retain existing editing and deletion behavior, including protection of the configured default. Copying built-in fields into a custom definition MUST create an independent record, not a live override.

#### Scenario: Write attempts without stored built-ins
- **WHEN** an authorized caller attempts to create, update or delete `standard` with no corresponding database row
- **THEN** the operation fails with a built-in identity error and changes no data

#### Scenario: Independent custom copy
- **WHEN** a custom preset is created from Standard fields under a new identifier and Standard later changes in code
- **THEN** the custom preset keeps its stored fields and Standard uses the updated code fields

#### Scenario: Protected custom default
- **WHEN** deletion is requested for the configured custom default
- **THEN** deletion fails and the default remains available

### Requirement: Lossless legacy preset transition
The transition SHALL remove obsolete built-in database rows only after preserving every differing definition as a distinct custom record. Comparison SHALL cover all editable fields and ignore timestamps and rule ordering. Existing custom records MUST remain intact. Migration SHALL be atomic, collision-safe and idempotent; it MUST NOT rewrite existing agent snapshots or configured default identifiers.

#### Scenario: Customized Standard is preserved
- **GIVEN** a legacy Standard grants `nrepl` and `openspec` instead of the shipped plugin list
- **WHEN** the transition runs
- **THEN** a discoverable custom preset preserves its description, sort order, allow, deny, plugins, excluded sections and prompt under a new identifier and clearly identified name
- **AND** `standard` resolves to shipped code and its obsolete database row is removed

#### Scenario: Factory-equivalent row
- **WHEN** a legacy built-in row matches current code in every editable field apart from rule ordering
- **THEN** it is removed without creating a redundant custom preset

#### Scenario: Collision and retry
- **GIVEN** the proposed preservation identifier is already occupied by a custom preset
- **WHEN** migration runs and is then repeated
- **THEN** it preserves the legacy definition under a different available identifier without overwriting the existing custom record
- **AND** the repeated run creates no further copies

#### Scenario: Atomic failure
- **WHEN** preservation or removal fails during migration
- **THEN** the transition rolls back without losing the original definitions or leaving partial copies

#### Scenario: Defaults and old agents keep their identity
- **WHEN** a customized built-in row is preserved as a custom preset
- **THEN** existing agents keep their original identifiers and snapshots
- **AND** a default of `standard` remains `standard`, meaning code-defined Standard for future agents
- **AND** documentation identifies the preserved custom preset as an explicit opt-in for future agents that need the old settings
