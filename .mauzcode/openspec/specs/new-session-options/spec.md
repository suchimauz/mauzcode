# new-session-options Specification

## Purpose
Define the options surface of the new-session composer: a Russian "Параметры" chip with a title popover, the fields removed from the new-session screen, and the removal of prompt presets from session creation.

## Requirements

### Requirement: Options chip and popover
The new-session composer SHALL show a "Параметры" chip in its chip row, next to the Workspace chip, instead of an expandable "Advanced options" section. Activating the chip SHALL open a popover anchored to the chip that contains exactly one field, "Название".

#### Scenario: Open the options popover
- **WHEN** the person activates the "Параметры" chip
- **THEN** a popover opens next to the chip with a single "Название" field

### Requirement: Session title field
The "Название" field SHALL set the new session's title, accept at most 120 characters and show the placeholder "Без названия". When the title is not empty, the chip SHALL show it, truncated to fit, instead of "Параметры".

#### Scenario: Title shown on the chip
- **WHEN** the person types "Ревью API" into "Название"
- **THEN** the chip shows "Ревью API"
- **AND** the session created by the first submit has the title "Ревью API"

#### Scenario: Title length limit
- **WHEN** the person enters more than 120 characters
- **THEN** the field keeps only the first 120 characters

#### Scenario: Empty title
- **WHEN** the title is empty
- **THEN** the chip shows "Параметры" and the session is created without a title

### Requirement: Options are locked while sending
The options chip SHALL be disabled while the first message is being sent or is waiting to be confirmed. A disabled chip MUST NOT open the popover.

#### Scenario: Busy composer
- **WHEN** the first submit is in progress or pending confirmation
- **THEN** the "Параметры" chip is disabled and the title cannot be changed

### Requirement: Removed new-session fields
The new-session UI SHALL NOT offer a read-only project workspace field, a custom local directory picker, a "create directory" option or its help text, prompt presets, or additional system instructions. A submit from the new-session UI MUST NOT send a custom workspace directory, a directory-creation flag, prompt presets or additional system instructions. Prompt presets are unrelated to agent presets, which are selected through the agent preset chip.

#### Scenario: Options content
- **WHEN** the options popover is open
- **THEN** it shows no workspace, directory, prompt-preset or system-instructions controls

#### Scenario: Submitted fields
- **WHEN** the person submits the first message
- **THEN** the request carries the selected project, model, effort, mascot, agent preset, text, attachments and optional title only

### Requirement: Prompt presets removed from session creation
The system SHALL NOT provide prompt presets for session creation. The new-session defaults response MUST NOT contain a `promptPresets` field. The new-session submit endpoint MUST reject a request containing `promptPreset` with HTTP 400, as it does for any unknown field. Agent creation MUST NOT accept or apply prompt preset identifiers.

#### Scenario: Defaults without presets
- **WHEN** an authenticated client requests the new-session defaults
- **THEN** the response has no `promptPresets` field

#### Scenario: Submit with a preset
- **WHEN** a client posts a new-session request that includes `promptPreset`
- **THEN** the server answers HTTP 400 and creates no session

### Requirement: New-session bridge accepts only UI fields
The new-session submit endpoint SHALL accept only `requestKey`, `projectId`, `model`, `effort`, `mascot`, `presetId`, `text`, `title` and attached files. A request containing `workspaceDir`, `createWorkspaceDir` or `systemPrompt` MUST be rejected with HTTP 400 and MUST NOT create a session. The public agent API keeps these fields.

#### Scenario: Submit with a custom directory
- **WHEN** a client posts a new-session request that includes `workspaceDir`
- **THEN** the server answers HTTP 400 and creates no session

### Requirement: New-session agent preset selection
A new-session request whose `presetId` names no existing agent preset MUST be rejected with HTTP 400 and MUST NOT create a session. A request without `presetId` SHALL use the default preset.

#### Scenario: Submit with an unknown preset
- **WHEN** a client posts a new-session request with `presetId: "nope"`
- **THEN** the server answers HTTP 400 and creates no session

#### Scenario: Submit without a preset
- **WHEN** a client posts a valid new-session request without `presetId`
- **THEN** the created session uses the default preset

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

### Requirement: Accessible options popover
The options chip SHALL be reachable with the keyboard and SHALL have an accessible name. Enter or Space on the focused chip SHALL open the popover and move focus to the "Название" field. Escape SHALL close the popover and return focus to the chip. Opening and closing MUST respect the reduced-motion preference, and the popover MUST follow the active theme.

#### Scenario: Keyboard flow
- **WHEN** the person focuses the chip, presses Enter, types a title and presses Escape
- **THEN** the title is kept and focus is back on the chip

#### Scenario: Enter in the title field
- **WHEN** the "Название" field has focus and the person presses Enter
- **THEN** the popover closes, the title is kept and focus returns to the chip
- **AND** the first message is not sent

#### Scenario: Reduced motion
- **WHEN** the system requests reduced motion
- **THEN** the popover opens and closes without animation

### Requirement: Agent preset selector
The new-session composer SHALL show an agent preset chip in its chip row. The chip SHALL show the selected preset's name. Activating the chip SHALL open the agent preset dialog. The initial selection SHALL be the configured default preset.

