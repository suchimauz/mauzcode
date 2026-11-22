# Spec Delta

## ADDED Requirements

### Requirement: Create a session without a first message
The new-session composer SHALL let the person submit an empty draft (blank text, no attachments) once a Workspace is selected and the model is ready. Pressing Enter in the input or activating the send button SHALL create the agent with the chosen Workspace, model, effort, mascot, preset and title, and open its chat with no messages.

#### Scenario: Enter on an empty draft
- **WHEN** the person selects a Workspace, leaves the input empty and presses Enter
- **THEN** a new agent is created and its chat opens
- **AND** the chat contains no messages and no run is started

#### Scenario: Send button on an empty draft
- **WHEN** the input is empty and the person activates the send button
- **THEN** a new agent is created without a message, using the selected title and preset

#### Scenario: Whitespace-only text
- **WHEN** the input contains only spaces or line breaks and the person submits
- **THEN** the session is created without a message

#### Scenario: No Workspace selected
- **WHEN** no Workspace is selected and the input is empty
- **THEN** the send button is disabled and Enter creates nothing

### Requirement: Empty-submit button label
While the new-session input is empty and has no attachments, the send button SHALL have the accessible name "Создать сессию". Otherwise it SHALL keep its ordinary "Отправить сообщение" name.

#### Scenario: Label follows the text
- **WHEN** the input is empty
- **THEN** the send button is named "Создать сессию"
- **AND** after the person types text it is named "Отправить сообщение"

### Requirement: Bridge creates sessions without a message
A new-session request with blank `text` and no files SHALL create and configure the agent and MUST NOT accept any message for it. The response SHALL be HTTP 201 with `status: "created"` and the new `agentId`.

#### Scenario: Empty submission
- **WHEN** a client posts a valid new-session request with `text: ""` and no files
- **THEN** the server answers 201 with `status: "created"` and an `agentId`
- **AND** the agent has no messages

#### Scenario: Retry of an empty submission
- **WHEN** the client repeats the same empty request with the same `requestKey`
- **THEN** the server answers with the same `agentId` and `status: "created"`
- **AND** no second agent is created

### Requirement: Existing chats still reject empty messages
Empty submission SHALL apply only to the new-session composer. The composer of an existing chat MUST NOT send a message that has blank text and no attachments.

#### Scenario: Enter in an existing chat
- **WHEN** the input of an existing chat is empty and the person presses Enter
- **THEN** nothing is sent
