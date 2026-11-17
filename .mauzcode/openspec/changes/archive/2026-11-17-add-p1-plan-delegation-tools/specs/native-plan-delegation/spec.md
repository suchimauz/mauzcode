## Purpose

Let agents keep their visible plan and delegate work to child agents through typed native tools bound to the invoking agent, with the same validation, ownership and result rules as the runtime plan and delegation functions.

## ADDED Requirements

### Requirement: Native plan update
The system SHALL provide a native tool `plan_update` that accepts an optional `title` and an ordered, non-empty `tasks` list of `{ id, title, instructions? }`, and sets the invoking agent's visible plan. When the agent has no plan, the first task MUST become active. When a plan exists, tasks whose ids are kept MUST keep their state, and new ids MUST start pending. Duplicate, empty or over-long ids and titles MUST be rejected without changing the plan.

#### Scenario: Create a plan
- **WHEN** an agent without a plan calls `plan_update` with tasks a, b, c
- **THEN** its plan shows three tasks, a is active and b, c are pending

#### Scenario: Revise a plan
- **WHEN** an agent whose task a is done calls `plan_update` with tasks a, b2
- **THEN** a stays done and b2 is added

#### Scenario: Duplicate ids
- **WHEN** an agent calls `plan_update` with two tasks that share an id
- **THEN** the call fails with a validation error and the plan is unchanged

### Requirement: Native plan completion
The system SHALL provide a native tool `plan_done` that accepts a task `id`, marks that task of the invoking agent's plan done when it is active, and returns the plan progress and the next active task, if any. Completing an already done task MUST be idempotent. Completing a pending or unknown task MUST fail without changing the plan.

#### Scenario: Complete the active task
- **WHEN** an agent calls `plan_done` with the id of its active task
- **THEN** the task is done and the next pending task becomes active and is returned

#### Scenario: Complete a pending task
- **WHEN** an agent calls `plan_done` with the id of a pending task
- **THEN** the call fails and the plan is unchanged

### Requirement: Native delegation
The system SHALL provide a native tool `delegate_task` that accepts a `title`, an ordered non-empty `tasks` list in the plan format and an optional `presetId`, creates a child of the invoking agent that runs the tasks asynchronously, and returns the child id with a working status immediately. The child's preset MUST NOT grant more than the invoking agent's preset. The tool MUST NOT wait for the child.

#### Scenario: Delegate work
- **WHEN** an agent calls `delegate_task` with a title and one task
- **THEN** the call returns a child id at once, and the child appears as a working team member with that task as its plan

#### Scenario: Wider preset requested
- **WHEN** an agent passes a `presetId` that grants functions its own preset denies
- **THEN** the child still cannot call the functions the parent's preset denies

### Requirement: Child-only task finish
The system SHALL provide a native tool `finish_task`, advertised and executable only for an agent created by delegation. It MUST fail while any task of the child's plan is not done. On success it MUST store the result and deliver the summary and result to the parent once; a repeated call after success MUST NOT deliver again.

#### Scenario: Finish a completed delegation
- **WHEN** a delegated child with all tasks done calls `finish_task` with a summary and result
- **THEN** the parent receives the summary and result once and the child is reported ready

#### Scenario: Unfinished plan
- **WHEN** a delegated child with a pending task calls `finish_task`
- **THEN** the call fails and nothing is delivered to the parent

#### Scenario: Not a delegated child
- **WHEN** an agent that was not created by delegation looks for `finish_task`
- **THEN** the tool is not in its tool list and a direct call is rejected

### Requirement: Typed finish result
`finish_task` SHALL accept a non-empty `summary` and a required `result` that is a JSON object. Arrays, scalars, `null` and JSON-encoded strings MUST be rejected without delivery; a scalar is passed wrapped, for example `{ value: 7 }`.

#### Scenario: Result passed as an encoded string
- **WHEN** a delegated child with all tasks done calls `finish_task` with `result` set to the string `"{\"count\": 7}"`
- **THEN** the call fails and nothing is delivered to the parent

### Requirement: Trusted agent binding
Every tool in this capability SHALL act on the invoking agent taken from the trusted invocation. Arguments MUST NOT select another agent, parent or owner; such arguments and any other unknown arguments MUST be rejected. A missing trusted invocation context MUST fail instead of falling back to any current agent.

#### Scenario: Attempt to target another agent
- **WHEN** an agent passes `agent` or `agentId` to `plan_done`
- **THEN** the call is rejected as an unknown argument and no plan changes

### Requirement: Preset gating
Each tool SHALL be advertised and executable only when the invoking agent's preset allows both the tool adapter and the runtime function it uses. Denying the adapter MUST leave the runtime function reachable through evaluation when the preset allows it.

#### Scenario: Adapter denied
- **WHEN** an agent's preset denies the `plan_update` adapter but allows the plan function
- **THEN** `plan_update` is absent from its tool list and the plan function still works through evaluation
