## Why

The single strip under the chat composer holds the add button, the planning badge, cost, token and cache counters, the model picker, the context meter and three look-alike voice icons. On phones and narrow desktop windows it overflows: the counters scroll sideways, the model name collapses and controls overlap. The three voice icons are also hard to tell apart.

## What Changes

- Add a status row above the message input: mode indicators (the planning badge today) on the left, the pet mascot on the right. The mascot keeps its place; the row reuses the space it already occupies.
- Move the add-attachment button inside the message input, as its leading control.
- Split the footer below the input into two rows:
  - controls: model picker on the left, voice controls on the right;
  - metrics: context meter (percent, and used/total tokens when it fits) on the left; cost, input/output tokens and cache hit on the right. Token counts use compact notation (`184k`, `9.4k`).
- The metrics row is one control that opens the existing context details panel. On narrow widths the cache hit and the used/total tokens hide first; nothing scrolls sideways.
- **BREAKING (UI only)**: voice controls get a fixed order — voice settings, voice mode, inline voice input — grouped in one capsule. The settings trigger uses a gear icon. Inline voice input is the visually primary, accent-filled round button.
- Mockups agreed with the user: variant "D2" with voice area "V3".

## Capabilities

### New Capabilities
- `chat-composer-layout`: arrangement of the chat composer — status row, input with leading add button, controls row and metrics row, and their narrow-width behaviour.

### Modified Capabilities
- `chat-voice-dictation`: the entry points requirement changes position (controls row, not next to the context indicator), adds the voice settings control to the group, and fixes order and emphasis.

## Impact

- Frontend only: `ComposerFooter`, `LiveComposer`, `NewSessionComposer`, `MessageInput`, `ComposerAddButton`, `PlanModeBadge` placement, `CrabMascot` anchoring, `VoiceEntryControls`, `VoiceRoutePicker` and their CSS.
- Tests: `composer-footer`, `composer-usage`, `plan-mode-badge`, `voice-entry-controls`, `mascot`, `attachments`, `new-session` and the `ComposerFooter` stories.
- No server, API or data changes.
