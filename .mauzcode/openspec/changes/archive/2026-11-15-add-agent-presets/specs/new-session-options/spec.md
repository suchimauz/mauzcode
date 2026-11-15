## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Removed new-session fields
The new-session UI SHALL NOT offer a read-only project workspace field, a custom local directory picker, a "create directory" option or its help text, prompt presets, or additional system instructions. A submit from the new-session UI MUST NOT send a custom workspace directory, a directory-creation flag, prompt presets or additional system instructions. Prompt presets are unrelated to agent presets, which are selected through the agent preset chip.

#### Scenario: Options content
- **WHEN** the options popover is open
- **THEN** it shows no workspace, directory, prompt-preset or system-instructions controls

#### Scenario: Submitted fields
- **WHEN** the person submits the first message
- **THEN** the request carries the selected project, model, effort, mascot, agent preset, text, attachments and optional title only

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
