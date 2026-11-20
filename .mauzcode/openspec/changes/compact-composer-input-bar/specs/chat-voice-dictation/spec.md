## MODIFIED Requirements

### Requirement: Two distinct entry points
An editable open chat SHALL show the voice controls as one group in the input bar, between the model picker and the send button, in this order: voice settings, voice mode, inline voice input. They SHALL be flat icon buttons without a shared background. Each SHALL be independently named and keyboard-accessible. Voice settings SHALL use a settings (gear) icon, and inline voice input SHALL be the visually primary, accent-filled control. Neither entry point SHALL be available on the new-session or read-only composer.

#### Scenario: Discover without activating
- **WHEN** the user navigates the input bar by keyboard or screen reader
- **THEN** both actions are distinguishable, the effective audio destination is discoverable before activation, and no microphone is requested.

#### Scenario: Insecure context or unsupported browser
- **WHEN** the page is opened over plain HTTP from a non-localhost address, or the browser lacks microphone capture or AudioWorklet
- **THEN** both controls are shown disabled with an explanation of what is required, no microphone permission is requested and no voice socket is opened.

#### Scenario: Fixed order and emphasis
- **WHEN** the user tabs through the voice group
- **THEN** focus reaches voice settings, then voice mode, then inline voice input, and only inline voice input has the accent fill.

### Requirement: Dedicated voice panel
Voice mode SHALL keep the ordinary input frame and replace its text with a live transcript and a visible, accessible recording state. While the frame has focus, Space SHALL pause or resume, Enter SHALL request send, and Escape SHALL return to ordinary editing with the visible text. Each operation, including clearing dictation, SHALL have a labeled on-screen control. Shortcuts SHALL NOT capture typing outside the frame and SHALL NOT override native activation of a focused button or text field inside it.

#### Scenario: Pause without leaving
- **WHEN** the user presses Space while listening
- **THEN** capture stops, the current phrase is finalized, and the same draft can be extended by pressing Space again.

#### Scenario: Selectively clear and return
- **WHEN** a user enters with existing text and attachments, dictates, clears dictation, then exits with Escape
- **THEN** only dictation from this draft is removed; manually entered text and attachments remain, capture stops, and focus returns to the editor without sending.

### Requirement: Compact voice panel
The voice mode SHALL be compact. The recording state SHALL be shown by a waveform that animates only while listening, by the pause/resume control, by the remaining-time label and by an accent outline of the input frame, not by a visible state heading; the state SHALL remain exposed to assistive technology. Controls SHALL be icon buttons with accessible names: exit, clear dictation, pause or resume, and send. The add button SHALL stay in place but be disabled.

#### Scenario: Paused state without a heading
- **WHEN** the user pauses capture in voice mode
- **THEN** the waveform stops, the toggle shows the resume icon with the accessible name for resuming, no visible state heading appears, and assistive technology still exposes the paused state as the frame description.

### Requirement: Desktop voice panel layout
On a fine pointer, voice mode SHALL show the transcript in the text area of the input and, in the input bar, the model picker at the left and, at the right, the waveform with remaining time, clear, pause/resume, exit and send. No separate shortcut-hint line SHALL be shown; each control's tooltip SHALL name its shortcut. When no dictated text can be cleared, the clear control SHALL stay visible but disabled, with an explanation.

#### Scenario: Desktop shortcut hints
- **WHEN** voice mode opens with a fine pointer
- **THEN** the input frame keeps its size and position, the transcript replaces the text, the bar shows the model and the voice controls on one line, and the tooltips of pause, send and exit name Space, Enter and Escape.

#### Scenario: Nothing to clear on desktop
- **WHEN** voice mode opens on a desktop before any dictation in this draft
- **THEN** the clear control is visible, announced as disabled, and explains that there is no dictated text.

### Requirement: Mobile voice panel layout
On a coarse pointer, voice mode SHALL use the same input frame: the transcript spans the text area and the input bar holds the model picker reduced to its icon, the waveform with time, clear, pause/resume, exit and send. Every control SHALL have a touch target of at least 44 by 44 CSS pixels, and no shortcut hints SHALL be shown. Pause/resume SHALL use the accent colour while listening and a neutral style when paused or failed. The clear control SHALL be hidden when nothing can be cleared.

#### Scenario: Mobile layout
- **WHEN** voice mode opens on a touch device with a narrow screen
- **THEN** the transcript fills the text area, all bar controls fit on one line of 44 px targets without overlap, no keyboard hints are shown, and the clear control appears only once there is dictated text to clear.

## REMOVED Requirements

### Requirement: Nothing below the voice panel
**Reason**: Voice mode now lives inside the ordinary input frame, and the status row above and the metrics row below stay visible so the layout does not jump when voice mode opens or closes.
**Migration**: See "Composer rows around voice mode" and "Voice errors inside the input".

## ADDED Requirements

### Requirement: Composer rows around voice mode
While voice mode is open, the status row above the input and the metrics row below it SHALL stay visible and unchanged. Transient notices, the separate inline-voice error line and the stop-execution button SHALL NOT be shown below the input; they SHALL reappear after leaving voice mode.

#### Scenario: Rows stay in place
- **WHEN** the user opens voice mode in a chat in planning mode with a running agent and a notice
- **THEN** the planning badge stays above the input, the metrics row stays below it, and the notice and stop-execution button are hidden until voice mode closes.

### Requirement: Voice errors inside the input
Capture errors and send failures in voice mode SHALL be shown in one error line inside the input frame, together with the error ID when present, and SHALL NOT be rendered below the input.

#### Scenario: Error stays inside the input
- **WHEN** the provider disconnects while listening, or an explicit send fails
- **THEN** a single error line with the message and error ID appears inside the input frame, the frame shows the error state, the draft remains, and no error line is rendered below the input.
