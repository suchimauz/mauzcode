# chat-goal-removal Specification

## Purpose
Let the chat user remove the displayed persistent goal without stopping the agent or deleting the conversation history.

## Requirements

### Requirement: Confirm removal of a specific goal
The web chat SHALL offer a labelled removal action for an existing persistent goal, require explicit confirmation identifying that goal, and never remove a goal merely by opening or dismissing the confirmation.

#### Scenario: Confirm while idle
- **WHEN** the user confirms removal of the displayed idle agent's unchanged goal and the server accepts it
- **THEN** the panel shows no current goal, a new goal can be created, and previous chat events remain available

#### Scenario: Cancel
- **WHEN** the user dismisses the confirmation
- **THEN** no mutation is submitted and the goal remains unchanged

### Requirement: Respect server removal guards
The chat SHALL restrict removal to the confirmed agent and goal revision and SHALL NOT silently retry a rejected or uncertain request.

#### Scenario: Owner running
- **WHEN** the displayed goal owner is running
- **THEN** the removal control is unavailable with an explanation, and the chat does not stop the agent

#### Scenario: Snapshot no longer valid
- **WHEN** the goal changes during confirmation or the server rejects removal because the goal or owner state changed
- **THEN** the chat does not report successful removal, shows the updated state or a refreshable error, and requires new confirmation before another attempt
