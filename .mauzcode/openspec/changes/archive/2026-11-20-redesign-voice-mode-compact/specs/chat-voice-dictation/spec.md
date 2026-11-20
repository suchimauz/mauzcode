## MODIFIED Requirements

### Requirement: Dedicated voice panel
Voice mode SHALL replace the ordinary editor with a live transcript and a visible, accessible recording state. While the panel has focus, Space SHALL pause or resume, Enter SHALL request send, and Escape SHALL return to ordinary editing with the visible text. Each operation, including clearing dictation, SHALL have a labeled on-screen control. Shortcuts SHALL NOT capture typing outside the panel and SHALL NOT override native activation of a focused button or text field inside it.

The panel SHALL be compact. The recording state SHALL be shown by a waveform that animates only while listening, by the pause/resume control and by the remaining-time label, not by a visible state heading; the state SHALL remain exposed to assistive technology. Controls SHALL be icon buttons with accessible names (exit, clear dictation, pause or resume, send).

On a fine pointer with a wide composer (desktop), the panel SHALL be a single row with the waveform, the transcript, the remaining time and the clear, pause/resume, send and exit controls, followed by one line of shortcut hints. On a coarse pointer or a narrow composer (mobile), the transcript SHALL span the full width with the clear control in its top-right corner, followed by one row with exit, the waveform and time, pause/resume and send; every control SHALL have a touch target of at least 44 by 44 CSS pixels and no shortcut hints SHALL be shown. On mobile, the pause/resume control SHALL use the accent colour while listening and a neutral style when paused or failed. The clear control SHALL be hidden on mobile and disabled with an explanation on desktop when no dictated text can be cleared.

While voice mode is open, nothing of the composer SHALL be shown below the panel: no footer, no separate voice error line, no transient notices and no stop-execution button. Capture errors and send failures SHALL be shown in one error line inside the panel, together with the error ID when present.

#### Scenario: Pause without leaving
- **WHEN** the user presses Space while listening
- **THEN** capture stops, the current phrase is finalized, and the same draft can be extended by pressing Space again.

#### Scenario: Selectively clear and return
- **WHEN** a user enters with existing text and attachments, dictates, clears dictation, then exits with Escape
- **THEN** only dictation from this draft is removed; manually entered text and attachments remain, capture stops, and focus returns to the editor without sending.

#### Scenario: Nothing below the panel
- **WHEN** the user opens voice mode in a chat whose composer shows a footer, a notice and a running agent
- **THEN** only the panel (and pending attachments) is visible in the composer area; the footer, notice and stop-execution button reappear after leaving voice mode.

#### Scenario: Error stays inside the panel
- **WHEN** the provider disconnects while listening, or an explicit send fails
- **THEN** a single error line with the message and error ID appears inside the panel, the panel shows the error state, the draft remains, and no error line is rendered below the panel.

#### Scenario: Mobile layout
- **WHEN** voice mode opens on a touch device with a narrow screen
- **THEN** the transcript is full width, the controls fit in one row of 44 px buttons, no keyboard hints are shown, and the clear control appears in the transcript corner only once there is dictated text to clear.

#### Scenario: Desktop shortcut hints
- **WHEN** voice mode opens with a fine pointer and a wide composer
- **THEN** the controls form one row next to the transcript and one line under it names Space, Enter and Escape with their actions.
