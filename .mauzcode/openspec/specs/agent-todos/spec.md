# agent-todos Specification

## Purpose
Keep a durable, visible list of todos for each agent — the concrete steps it is working on — with stable ids, statuses, timing, parallel active work, pause and resume, live change notification and a read endpoint, kept distinct from planning mode.

## Requirements

### Requirement: Todo list model
Each agent SHALL have at most one todo list with an optional title, an ordered non-empty list of todos and a paused flag. Each todo MUST have a stable id (1–120 characters, unique in the list), a title (1–300 characters), optional instructions (up to 12,000 characters) and a status of `pending`, `active` or `done`. Invalid input MUST be rejected without changing the stored list.

#### Scenario: Invalid todo
- **WHEN** a todo list is set with two todos that share an id
- **THEN** the call fails with a validation error naming the todo and the stored list is unchanged

### Requirement: Create todo list
Creating a todo list for an agent without one SHALL store the todos in the given order, make the first todo active, make any other todo that requests `status: "active"` active as well, leave the rest pending, and start timing every active todo. Every active todo MUST precede every pending todo; a list that would place a pending todo before an active one MUST be rejected without creating the list.

#### Scenario: Create
- **WHEN** an agent without todos creates todos a, b, c
- **THEN** a is active and b, c are pending

#### Scenario: Create with a started todo after a pending one
- **WHEN** an agent without todos creates todos a, b, c where c has `status: "active"`
- **THEN** the call fails because pending b would precede active c, and the agent still has no todo list

### Requirement: Replace on create
Creating a todo list for an agent that already has one SHALL replace the existing list without archiving it; agents revise an existing list through `todo.update`. Creation MUST support deferred publication for an unpublished child inside the caller's transaction (`deferPublication`).

#### Scenario: Create over an existing list
- **WHEN** `todo.create` is called for an agent that already has todos x, y
- **THEN** the agent's list is the new one and its todo history is unchanged

### Requirement: Revise todo list
Revising an existing list SHALL keep the status and timing of todos whose ids are kept, add new ids as pending and update titles and instructions. The result MUST list the ids of all active todos (`active: string[]`). Active and done todos MUST NOT be removed or reordered, and pending todos MUST follow all active and done todos. When no todo is active after the revision, the first pending todo MUST become active.

#### Scenario: Revise keeps progress
- **WHEN** an agent whose todo a is done revises its list to a, b2
- **THEN** a stays done and b2 becomes active

#### Scenario: Remove a done todo
- **WHEN** an agent revises its list without its done todo a
- **THEN** the call fails and the list is unchanged

### Requirement: Parallel active todos
A revision SHALL accept a request (`status: "active"`) to start a todo that is pending or new, making it active in addition to the todos already active. The same request on an already active todo MUST change nothing, and any other status value MUST be rejected without changes. Several todos MAY be active at once, and each active todo MUST be timed independently.

#### Scenario: Start a second todo
- **WHEN** todo a is active and the agent revises its list asking to start pending todo b
- **THEN** both a and b are active and the result reports `active: ["a", "b"]`

### Requirement: Active todo order and lifetime
A started todo SHALL be placed before every remaining pending todo, because pending todos must follow active and done todos; otherwise the revision MUST fail without changes. An active todo MUST NOT return to pending: it ends only by completion or by removing the list.

#### Scenario: Return an active todo to pending
- **WHEN** todos a and b are active and the agent revises its list with `status: "pending"` on b
- **THEN** the call fails and both a and b stay active

### Requirement: Complete a todo
Completing an active todo SHALL mark it done, record its elapsed time and return the progress (done and total counts), the remaining active todos and whether the list is complete. When no todo remains active, the first pending todo MUST become active and be returned. Completing a done todo MUST be idempotent; completing a pending or unknown todo MUST fail without changes.

#### Scenario: Complete one of two active todos
- **WHEN** todos a and b are active, c is pending, and the agent completes a
- **THEN** a is done, b stays active and c stays pending

#### Scenario: Complete the last active todo
- **WHEN** only a is active, b is pending, and the agent completes a
- **THEN** a is done and b becomes active and is returned

#### Scenario: Complete a pending todo
- **WHEN** the agent completes a pending todo
- **THEN** the call fails and the list is unchanged

### Requirement: Todo completion hook
After a todo becomes done for the first time, the system SHALL announce a `todo.taskDone` extension point with the agent id, todo id, todo title, elapsed time, whether the list is complete, the id of the todo auto-activated by this completion (`next`, or `null`) and the ids of all todos active after the completion (`active: string[]`). Handler failures or delays MUST NOT affect the completion result.

#### Scenario: Failing handler
- **WHEN** a `todo.taskDone` handler throws
- **THEN** the todo is still done and the completion call succeeds

### Requirement: Pause and resume todos
Stopping an agent run, including a context-guard stop, SHALL pause its todo list and stop timing every active todo. Resuming the agent through a new user message, a retry or a team resume MUST clear the pause and restart timing for every active todo. Pausing and resuming MUST be idempotent and MUST NOT be offered to agents by the Standard preset.

#### Scenario: Stop with two active todos
- **WHEN** an agent with active todos a and b is stopped
- **THEN** the list is paused and neither a nor b accumulates time until the agent resumes

