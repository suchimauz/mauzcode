# chat-voice-dictation Specification

## Purpose
Let users dictate and revise a draft in an existing chat without sending speech or intermediate text to the agent.

## Requirements

### Requirement: Two distinct entry points
An editable open chat SHALL show the voice controls as one group in the input bar, between the model picker and the send button, in this order: voice settings, voice mode, inline voice input. Each SHALL be independently named and keyboard-accessible. Neither entry point SHALL be available on the new-session or read-only composer.

#### Scenario: Discover without activating
- **WHEN** the user navigates the input bar by keyboard or screen reader
- **THEN** both actions are distinguishable, the effective audio destination is discoverable before activation, and no microphone is requested.

#### Scenario: Insecure context or unsupported browser
- **WHEN** the page is opened over plain HTTP from a non-localhost address, or the browser lacks microphone capture or AudioWorklet
- **THEN** both controls are shown disabled with an explanation of what is required, no microphone permission is requested and no voice socket is opened.

#### Scenario: Fixed order
- **WHEN** the user tabs through the voice group
- **THEN** focus reaches voice settings, then voice mode, then inline voice input.

### Requirement: Voice control group appearance
The voice controls SHALL be flat icon buttons without a shared background. Voice settings SHALL use a settings (gear) icon, and inline voice input SHALL be the visually primary, accent-filled control.

#### Scenario: Emphasis of inline voice input
- **WHEN** the voice group is shown in the input bar
- **THEN** all three controls are flat icon buttons, voice settings shows a gear icon, and only inline voice input has the accent fill.

### Requirement: Inline voice input at the caret
The first click SHALL start dictation in the ordinary editor. The next click SHALL stop capture, finalize the last phrase and leave an editable draft. Interim hypotheses SHALL appear at the insertion point and be replaced, not appended, by revisions of the same phrase. Neither silence nor stopping SHALL send.

#### Scenario: Dictate between existing words
- **WHEN** the user starts between two pieces of text, speaks two phrases separated by silence and clicks again
- **THEN** both final phrases occur once in order between the original pieces, the microphone is off, attachments remain and the agent receives nothing.

#### Scenario: Manual corrections win
- **WHEN** a user edits recognized words before a delayed correction arrives
- **THEN** the correction does not undo their edit or replace unrelated typed text.

### Requirement: Dedicated voice panel
Voice mode SHALL keep the ordinary input frame and replace its text with a live transcript and a visible, accessible recording state. Each operation, including muting or unmuting the connected microphone, sending, exiting and deleting dictation, SHALL have a labeled on-screen control. The existing delete control SHALL offer both word deletion and full dictation-only clear.

#### Scenario: Selectively clear and return
- **WHEN** a user enters with existing text and attachments, dictates, invokes full dictation clear, then exits with Escape
- **THEN** only dictation from this draft is removed; manually entered text and attachments remain, capture stops, and focus returns to the editor without sending.

### Requirement: Voice panel keyboard shortcuts
With focus on the voice frame or its read-only transcript, Backspace SHALL delete one dictated word and Ctrl+Backspace SHALL clear all eligible dictation. Space SHALL toggle a connected microphone on the same session, Enter SHALL request send, and Escape SHALL return to editing with visible text. These shortcuts SHALL NOT intercept typing outside the frame, editable fields or other controls' native keys. Key repeat SHALL NOT multiply a toggle or deletion.

#### Scenario: Pause without leaving
- **WHEN** the user speaks, presses Space while listening, then presses Space again before the session ends
- **THEN** the first press mutes immediately; the second resumes listening on the same browser connection, provider stream and session ID, without requesting the microphone again or resetting elapsed time.
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
Voice mode SHALL remain compact without a visible state heading. The waveform, mic control and frame outline SHALL distinguish listening from connected mute; the state SHALL be accessible. Time SHALL show elapsed connection time, never a deadline. Icon controls SHALL have accessible names for exit, delete last dictated word, mute/unmute and send. Delete SHALL also describe full dictation clear. The add button SHALL stay in place but disabled.

