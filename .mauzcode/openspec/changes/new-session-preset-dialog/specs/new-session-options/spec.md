## MODIFIED Requirements

### Requirement: Agent preset selector
The new-session composer SHALL show an agent preset chip in its chip row. The chip SHALL show the selected preset's name. Activating the chip SHALL open the agent preset dialog. The initial selection SHALL be the configured default preset.

#### Scenario: Default selection
- **WHEN** the composer opens and the default preset is Standard
- **THEN** the preset chip shows "Standard"

#### Scenario: Pick a preset
- **WHEN** the person activates the preset chip, picks "Creator" in the dialog and confirms
- **THEN** the dialog closes and the chip shows "Creator"
- **AND** the session created by the first submit uses the Creator preset

### Requirement: Accessible preset selector
The preset chip and the agent preset dialog SHALL be reachable with the keyboard, have accessible names, follow the active theme and respect the reduced-motion preference. The dialog SHALL be announced as a modal dialog. Its list SHALL expose the selected option, and focus SHALL stay inside the dialog while it is open.

#### Scenario: Keyboard flow
- **WHEN** the person focuses the preset chip, presses Enter, moves to "Minimal" with the arrow keys and presses Enter
- **THEN** the dialog closes, the chip shows "Minimal" and focus returns to the chip

## ADDED Requirements

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
