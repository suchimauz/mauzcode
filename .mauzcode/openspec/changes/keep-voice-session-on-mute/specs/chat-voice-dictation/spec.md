# Chat voice dictation delta

## ADDED Requirements

### Requirement: Word deletion and full dictation clear
In the dedicated voice panel, a short activation of the delete control SHALL remove the last eligible word in visible draft order. A sustained primary mouse or touch press SHALL clear all unedited dictation, as shall Ctrl+Backspace. Both actions SHALL operate only on dictation still owned by this draft, including inline and earlier panel sessions. Neither SHALL change typed text, manually corrected phrases, attachments, microphone or session state, or submit a message.

#### Scenario: Remove the last word, not the last characters of the draft
- **WHEN** the user has typed `Note:` and ` / keep` around the unedited dictation `хорошая погода сегодня!` and short-clicks, taps or presses Backspace
- **THEN** the draft becomes `Note: хорошая погода / keep`; only `сегодня!` and its redundant separator are removed. Repeating with a new press removes `погода`, not a word from the typed suffix.
- **AND** when there is no eligible dictation, neither delete action changes the draft.

#### Scenario: Correct an interim without losing the rest of the phrase
- **WHEN** one word is removed from a visible interim and a later revision or final for the same phrase arrives
- **THEN** it cannot restore the deletion. The surviving words can still be removed singly or by full clear, and new phrases can still be dictated and revised normally.

#### Scenario: Bulk clear spans the draft, not all of its contents
- **WHEN** this draft contains unedited dictation from earlier inline or panel sessions, typed text, a manually corrected phrase and attachments, and the user invokes full clear while listening or muted
- **THEN** all and only the unedited dictation (including remainders of word deletions) is removed, the connection and microphone state are unchanged, and subsequent revisions cannot restore cleared phrases.

#### Scenario: A pointer gesture has one outcome
- **WHEN** a primary press is released on the button before the hold threshold
- **THEN** exactly one word is deleted; native keyboard or assistive-technology activation of the button also deletes one word once.
- **WHEN** a primary press is held to the threshold
- **THEN** full dictation clear runs once without a preceding word deletion; release or the synthesized click does not delete another word, even if a new phrase has since arrived.
- **WHEN** the press leaves the button or is canceled before the threshold, or the panel closes or locks during the pending press
- **THEN** the pending gesture does nothing, without a later timer or click acting on the draft.

## MODIFIED Requirements

### Requirement: Dedicated voice panel
Voice mode SHALL keep the ordinary input frame and replace its text with a live transcript and a visible, accessible recording state. Each operation, including muting or unmuting the connected microphone, sending, exiting and deleting dictation, SHALL have a labeled on-screen control. The existing delete control SHALL offer both word deletion and full dictation-only clear.

#### Scenario: Selectively clear and return
- **WHEN** a user enters with existing text and attachments, dictates, invokes full dictation clear, then exits with Escape
- **THEN** only dictation from this draft is removed; manually entered text and attachments remain, capture stops, and focus returns to the editor without sending.

### Requirement: Voice panel keyboard shortcuts
With focus on the voice frame or its read-only transcript, Backspace SHALL delete one dictated word and Ctrl+Backspace SHALL clear all eligible dictation. Space SHALL toggle a connected microphone on the same session, Enter SHALL request send, and Escape SHALL return to editing with visible text. These shortcuts SHALL NOT intercept typing outside the frame, editable fields or other controls' native keys. Key repeat SHALL NOT multiply a toggle or deletion.

#### Scenario: Pause without leaving
- **WHEN** the user speaks, presses Space while listening, then presses Space again before the session ends
- **THEN** the first press mutes immediately; the second resumes listening on the same browser connection, provider stream and session ID, without requesting the microphone again or resetting the remaining time.
- **AND** pre-mute speech can still be finalized in the same draft; a toggle neither sends the draft nor waits for finalization before it takes effect.

#### Scenario: Keep the draft across toggles
- **WHEN** a pre-mute result arrives while muted or after unmute and the user adds more speech
- **THEN** revisions update their original words in order without duplication, manual corrections win, and typed text and attachments remain intact.

#### Scenario: Respect focus and key repeat
- **WHEN** Space repeats while held, is typed outside the panel, or activates a focused panel button
- **THEN** there is no extra panel toggle; typing and native button activation keep their ordinary behavior.

#### Scenario: Delete with the panel shortcuts
- **WHEN** an unmodified Backspace is pressed on the frame or read-only transcript, then Ctrl+Backspace is pressed there
- **THEN** the first press removes one eligible word and the chord clears the remaining eligible dictation once; neither navigates back, toggles the mic or sends a message.
- **WHEN** Backspace is held, another modifier is used instead of Ctrl, or either shortcut is used in the ordinary editor or another control
- **THEN** repeat keydowns do not delete further words in the panel, and unrelated key combinations, text editing and native control behavior are not intercepted.

### Requirement: Compact voice panel
Voice mode SHALL remain compact, without a visible state heading. The waveform, microphone control, remaining-time label and frame outline SHALL distinguish listening from connected mute; the state SHALL remain exposed to assistive technology. Controls SHALL be icon buttons with accessible names: exit, delete last dictated word, mute or unmute, and send. The delete control SHALL also describe how to clear all dictation. The add button SHALL stay in place but disabled.

#### Scenario: Paused state without a heading
- **WHEN** the user mutes the connected microphone
- **THEN** the waveform stops animating, the microphone control offers unmute, the original countdown stays visible and continues, and the frame description says the microphone is muted, without a visible state heading.