#### Scenario: Paused state without a heading
- **WHEN** the user mutes the connected microphone
- **THEN** the waveform stops animating, the control offers unmute and the frame description says the mic is muted. Elapsed time continues from the original connection, including after returning to this chat; there is no countdown or visible state heading.

### Requirement: Desktop voice panel layout
On a fine pointer, voice mode SHALL show the transcript in the text area and, in the input bar, the model picker at the left and, at the right, the waveform with elapsed time, clear, microphone toggle, exit and send. No separate shortcut-hint line SHALL be shown; each control's tooltip SHALL name its shortcut. When no dictated text can be cleared, the clear control SHALL stay visible but disabled, with an explanation.

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
Explicit Send while listening or muted SHALL mute capture, await the draft's final words, and invoke ordinary send/queue once. One deadline SHALL run from Send through the capture gate and relay settlement without restarting. On acknowledgement the panel SHALL stay open with an empty draft and the same healthy session muted until explicit unmute. Failure SHALL preserve the draft and attachments for review without partial or duplicate submission or automatic reconnection.

#### Scenario: Audio worklet does not acknowledge the cut
- **WHEN** the user presses Enter and the capture gate has not acknowledged the cut by the deadline
- **THEN** the UI reports failure, unlocks Send, keeps capture muted and preserves the draft and attachments. No settlement or submission is issued for this attempt, even if its acknowledgement arrives after a retry.

#### Scenario: Double Enter with recognition pending
- **WHEN** Enter is pressed twice during the last phrase and its final result arrives
- **THEN** one submission includes the final words and existing attachments, goes to the ordinary queue if applicable, and does not restart capture. Only the user's explicit send authorizes submission.

#### Scenario: Send from mute
- **WHEN** the user mutes mid-phrase and explicitly sends before its final result arrives
- **THEN** the final words are included once without unmuting. After acknowledgement, explicit unmute in the same chat starts the next draft on the same connection; late events for the sent draft cannot populate it.

#### Scenario: Finalization fails
- **WHEN** the provider disconnects before confirming the last phrase during send
- **THEN** nothing is sent, capture stops, and the user can edit the visible text and explicitly retry.
- **WHEN** finalization succeeds but the ordinary send fails or its acknowledgement is lost
- **THEN** the draft and attachments remain available, the healthy mic stays muted, and an explicit retry of the unchanged submission uses the same request key and endpoint.

### Requirement: Capture isolation and cleanup
Capture SHALL require explicit activation. Muted mic input SHALL NOT be transmitted, recognized, buffered or replayed. Navigation SHALL mute dedicated mode but stop inline dictation. Explicit exit, page teardown, lost access, takeover or a terminal disconnect SHALL release the affected run. A terminal disconnect SHALL reset dedicated mode, preserve unsent text and attachments and require a fresh explicit start. No termination SHALL automatically send, reconnect or enable the mic.

#### Scenario: Speech during mute is private
- **WHEN** the user speaks a distinct phrase while muted and then unmutes, including in a rapid sequence of toggles or chat switches
- **THEN** no samples of that phrase reach the server or provider, immediately or later; the muted interval alone produces no dictated text or submission.

#### Scenario: Muted beyond the idle interval
- **WHEN** a healthy connected panel stays muted beyond both the 30-second idle interval and five minutes, including while the owner is viewing another chat
- **THEN** mute alone causes no timeout or reconnect; manual unmute in the original chat resumes the same session.

#### Scenario: Permission denied
- **WHEN** the browser denies microphone access
- **THEN** a recoverable error is shown, the draft and attachments remain unchanged, and normal typing remains possible.

#### Scenario: Switch chats during transcription
- **WHEN** the user switches from A to B before a final for pre-switch speech arrives
- **THEN** only A's still-live draft can receive that revision. It must not overwrite a manual edit or populate B. Events after cancellation or takeover update neither draft. Inline dictation instead stops on leaving its chat and drops late events.

