# chat-todo-dock Specification

## Purpose
Show the agent's current todos in a compact, read-only dock directly above the chat message input, so the person sees what the agent is working on and its progress without opening the Meta tab.

## Requirements

### Requirement: Dock visibility
The chat SHALL show a todo dock above the message input when the open agent has a todo list with at least one todo that is not done. The dock MUST be hidden when the agent has no todo list or every todo is done.

#### Scenario: All todos done
- **WHEN** the agent completes its last todo
- **THEN** the dock disappears

#### Scenario: No todos
- **WHEN** the person opens a chat whose agent has no todo list
- **THEN** no dock is shown

### Requirement: Collapsed dock
By default the dock SHALL be collapsed to one row that shows the title of the active todo, or the number of active todos when several are active, and the progress as done/total. When the list is paused the row MUST say so.

#### Scenario: One active todo
- **WHEN** the agent has 5 todos, 2 done and "Write tests" active
- **THEN** the collapsed dock shows "Write tests" and 2/5

#### Scenario: Several active todos
- **WHEN** the agent has two active todos
- **THEN** the collapsed dock shows that 2 todos are in progress

### Requirement: Expanded dock
Activating the collapsed row SHALL expand the dock into the full ordered list, with a distinct marker for pending, active and done todos and the list title when present. A todo's instructions MUST be available as a disclosure inside its row. Activating the header again MUST collapse the dock. The control MUST be keyboard accessible and expose its expanded state.

#### Scenario: Expand
- **WHEN** the person activates the collapsed dock
- **THEN** every todo is listed with its status marker and the dock reports itself as expanded

### Requirement: Read-only dock
The dock SHALL NOT offer controls to add, edit, reorder, start, complete or delete todos.

#### Scenario: No edit controls
- **WHEN** the person expands the dock
- **THEN** no control changes the todo list

### Requirement: Live dock refresh
The dock SHALL refresh when it receives a live `todos` or `all` metadata notification for the open agent and after the live connection recovers, without periodic polling. It MUST NOT refetch on `team` notifications, which describe the agent's children rather than its own todos. A read failure MUST NOT break the composer.

#### Scenario: Agent completes a todo
- **WHEN** the agent completes a todo while the chat is open
- **THEN** the dock shows the new progress without reloading the page

#### Scenario: Child completes a todo
- **WHEN** a delegated child of the open agent completes a todo
- **THEN** the parent's dock does not refetch

### Requirement: No todo panel in Meta
The Meta tab SHALL NOT show a todo section (the former "Plan" section is removed); the dock is the only todo view in the chat. The dock MUST show only the open agent's own todos. A person sees a delegated child's todos in the dock of the child's own chat, opened from the parent's subagents list in the chat header; agents read them through the `todos` field of `agent.team` members.

#### Scenario: Open Meta
- **WHEN** the person opens the Meta tab of an agent with todos
- **THEN** the Meta tab has no todo section

#### Scenario: Parent with a working child
- **WHEN** the person opens the chat of a parent whose delegated child has todos
- **THEN** the parent's dock shows only the parent's own todos, and opening the child from the subagents list shows the child's todos in its dock
