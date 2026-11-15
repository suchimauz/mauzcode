## ADDED Requirements

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