#### Scenario: Exit or connection loss while muted
- **WHEN** the user exits a muted panel with Escape
- **THEN** the connection closes, microphone resources are released and focus returns to the editor with the visible draft and attachments, without sending.
- **WHEN** the connection instead fails, edit access is revoked or another tab takes over, even while the user views B
- **THEN** A's former panel is no longer active on return; the reason is available in A, there is no unmute or automatic restart, and B's editor and microphone are untouched. Loss of edit access does not restore edit controls.

### Requirement: Screen reader announcements
Screen reader announcements SHALL be limited to state changes (listening, microphone muted, recording stopped, finalizing, sent, error, moved elsewhere). They SHALL NOT read interim or final phrase text, announce a countdown or announce ticking elapsed time automatically.

#### Scenario: Dictating with a screen reader
- **WHEN** a screen reader user dictates three phrases, mutes and then unmutes
- **THEN** listening, muted and listening are announced, not a disconnect or reconnect. Phrase text and elapsed time can be read on demand in the owning chat.

### Requirement: Composer rows around voice mode
While voice mode is open, the status row above the input and the metrics row below it SHALL stay visible and unchanged. Transient notices, the separate inline-voice error line and the stop-execution button SHALL NOT be shown below the input; they SHALL reappear after leaving voice mode.

#### Scenario: Rows stay in place
- **WHEN** the user opens voice mode in a chat in planning mode with a running agent and a notice
- **THEN** the planning badge stays above the input, the metrics row stays below it, and the notice and stop-execution button are hidden until voice mode closes.

### Requirement: Voice errors inside the input
Voice or send errors SHALL appear once inside the owning chat's input frame, with the error ID when present. A terminal failure SHALL return the user to the ordinary composer with the notice, not an apparently connected panel. A submission failure with a healthy connection SHALL keep the panel muted. Notices SHALL NOT leak into another chat or be duplicated below the input.

#### Scenario: Error stays inside the input
- **WHEN** the provider disconnects while listening, or an explicit send fails
- **THEN** one message and any error ID appear in the affected chat's input frame, without an extra line below. The draft remains visible; a terminal disconnect resets the panel, whereas a send error alone does not.

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

### Requirement: Chat-bound voice mode across navigation
A dedicated voice session SHALL belong to the chat that started it, not the chat on screen. Leaving its chat SHALL immediately force mute, never exit or transfer a healthy session. Returning SHALL show the same panel, draft and connection, still muted. Only an explicit unmute in the owning chat SHALL enable its microphone again.

#### Scenario: Visit another agent and return
- **WHEN** the user leaves A while listening, views or types in B, then returns to A without starting another voice mode
- **THEN** B has its own ordinary editor and no access to A's audio or transcript. A returns with its panel open, the same session ID, route and provider stream, and its draft and attachments intact. No new permission request, socket, send or unmute occurs.
- **AND** explicit unmute in A resumes the existing session. Repeated navigation, back/forward and visiting B while A was already muted have the same outcome.

#### Scenario: Switch during microphone setup
- **WHEN** the user leaves A before permission, audio setup or the server-ready event for A completes
- **THEN** late completion for A cannot enable a microphone or open voice mode in B. If the original attempt becomes ready, it is muted in A; return alone cannot turn it on.

#### Scenario: Explicit start elsewhere takes over
- **WHEN** the user explicitly starts dedicated voice mode in editable B while A owns it
- **THEN** A's mode ends before B transmits, A retains its unsent draft and attachments, and only B shows a live voice panel. Returning to A shows its ordinary editor, not an unmute action for a dead session.
- **AND** late phrases, errors and cleanup from A cannot edit or close B. Merely opening B, inspecting its voice routes, or using inline dictation in B does not transfer A's dedicated mode.
