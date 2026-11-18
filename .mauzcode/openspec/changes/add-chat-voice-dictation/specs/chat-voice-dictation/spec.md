## Purpose

Let users dictate and revise a draft in an existing chat without sending speech or intermediate text to the agent.

## ADDED Requirements

### Requirement: Two distinct entry points
An editable open chat SHALL show two independently named, keyboard-accessible controls immediately to the right of the composer footer's context indicator: inline voice input and voice mode. Neither entry point SHALL be available on the new-session or read-only composer.

#### Scenario: Discover without activating
- **WHEN** the user navigates the footer by keyboard or screen reader
- **THEN** both actions are distinguishable, the effective audio destination is discoverable before activation, and no microphone is requested.

#### Scenario: Insecure context or unsupported browser
- **WHEN** the page is opened over plain HTTP from a non-localhost address, or the browser lacks microphone capture or AudioWorklet
- **THEN** both controls are shown disabled with an explanation of what is required, no microphone permission is requested and no voice socket is opened.

### Requirement: Inline voice input at the caret
The first click SHALL start dictation in the ordinary editor. The next click SHALL stop capture, finalize the last phrase and leave an editable draft. Interim hypotheses SHALL appear at the insertion point and be replaced, not appended, by revisions of the same phrase. Neither silence nor stopping SHALL send.

#### Scenario: Dictate between existing words
- **WHEN** the user starts between two pieces of text, speaks two phrases separated by silence and clicks again
- **THEN** both final phrases occur once in order between the original pieces, the microphone is off, attachments remain and the agent receives nothing.

#### Scenario: Manual corrections win
- **WHEN** a user edits recognized words before a delayed correction arrives
- **THEN** the correction does not undo their edit or replace unrelated typed text.

### Requirement: Dedicated voice panel
Voice mode SHALL replace the ordinary editor with a live transcript and a visible, accessible recording state. While the panel has focus, Space SHALL pause or resume, Enter SHALL request send, and Escape SHALL return to ordinary editing with the visible text. Each operation, including clearing dictation, SHALL have a labeled on-screen control. Shortcuts SHALL NOT capture typing outside the panel and SHALL NOT override native activation of a focused button or text field inside it.

#### Scenario: Pause without leaving
- **WHEN** the user presses Space while listening
- **THEN** capture stops, the current phrase is finalized, and the same draft can be extended by pressing Space again.

#### Scenario: Selectively clear and return
- **WHEN** a user enters with existing text and attachments, dictates, clears dictation, then exits with Escape
- **THEN** only dictation from this draft is removed; manually entered text and attachments remain, capture stops, and focus returns to the editor without sending.

### Requirement: Explicit ordinary send after finalization
An explicit send SHALL stop capture and await pending finalization before invoking the ordinary send/queue path exactly once. After success the dedicated panel SHALL remain open on pause. Failure SHALL leave the visible draft available for correction or retry without submitting a partial or duplicating a prior request.

#### Scenario: Double Enter with recognition pending
- **WHEN** Enter is pressed twice during the last phrase and its final result arrives
- **THEN** one submission includes the final words and existing attachments, goes to the ordinary queue if applicable, and does not restart capture.

#### Scenario: Finalization fails
- **WHEN** the provider disconnects before confirming the last phrase during send
- **THEN** nothing is sent, capture stops, and the user can edit the visible text and explicitly retry.

### Requirement: Capture isolation and cleanup
Capture SHALL require explicit activation and SHALL NOT run while paused. Leaving the chat, closing the mode or losing edit access SHALL release the microphone. Late results from canceled sessions SHALL NOT change a new draft or chat. Permission or provider failures SHALL be visible and leave text entry usable.

#### Scenario: Permission denied
- **WHEN** the browser denies microphone access
- **THEN** a recoverable error is shown, the draft and attachments remain unchanged, and normal typing remains possible.

#### Scenario: Switch chats during transcription
- **WHEN** the user leaves a recording chat and a late result arrives
- **THEN** capture tracks have stopped and neither the destination chat nor the abandoned session receives that result.

### Requirement: Screen reader announcements
Screen reader announcements SHALL be limited to state changes (listening, paused, finalizing, sent, error, moved to another tab, remaining time) and SHALL NOT read interim or final phrase text automatically.

#### Scenario: Dictating with a screen reader
- **WHEN** a screen reader user dictates three phrases and pauses
- **THEN** only the listening and paused states are announced, and the phrase text is available by navigating the panel.