#### Scenario: Default selection
- **WHEN** the composer opens and the default preset is Standard
- **THEN** the preset chip shows "Standard"

#### Scenario: Pick a preset
- **WHEN** the person activates the preset chip, picks "Creator" in the dialog and confirms
- **THEN** the dialog closes and the chip shows "Creator"
- **AND** the session created by the first submit uses the Creator preset

### Requirement: Preset selector is locked while sending
The preset chip SHALL be disabled while the first message is being sent or is waiting to be confirmed.

#### Scenario: Busy composer
- **WHEN** the first submit is in progress or pending confirmation
- **THEN** the preset chip is disabled and the selection cannot be changed

### Requirement: Accessible preset selector
The preset chip and the agent preset dialog SHALL be reachable with the keyboard, have accessible names, follow the active theme and respect the reduced-motion preference. The dialog SHALL be announced as a modal dialog. Its list SHALL expose the selected option, and focus SHALL stay inside the dialog while it is open.

#### Scenario: Keyboard flow
- **WHEN** the person focuses the preset chip, presses Enter, moves to "Minimal" with the arrow keys and presses Enter
- **THEN** the dialog closes, the chip shows "Minimal" and focus returns to the chip

### Requirement: New-session defaults list agent presets
The new-session defaults response SHALL contain the available agent presets with their identifier, name, description and sort order, and the identifier of the default preset. It MUST NOT expose preset access patterns, plugin grants or prompt additions.

#### Scenario: Defaults response
- **WHEN** an authenticated client requests the new-session defaults
- **THEN** the response lists `standard`, `creator` and `minimal` with names and descriptions and names `standard` as the default

### Requirement: Saved drafts keep a valid preset
A saved new-session draft SHALL remember the selected preset. When the stored preset no longer exists, the composer SHALL select the default preset instead and MUST NOT fail.

#### Scenario: Draft with a deleted preset
- **WHEN** the composer restores a draft whose preset was deleted
- **THEN** the composer opens with the default preset selected

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

### Requirement: Preset dialog opens when a session starts
When the new-session screen shows a fresh draft, the composer SHALL immediately open the agent preset dialog with the default preset selected. It MUST NOT open automatically when any of the following applies: the draft already has a confirmed preset choice, a first message is being sent or awaits confirmation, the preset catalogue failed to load, or the catalogue contains fewer than two presets. After the dialog closes, focus SHALL move to the message input.

#### Scenario: Fresh session
- **WHEN** the person opens a new session and the default preset is Standard
- **THEN** the agent preset dialog is open with "Standard" selected and marked as default

#### Scenario: Keep the default with Enter
- **WHEN** the dialog opened automatically and the person presses Enter
- **THEN** the dialog closes, the chip shows "Standard" and focus is in the message input

#### Scenario: Restored draft with a confirmed preset
- **WHEN** the person returns to a draft where "Creator" was already confirmed
- **THEN** the dialog does not open and the chip shows "Creator"

#### Scenario: Catalogue unavailable
- **WHEN** the preset catalogue fails to load
- **THEN** no dialog opens and the server applies its default preset on submit

### Requirement: Preset dialog content
The agent preset dialog SHALL be titled "Режим агента" and list all available presets in sort order, each with its name and description, with the configured default marked "по умолчанию". A search field SHALL filter the list by name and description, and the dialog SHALL show "Ничего не найдено" when nothing matches.

#### Scenario: Many presets
- **WHEN** ten presets exist
- **THEN** all ten are reachable by scrolling the list or by typing in the search field

#### Scenario: Search
- **WHEN** the person types "red"
- **THEN** only presets whose name or description contains "red" are listed. Filtering SHALL preserve the selected preset, not select the first match.

#### Scenario: Filter hides the selected preset
- **WHEN** Standard is selected and the search hides it, including when there are no matches
- **THEN** Enter does nothing and "Продолжить" is disabled until the person selects a visible result or changes the filter so Standard is visible again
- **AND** clearing the search without selecting another preset shows Standard still selected

### Requirement: Preset dialog controls
In the agent preset dialog ↑/↓ SHALL move the selection within the visible list and clicking a row SHALL select it. Only when the selected preset is visible, Enter or "Продолжить" SHALL confirm the selection and mark the draft's preset as confirmed. Esc and clicking outside SHALL close the dialog and restore the selection that was active when it opened.

#### Scenario: Confirm with Enter
- **WHEN** the person moves to "Minimal" with ↓ and presses Enter
- **THEN** the dialog closes and the chip shows "Minimal"

#### Scenario: Cancel keeps the previous choice
- **WHEN** the chip shows "Creator", the person opens the dialog, moves to "Minimal" and presses Esc
- **THEN** the dialog closes and the chip still shows "Creator"

### Requirement: Preset dialog on narrow screens
On viewports 560px wide or narrower, the agent preset dialog SHALL appear as a bottom sheet spanning the full width, no taller than 85% of the viewport. It SHALL respect the bottom safe-area inset. Rows, the search field and the "Продолжить" button SHALL be at least 44px tall, and keyboard hints SHALL be hidden.

#### Scenario: Phone layout
- **WHEN** a new session starts on a 390px-wide viewport
- **THEN** the dialog is a bottom sheet with a full-width "Продолжить" button and no keyboard hints
