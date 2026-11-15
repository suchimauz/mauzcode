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
The new-session submit endpoint SHALL accept only `requestKey`, `projectId`, `model`, `effort`, `mascot`, `presetId`, `text`, `title` and attached files. A request containing `workspaceDir`, `createWorkspaceDir` or `systemPrompt` MUST be rejected with HTTP 400 and MUST NOT create a session. A request whose `presetId` names no existing agent preset MUST be rejected with HTTP 400 and MUST NOT create a session. A request without `presetId` SHALL use the default preset. The public agent API keeps these fields.

#### Scenario: Submit with a custom directory
- **WHEN** a client posts a new-session request that includes `workspaceDir`
- **THEN** the server answers HTTP 400 and creates no session

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
The new-session composer SHALL show an agent preset chip in its chip row in place of the static "Standard mode" label. The chip SHALL show the selected preset's name and open a menu of available presets in sort order, each with its description. The initial selection SHALL be the configured default preset.

#### Scenario: Default selection
- **WHEN** the composer opens and the default preset is Standard
- **THEN** the preset chip shows "Standard"

#### Scenario: Pick a preset
- **WHEN** the person opens the preset menu and picks "Creator"
- **THEN** the chip shows "Creator"
- **AND** the session created by the first submit uses the Creator preset

### Requirement: Preset selector is locked while sending
The preset chip SHALL be disabled while the first message is being sent or is waiting to be confirmed.

#### Scenario: Busy composer
- **WHEN** the first submit is in progress or pending confirmation
- **THEN** the preset chip is disabled and the selection cannot be changed

### Requirement: Accessible preset selector
The preset chip SHALL be reachable with the keyboard, have an accessible name, follow the active theme and respect the reduced-motion preference.

#### Scenario: Keyboard flow
- **WHEN** the person focuses the preset chip, presses Enter, moves to "Minimal" with the arrow keys and presses Enter
- **THEN** the menu closes, the chip shows "Minimal" and focus returns to the chip

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
