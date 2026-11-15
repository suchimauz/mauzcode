## MODIFIED Requirements

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

## ADDED Requirements

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
