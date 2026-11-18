## Purpose
Let agents keep their todo list and delegate work to child agents through typed native tools bound to the invoking agent, with the same validation, ownership and result rules as the runtime todo and delegation functions. Replaces the former `native-plan-delegation` capability.

## ADDED Requirements

### Requirement: Native todo update
The system SHALL provide a native tool `todo_update` that accepts an optional `title` and an ordered, non-empty `tasks` list of `{ id, title, instructions?, status? }` (each entry is one todo; the argument keeps the name `tasks`), and sets the invoking agent's todo list. With no todos, the first todo MUST become active. With todos, kept ids MUST keep their state and new ids MUST start pending. Invalid ids, titles or statuses MUST be rejected without changing the list.

#### Scenario: Create todos
- **WHEN** an agent without todos calls `todo_update` with todos a, b, c
- **THEN** its todo list shows three todos, a is active and b, c are pending, and the result reports `active: ["a"]`

#### Scenario: Revise todos
- **WHEN** an agent whose todo a is done calls `todo_update` with todos a, b2
- **THEN** a stays done and b2 is added

#### Scenario: Duplicate ids
- **WHEN** an agent calls `todo_update` with two todos that share an id
- **THEN** the call fails with a validation error and the todo list is unchanged

### Requirement: Native todo update result
`todo_update` SHALL return the list title, every todo with its status and the ids of all active todos as a list (`active: string[]`), never a single id or `null`.

#### Scenario: Several active todos in the result
- **WHEN** an agent with active a and b calls `todo_update` with a, b, c
- **THEN** the result reports `active: ["a", "b"]` and c is pending

### Requirement: Native parallel start
`todo_update` SHALL accept `status: "active"` on an entry of `tasks` to start a pending or new todo in parallel with the todos already active; on an already active todo it MUST change nothing. Any other `status` value MUST be rejected, and active or done todos MUST NOT be moved back to pending through this argument. The started todo MUST be placed before every remaining pending todo in the same call; otherwise the call MUST fail without changes.

#### Scenario: Start a todo in parallel
- **WHEN** an agent with active todo a calls `todo_update` with a and b where b has `status: "active"`
- **THEN** both a and b are active and the result reports `active: ["a", "b"]`

#### Scenario: Started todo after a pending todo
- **WHEN** an agent with active a and pending b calls `todo_update` with a, b, c where c has `status: "active"`
- **THEN** the call fails because pending b would precede active c, and the todo list is unchanged

#### Scenario: Started todo after a pending todo on creation
- **WHEN** an agent without todos calls `todo_update` with a, b, c where c has `status: "active"`
- **THEN** the call fails and the agent still has no todo list

#### Scenario: Unsupported status
- **WHEN** an agent calls `todo_update` with an entry whose `status` is `"done"`
- **THEN** the call fails and the todo list is unchanged

### Requirement: Native todo completion
The system SHALL provide a native tool `todo_done` that accepts a todo `id`, marks that active todo of the invoking agent done, and returns the progress, the remaining active todos and the next activated todo, if any. Completing an already done todo MUST be idempotent. Completing a pending or unknown todo MUST fail without changing the list. Active todos cannot be returned to pending; the only way to end an active todo is to complete it or remove the list.

#### Scenario: Complete the only active todo
- **WHEN** an agent calls `todo_done` with the id of its only active todo
- **THEN** the todo is done and the next pending todo becomes active and is returned

#### Scenario: Complete a pending todo
- **WHEN** an agent calls `todo_done` with the id of a pending todo
- **THEN** the call fails and the todo list is unchanged

### Requirement: Old tool names
After the change the tools `plan_update` and `plan_done` SHALL NOT exist. A call to either name MUST fail as an unknown tool, and the error MUST list the available tools so the agent can switch to `todo_update` or `todo_done`.

#### Scenario: Agent repeats an old tool name from history
- **WHEN** an agent whose transcript contains earlier `plan_update` calls calls `plan_update` again
- **THEN** the call fails as an unknown tool, the error lists `todo_update`, and no todo changes

### Requirement: Native delegation
The system SHALL provide a native tool `delegate_task` that accepts a `title`, an ordered non-empty `tasks` list in the todo format and an optional `presetId`, creates a child of the invoking agent whose todo list is created from `tasks` and runs it asynchronously, and returns the child id with a working status immediately. The child's preset MUST NOT grant more than the invoking agent's preset. The tool MUST NOT wait for the child.

#### Scenario: Delegate work
- **WHEN** an agent calls `delegate_task` with a title and one entry in `tasks`
- **THEN** the call returns a child id at once, and the child appears as a working team member with that entry as its only todo

#### Scenario: Wider preset requested
- **WHEN** an agent passes a `presetId` that grants functions its own preset denies
- **THEN** the child still cannot call the functions the parent's preset denies

### Requirement: Child-only task finish
The system SHALL provide a native tool `finish_task`, advertised and executable only for an agent created by delegation. It MUST fail while any todo of the child is not done. On success it MUST store the result and deliver the summary and result to the parent once; a repeated call after success MUST NOT deliver again.

#### Scenario: Finish a completed delegation
- **WHEN** a delegated child with all todos done calls `finish_task` with a summary and result
- **THEN** the parent receives the summary and result once and the child is reported ready

#### Scenario: Unfinished todos
- **WHEN** a delegated child with a pending todo calls `finish_task`
- **THEN** the call fails and nothing is delivered to the parent

#### Scenario: Not a delegated child
- **WHEN** an agent that was not created by delegation looks for `finish_task`
- **THEN** the tool is not in its tool list and a direct call is rejected

### Requirement: Typed finish result
`finish_task` SHALL accept a non-empty `summary` and a required `result` that is a JSON object. Arrays, scalars, `null` and JSON-encoded strings MUST be rejected without delivery; a scalar is passed wrapped, for example `{ value: 7 }`.

#### Scenario: Result passed as an encoded string
- **WHEN** a delegated child with all todos done calls `finish_task` with `result` set to the string `"{\"count\": 7}"`
- **THEN** the call fails and nothing is delivered to the parent

### Requirement: Trusted agent binding
Every tool in this capability SHALL act on the invoking agent taken from the trusted invocation. Arguments MUST NOT select another agent, parent or owner; such arguments and any other unknown arguments MUST be rejected. A missing trusted invocation context MUST fail instead of falling back to any current agent.

#### Scenario: Attempt to target another agent
- **WHEN** an agent passes `agent` or `agentId` to `todo_done`
- **THEN** the call is rejected as an unknown argument and no todo changes

### Requirement: Preset gating
Each tool SHALL be advertised and executable only when the invoking agent's preset allows both the tool adapter and the runtime function it uses. Denying the adapter MUST leave the runtime function reachable through evaluation when the preset allows it.

#### Scenario: Adapter denied
- **WHEN** an agent's preset denies the `todo_update` adapter but allows the todo function
- **THEN** `todo_update` is absent from its tool list and the todo function still works through evaluation
