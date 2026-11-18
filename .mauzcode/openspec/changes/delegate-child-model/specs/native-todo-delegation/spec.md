## MODIFIED Requirements

### Requirement: Native delegation
The system SHALL provide a native tool `delegate_task` that accepts a `title`, an ordered non-empty `tasks` list in the todo format, an optional `presetId`, an optional `model` and an optional `reasoningEffort`, creates a child of the invoking agent whose todo list is created from `tasks` and runs it asynchronously, and returns the child id with a working status immediately. The child's preset MUST NOT grant more than the invoking agent's preset. The tool MUST NOT wait for the child.

#### Scenario: Delegate work
- **WHEN** an agent calls `delegate_task` with a title and one entry in `tasks`
- **THEN** the call returns a child id at once, and the child appears as a working team member with that entry as its only todo

#### Scenario: Wider preset requested
- **WHEN** an agent passes a `presetId` that grants functions its own preset denies
- **THEN** the child still cannot call the functions the parent's preset denies

## ADDED Requirements

### Requirement: Child model selection
A delegation MAY name the child's model as an exact `provider/accountName:modelId` route. When given, the child SHALL run on that route; when omitted, the child SHALL inherit the delegating agent's model.

#### Scenario: Model omitted
- **WHEN** an agent delegates without `model`
- **THEN** the child runs on the same model route as the agent

#### Scenario: Model given
- **WHEN** an agent delegates with `model` set to an enabled route different from its own
- **THEN** the child runs on that route and the agent's own model is unchanged

### Requirement: Child reasoning effort
A delegation MAY name the child's reasoning effort as `auto` or a reasoning level. When given, the child SHALL start with that effort; when omitted, the child SHALL start with `auto`, regardless of the delegating agent's effort.

#### Scenario: Effort given
- **WHEN** an agent delegates with `reasoningEffort` set to a level the child's model supports
- **THEN** the child starts with that reasoning effort

#### Scenario: Effort omitted
- **WHEN** an agent with reasoning effort `high` delegates without `reasoningEffort`
- **THEN** the child starts with reasoning effort `auto`

### Requirement: Child model validation before creation
The model and reasoning effort of a delegation SHALL be validated before any child is created. An unknown or non-canonical route, a disabled provider, a disabled connection, a disabled model or an effort level the target model does not support MUST fail the delegation with an error naming the rejected value, and MUST NOT create a child, todo list or queued turn.

#### Scenario: Disabled model
- **WHEN** an agent delegates with `model` set to a route whose model the owner disabled
- **THEN** the call fails, the error names the route, and no child agent exists afterwards

#### Scenario: Bare model id
- **WHEN** an agent delegates with `model` set to a model id without provider and account
- **THEN** the call fails and no child agent exists afterwards

#### Scenario: Unsupported effort
- **WHEN** an agent delegates with a `reasoningEffort` level that the target model does not support
- **THEN** the call fails and no child agent exists afterwards

### Requirement: Model choice on every delegation entry point
The runtime delegation function, Goal-bound delegation, forking and shared-agent delegation SHALL accept the same optional model and reasoning effort with the same inheritance and validation rules as `delegate_task`.

#### Scenario: Goal-bound delegation
- **WHEN** an agent working under an active Goal delegates with an enabled `model`
- **THEN** the Goal child runs on that model route

#### Scenario: Shared agent delegation
- **WHEN** a task is delegated to a published shared agent with an enabled `model`
- **THEN** the created child runs on that model route

### Requirement: Visible child model choice
When a child is created with an explicit model or reasoning effort, its transcript SHALL show a visible event naming the chosen route and effort.

#### Scenario: Explicit model recorded
- **WHEN** a child is created with an explicit `model`
- **THEN** the child's chat shows an event naming that route
