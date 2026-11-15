# Spec Delta

## ADDED Requirements

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
