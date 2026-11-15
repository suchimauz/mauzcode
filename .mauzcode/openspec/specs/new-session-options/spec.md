# new-session-options Specification

## Purpose
Define the options surface of the new-session draft: editing the session title in the chat header, the fields removed from the new-session screen, and the removal of prompt presets from session creation.

## Requirements

### Requirement: Options are locked while sending
The draft title SHALL NOT be editable while the first message is being sent or is waiting to be confirmed. During that time the header SHALL show the title of the pending submit.

#### Scenario: Busy composer
- **WHEN** the first submit is in progress or pending confirmation
- **THEN** activating the header title does not open the input and the title cannot be changed

### Requirement: Removed new-session fields
The new-session UI SHALL NOT offer a read-only project workspace field, a custom local directory picker, a "create directory" option or its help text, prompt presets, or additional system instructions. A submit from the new-session UI MUST NOT send a custom workspace directory, a directory-creation flag, prompt presets or additional system instructions.

#### Scenario: Options content
- **WHEN** the options popover is open
- **THEN** it shows no workspace, directory, preset or system-instructions controls

#### Scenario: Submitted fields
- **WHEN** the person submits the first message
- **THEN** the request carries the selected project, model, effort, mascot, text, attachments and optional title only

### Requirement: Prompt presets removed from session creation
The system SHALL NOT provide prompt presets for session creation. The new-session defaults response MUST NOT contain a `promptPresets` field. The new-session submit endpoint MUST reject a request containing `promptPreset` with HTTP 400, as it does for any unknown field. Agent creation MUST NOT accept or apply prompt preset identifiers.

#### Scenario: Defaults without presets
- **WHEN** an authenticated client requests the new-session defaults
- **THEN** the response has no `promptPresets` field

#### Scenario: Submit with a preset
- **WHEN** a client posts a new-session request that includes `promptPreset`
- **THEN** the server answers HTTP 400 and creates no session

### Requirement: New-session bridge accepts only UI fields
The new-session submit endpoint SHALL accept only `requestKey`, `projectId`, `model`, `effort`, `mascot`, `text`, `title` and attached files. A request containing `workspaceDir`, `createWorkspaceDir` or `systemPrompt` MUST be rejected with HTTP 400 and MUST NOT create a session. The public agent API keeps these fields.

#### Scenario: Submit with a custom directory
- **WHEN** a client posts a new-session request that includes `workspaceDir`
- **THEN** the server answers HTTP 400 and creates no session

### Requirement: Legacy creation path removed
The system SHALL NOT provide `POST /agent/new`, `agent.createFromPopup` or `ui.newAgentPopup`. The "new agent" menu entry SHALL open the new-session composer directly. `GET /agent/new` SHALL keep redirecting to the new-session composer without creating a session.

#### Scenario: Menu entry
- **WHEN** the person picks "new agent" in the menu
- **THEN** the new-session composer opens without an intermediate redirect

#### Scenario: Old bookmark
- **WHEN** a browser opens `GET /agent/new?projectId=p`
- **THEN** it is redirected to the new-session composer with project `p` selected and no session is created

### Requirement: Legacy drafts stay usable
A saved new-session draft or pending submit that still contains `promptPreset` or other removed fields SHALL load without an error. The removed fields SHALL be ignored and MUST NOT be sent.

#### Scenario: Restore an old draft
- **WHEN** the composer loads a stored draft with `promptPreset: ["git-safety"]`
- **THEN** the composer opens normally with the rest of the draft
- **AND** a later submit does not include `promptPreset`

#### Scenario: Old pending retry with a custom directory
- **WHEN** the composer finds a pending first-message retry saved with a non-empty `workspaceDir`, `createWorkspaceDir`, `promptPreset` or `systemPrompt`
- **THEN** the retry is not sent
- **AND** its text and title are restored into the ordinary draft, the pending record is cleared and the person can pick a Workspace and send again

### Requirement: Draft title edited in the chat header
The new session's title SHALL be edited by activating the "New Session" title in the chat header, using the same inline input as renaming an existing session. The input SHALL accept at most 120 characters. Enter or moving focus away SHALL keep the value in the local draft, and Escape SHALL restore the previous value. When the trimmed title is empty, the header SHALL show "New Session" and the session SHALL be created without a title.

#### Scenario: Name a draft in the header
- **WHEN** the person clicks "New Session" in the chat header, types "Ревью API" and presses Enter
- **THEN** the header shows "Ревью API"
- **AND** no request is sent and no agent is created
- **AND** the session created by the first message has the title "Ревью API"

#### Scenario: Escape reverts the edit
- **WHEN** the draft title is "Ревью API" and the person opens the header input, types "Другое" and presses Escape
- **THEN** the title stays "Ревью API"

#### Scenario: Title length limit
- **WHEN** the person enters more than 120 characters
- **THEN** the input keeps only the first 120 characters

#### Scenario: Clear the title
- **WHEN** the person removes the whole title and presses Enter
- **THEN** the header shows "New Session"
- **AND** the session is created without a title

### Requirement: Draft title stays local until the first message
Editing the draft title MUST NOT send any request and MUST NOT create an agent. The title SHALL be sent only with the first message.

#### Scenario: No agent before sending
- **WHEN** the person sets the draft title and does not send a message
- **THEN** no request is sent and no agent is created

### Requirement: Accessible header title editing
The draft title in the header SHALL be reachable with the keyboard, have an accessible name and follow the active theme. Enter or Space on the focused title SHALL open the input.

#### Scenario: Keyboard flow
- **WHEN** the person focuses the header title, presses Enter, types a title and presses Enter
- **THEN** the title is kept, focus returns to the header title and the first message is not sent

### Requirement: Draft title shown in draft labels
The chat header, the composer footer label and the sidebar draft row (in tree and flat views) SHALL show the trimmed draft title, or "New Session" when it is empty. The composer SHALL NOT show a "Параметры" chip.

#### Scenario: Title in every label
- **WHEN** the draft title is "Ревью API"
- **THEN** the header, the composer footer and the sidebar draft row show "Ревью API"
- **AND** no "Параметры" chip is shown

#### Scenario: Empty title in every label
- **WHEN** the draft title is empty
- **THEN** the header, the composer footer and the sidebar draft row show "New Session"

### Requirement: Draft title is forgotten after leaving the draft
When the person leaves the draft by opening an existing chat or a page and then presses New Session, the new draft SHALL start with an empty title. Other draft fields (text, files, mascot, Workspace, model) SHALL keep their current behaviour. Pressing New Session while the draft is already shown, or reloading the page, SHALL keep the title. A `?newSession=1&title=…` link SHALL still pre-fill the title.

#### Scenario: Leave and come back
- **WHEN** the draft title is "Ревью API", the person opens an existing chat and then presses New Session
- **THEN** the header shows "New Session"
- **AND** the typed draft text is kept as today

#### Scenario: New Session on the draft
- **WHEN** the draft title is "Ревью API" and the person presses New Session while the draft is shown
- **THEN** the title stays "Ревью API"

#### Scenario: Reload keeps the title
- **WHEN** the draft title is "Ревью API" and the page is reloaded
- **THEN** the header shows "Ревью API"

#### Scenario: Title from a link
- **WHEN** the app opens with `?newSession=1&title=Ревью`
- **THEN** the draft title is "Ревью"