### Requirement: Desktop voice panel layout
On a fine pointer, voice mode SHALL show the transcript in the text area and, in the input bar, the model picker at the left and, at the right, the waveform with remaining time, clear, microphone toggle, exit and send. No separate shortcut-hint line SHALL be shown; each control's tooltip SHALL name its shortcut. When no dictated text can be cleared, the clear control SHALL stay visible but disabled, with an explanation.

#### Scenario: Desktop shortcut hints
- **WHEN** voice mode opens with a fine pointer
- **THEN** the input frame keeps its size and position, the transcript replaces the text, the bar shows the model and voice controls on one line, the microphone, send and exit tooltips name Space, Enter and Escape, and the delete control explains Backspace for one word and Ctrl+Backspace or a hold for all dictation.

#### Scenario: Nothing to clear on desktop
- **WHEN** voice mode opens on a desktop before any dictation in this draft
- **THEN** the clear control is visible, announced as disabled, and explains that there is no dictated text.

### Requirement: Mobile voice panel layout
On a coarse pointer, voice mode SHALL use the same input frame: the transcript spans the text area and the input bar holds the icon-only model picker, waveform with time, clear, microphone toggle, exit and send. Every control SHALL have a touch target of at least 44 by 44 CSS pixels. Keyboard hints SHALL be hidden. The toggle SHALL use the accent colour while listening and a neutral style when muted or failed. Clear SHALL be hidden when nothing can be cleared.

#### Scenario: Mobile layout
- **WHEN** voice mode opens on a touch device with a narrow screen
- **THEN** the transcript fills the text area, all bar controls fit on one line of 44 px targets without overlap, no keyboard hints are shown, and the clear control appears only once there is dictated text to clear.

#### Scenario: Discover both delete actions on touch
- **WHEN** a touch user can remove dictation
- **THEN** the control is named for deleting one word and its help describes holding for full dictation clear without displaying desktop keyboard hints.

#### Scenario: Mute without a keyboard
- **WHEN** the user taps the microphone control twice during a connected session
- **THEN** the first tap mutes and the second unmutes, with the same connection and privacy guarantees as Space.

### Requirement: Explicit ordinary send after finalization
An explicit send from a listening or muted session SHALL stop capture, finish that session and await pending recognition before invoking the ordinary send/queue path exactly once. After success the dedicated panel SHALL remain open with an empty draft, microphone off and no live session; starting again SHALL require explicit activation. Failure SHALL leave the visible draft available for correction or retry without submitting a partial or duplicating a prior request.

#### Scenario: Double Enter with recognition pending
- **WHEN** Enter is pressed twice during the last phrase and its final result arrives
- **THEN** one submission includes the final words and existing attachments, goes to the ordinary queue if applicable, and does not restart capture.

#### Scenario: Send from mute
- **WHEN** the user mutes mid-phrase and explicitly sends before its final result arrives
- **THEN** the session finishes without unmuting, the final words are included once, and after acknowledgement the panel offers to start a new recording, not to unmute the old one.

#### Scenario: Finalization fails
- **WHEN** the provider disconnects before confirming the last phrase during send
- **THEN** nothing is sent, capture stops, and the user can edit the visible text and explicitly retry.

### Requirement: Capture isolation and cleanup
Capture SHALL require explicit activation. Audio from the microphone during mute SHALL NOT be recognized, transmitted, buffered for replay or released on unmute. Closing the mode, leaving the chat or losing edit access SHALL release the microphone and session, including from mute. Late results from canceled sessions SHALL NOT change a new draft or chat. Permission or provider failures SHALL be visible and leave text entry usable.

#### Scenario: Speech during mute is private
- **WHEN** the user speaks a distinct phrase while muted and then unmutes, including in a rapid sequence of toggles
- **THEN** no samples of that phrase reach the server or provider, immediately or later; the muted interval alone produces no dictated text or submission.

#### Scenario: Muted beyond the idle interval
- **WHEN** a healthy connected panel stays muted for more than 30 seconds but below the original five-minute limit
- **THEN** mute alone does not time out the connection; unmuting resumes the same session. If the original five-minute limit is reached while muted, the normal timeout is shown and the draft is not sent or reconnected automatically.

#### Scenario: Permission denied
- **WHEN** the browser denies microphone access
- **THEN** a recoverable error is shown, the draft and attachments remain unchanged, and normal typing remains possible.

#### Scenario: Switch chats during transcription
- **WHEN** the user leaves a recording or muted chat and a late result arrives
- **THEN** capture tracks have stopped and neither the destination chat nor the abandoned session receives that result.

#### Scenario: Exit or connection loss while muted
- **WHEN** the user exits a muted panel with Escape
- **THEN** the connection closes, microphone resources are released and focus returns to the editor with the visible draft and attachments, without sending.
- **WHEN** the connection instead fails, edit access is revoked or another tab takes over
- **THEN** the ended session cannot be unmuted, the existing cleanup and notification behavior applies, and there is no automatic reconnect or microphone activation.

### Requirement: Screen reader announcements
Screen reader announcements SHALL be limited to state changes (listening, microphone muted, recording stopped, finalizing, sent, error, moved to another tab, remaining time) and SHALL NOT read interim or final phrase text automatically.

#### Scenario: Dictating with a screen reader
- **WHEN** a screen reader user dictates three phrases, mutes and then unmutes
- **THEN** the transitions to listening, microphone muted and listening are announced, not a disconnect or reconnect; phrase text is available by navigating the panel.