### Requirement: Paused list blocks scheduling
While an agent's todo list is paused, no background path SHALL schedule the agent: inbound agent messages and input answers (single, batch and completion) MUST read the pause from the agent's `todos` state.

#### Scenario: Input answered while paused
- **WHEN** a stopped agent with a paused todo list receives an answer to an input it opened
- **THEN** the answer is recorded and the agent is not scheduled to run

### Requirement: Remove todo list
Removing a todo list SHALL delete it from the agent. By default the removed list MUST be archived to the agent's todo history (newest first, at most 20 entries) with the active todos' time settled; an explicit delete MUST NOT archive it.

#### Scenario: Archive on removal
- **WHEN** an agent's todo list is removed without the delete option
- **THEN** the agent has no todo list and its history starts with the removed list

### Requirement: Live todo notification
Every change to an agent's todo list SHALL emit a live metadata notification for that agent with section `todos`. A change to a delegated child's todos MUST also notify the parent with section `team`.

#### Scenario: Child completes a todo
- **WHEN** a delegated child completes a todo
- **THEN** subscribers receive a `todos` notification for the child and a `team` notification for the parent

### Requirement: Todo read endpoint
The system SHALL provide `GET /agent/:id/todos` that returns `{ todos }` with the agent's current list (title, paused flag and todos with id, title, instructions and status) or `null` when the agent has none, with `Cache-Control: no-store`. It MUST apply the same checks as the persistent-goal read: 401 without an authenticated user session, 404 for an unknown or archived agent, and 403 when the agent belongs to another user. Timing internals MUST NOT be returned.

#### Scenario: Agent without todos
- **WHEN** a client reads todos of an agent that has none
- **THEN** the response is `{ todos: null }`

#### Scenario: Another user's agent
- **WHEN** an authenticated user reads todos of an agent created by another user
- **THEN** the response is 403 and no todos are returned

#### Scenario: Not signed in
- **WHEN** a request without an authenticated user session reads todos
- **THEN** the response is 401

### Requirement: Todo vocabulary
Agent todo tracking SHALL use the todo vocabulary in tools, runtime functions, stored state, events, prompts and UI. The former plan names (`plan_update`, `plan_done`, `session.plan`, `session.updatePlan`, `session.done`, `session.removePlan`, `session.taskDone`) MUST NOT remain callable. Prompts MUST describe todos as separate from planning mode.

#### Scenario: Old function name
- **WHEN** code calls `session.plan` after the change
- **THEN** the function does not exist

### Requirement: Migration of legacy todo state
On upgrade the system SHALL move every agent's legacy `plan` and `planHistory` scratchpad keys, including archived agents, to `todos` and `todoHistory` without changing ids, statuses, timing or pause state. The two keys MUST be moved independently, only when present, and MUST NOT overwrite an existing `todos` or `todoHistory`; no empty or null todo keys MAY be created. Running the migration again MUST change nothing.

#### Scenario: Migrate a paused legacy list
- **WHEN** an agent stored a paused legacy `plan` with todo a done and b active before the upgrade
- **THEN** after the upgrade its todo list is paused with a done and b active

#### Scenario: Only a legacy history
- **WHEN** an agent stored `planHistory` but no `plan`
- **THEN** after the upgrade it has a todo history and no todo list

#### Scenario: Run twice
- **WHEN** the migration runs a second time
- **THEN** no agent changes

### Requirement: Boot-only state migration
The legacy todo state migration SHALL run only at boot before agents are loaded into memory and MUST refuse to run otherwise, so that no in-memory agent writes the legacy key back.

#### Scenario: Not at boot
- **WHEN** the migration is invoked while agents are loaded
- **THEN** it fails without changing any row

### Requirement: Migration of todo grants
On upgrade the system SHALL rewrite references to the old plan tools and functions to their todo equivalents in the allow and deny rules of factory presets, user presets and agent preset snapshots. A wildcard rule that covered the old functions MUST also cover the todo functions after the upgrade, both for allow and for deny. Running the migration again MUST change nothing. The prompt section id `plans` MUST stay unchanged so existing section exclusions keep working.

#### Scenario: Denied old function
- **WHEN** a user preset denies `session.removePlan` before the upgrade
- **THEN** after the upgrade it denies `todo.remove`

#### Scenario: Session wildcard
- **WHEN** an agent snapshot allows `session.*` before the upgrade
- **THEN** after the upgrade the agent can still call `todo.create`

### Requirement: Delegation completion event
When a delegated child finishes its whole todo list, the parent SHALL receive a team update with event `todos.completed`, distinct from the per-todo `task.completed` event.

#### Scenario: Child finishes
- **WHEN** a delegated child calls `finish_task` successfully
- **THEN** the parent receives exactly one team update with event `todos.completed`

### Requirement: History of renamed events
Transcript events recorded before the change with type `plan.completed` or message type `plan_activation` SHALL still render in chat history; `plan.completed` MUST render like `todos.completed`, and `plan_activation` MUST keep its existing activation label.

#### Scenario: Old completion event
- **WHEN** a chat history contains a `plan.completed` team update recorded before the change
- **THEN** it renders like a `todos.completed` update
