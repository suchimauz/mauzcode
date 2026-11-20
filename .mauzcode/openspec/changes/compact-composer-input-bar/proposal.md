# Proposal

## Why

The composer footer added in `redesign-composer-footer` takes three rows below the text (controls, then metrics), and the whole metrics row is one hover target. Users want the model picker and voice controls inside the input, one metrics row whose usage and context parts react separately, and one consistent look for the live chat, the new-session composer and voice mode. In addition, the message editor misbehaves around line breaks: after Shift+Enter the caret does not move to the new line until the user types; select-all and delete leaves an empty line; on phones a new line is not visible until the user types.

## What Changes

- The add button stays on the first line of the input. Wrapped and later lines use the full input width instead of a column beside the button.
- The model picker, the voice controls (settings, voice mode, inline voice input, as flat icons without the grey capsule) and the send button move into one bar at the bottom inside the input. The separate controls row below the input is removed.
- The metrics row stays below the input, with usage on the left (cost, input and output tokens, cache hit) and the context meter on the right. They are two separate hover/press targets that open the same context details panel. The cache hit is always shown, on desktop and on phones, as a bare percentage without the word "кэш".
- The status row above the input (planning badge and mascot) is unchanged.
- The new-session composer uses the same input with the bottom bar (model picker and send inside the input). Its chip row stays above the input, and the "New Session" label and empty context meter sit in the metrics row below.
- Voice mode keeps the same input frame instead of a separate panel: the live transcript replaces the text, the add button is disabled, and the bottom bar shows the model, waveform with time, clear, pause/resume, exit and send. The status row and the metrics row stay visible. On a phone the model shows only its icon in voice mode.
- Message editor fixes: Shift+Enter (and Enter on touch keyboards) puts the visible caret on the new line immediately; deleting everything leaves a truly empty draft with the placeholder; line breaks from touch keyboards are inserted as one newline and shown at once.

## Capabilities

### New Capabilities
- `chat-message-editor`: Editing behaviour of the chat message editor: line breaks, caret visibility and clearing the draft, on desktop and touch keyboards.

### Modified Capabilities
- `chat-composer-layout`: The add button keeps the first line only; the controls row is replaced by a bar inside the input; the metrics row is split into usage (left) and context (right) targets sharing one panel; the cache hit is always visible without a label; the new-session composer follows the same layout.
- `chat-voice-dictation`: Voice entry controls move into the input bar as flat icons; voice mode reuses the input frame and bar instead of a separate panel; the status and metrics rows stay visible in voice mode; the desktop shortcut-hint line is removed.

## Impact

- Frontend only (`frontend/src`): `MessageInput`, `CommandEditor`, `EditorCaret`, `ComposerFooter`, `LiveComposer`, `NewSessionComposer`, `VoicePanel`, `VoiceEntryControls`, `ModelPicker` placement, and the CSS in `message-input.css`, `composer-footer.css`, `voice-panel.css`, `voice-route-picker.css`, `new-session.css`, `command-editor.css`.
- Tests: `command-editor`, `input-caret`, `composer-footer`, `composer-usage`, `voice-panel`, `plan-mode-badge`, `inline-dictation-composer` and the ComposerFooter stories.
- No API, server or data changes.
