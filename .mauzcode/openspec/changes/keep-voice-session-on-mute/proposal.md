# Proposal: Mute and correct dictation without leaving voice mode

## Why

In the dedicated voice panel, Space ends the session instead of just muting, and one click on Clear removes all unedited dictation when only the last word may be wrong. Users should be able to pause their microphone or take back one word without losing the connection or the rest of their draft.

## What Changes

- In a connected voice panel, Space and the microphone button toggle mute, not the session. Unmuting continues on the same browser socket and provider stream without requesting the microphone again.
- While muted, no microphone sound is transmitted or saved for later. The panel shows that the microphone is off, continues to show the original countdown and can still receive final words spoken before mute. Nothing is sent to the agent.
- Keep ending the session explicit: Enter finishes pending recognition before an ordinary send; Escape exits without sending. A finished, failed or expired session is not a muted connection. Inline dictation keeps its existing click-to-stop behavior.

- In the dedicated panel, Backspace or a short click/tap on the existing clear button removes the last unedited dictated word. Ctrl+Backspace or a sustained press on the same button performs today's full **dictation-only** clear. Neither action affects typed text, manually corrected phrases, attachments or the voice session.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `chat-voice-dictation`: redefine the dedicated panel's pause as connected microphone mute; distinguish it from stop in the controls, transcript handling, privacy guarantees and send lifecycle; add word deletion and shortcuts/gestures for the existing selective clear.

## Impact

Affects the browser capture controller and AudioWorklet, the dedicated panel, its shared dictation ledger and draft/send integration, voice documentation and tests. The existing `/voice/session` PCM protocol, provider API, routing, access checks, idle timeout and five-minute ceiling stay unchanged. No new service, dependency or migration is required.
