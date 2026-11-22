# Delta: Chat voice dictation

## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: Explicit ordinary send after finalization
An explicit send while listening or muted SHALL mute capture and await the current draft's final words before invoking ordinary send/queue exactly once. On acknowledgement the panel SHALL stay open with an empty draft and the same healthy session muted until explicit unmute. Failure SHALL preserve the draft and attachments for review without submitting a partial, duplicating a prior request or restarting a failed connection.

One finalization deadline SHALL start at the explicit send action and cover both the capture gate and relay settlement; neither phase restarts it.

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

### Requirement: Voice errors inside the input
Voice or send errors SHALL appear once inside the owning chat's input frame, with the error ID when present. A terminal failure SHALL return the user to the ordinary composer with the notice, not an apparently connected panel. A submission failure with a healthy connection SHALL keep the panel muted. Notices SHALL NOT leak into another chat or be duplicated below the input.

#### Scenario: Error stays inside the input
- **WHEN** the provider disconnects while listening, or an explicit send fails
- **THEN** one message and any error ID appear in the affected chat's input frame, without an extra line below. The draft remains visible; a terminal disconnect resets the panel, whereas a send error alone does not.
