# Proposal: Keep voice mode connected when switching chats

## Why

MauzCode itself ends a healthy voice connection five minutes after it becomes ready. Opening another agent also unmounts the composer and cancels capture: just checking a second chat costs the user their session and another microphone start.

## What Changes

- Remove the fixed lifetime for **dedicated voice mode**, whether listening or muted. Show elapsed time rather than time left. A real disconnect, including a provider-imposed limit, still ends the session; do not reconnect or reopen the microphone automatically.
- On leaving chat A for B, mute A immediately but keep its connection and draft. B opens its own ordinary composer. Returning to A restores its panel **still muted**; only explicit unmute in A resumes listening on the same connection.
- Only an explicit, authorized voice-mode start in another chat takes ownership from A. End A before B can transmit; keep both drafts and their attachments separate. A terminal error also clears the affected mode and leaves the reason visible in its own chat. Explicit Exit, page teardown and loss of access still release resources.
- Sending a message is not exiting voice mode: mute, settle the last words, send once through the normal path, then leave the healthy connection muted for the next message. A failed send must not silently submit partial text or turn the mic on.
- Keep ordinary inline dictation's click-to-stop, navigation cleanup and existing limits. Keep server authorization, liveness and resource safeguards; do not promise that a vendor or a broken network will keep a socket open forever.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `chat-voice-dictation`: bind the dedicated panel to its originating draft across navigation; define forced mute, explicit unmute, takeover, terminal errors, send without disconnecting, and accessible elapsed-time feedback.
- `voice-provider-sdk`: distinguish dedicated from inline sessions at the relay; remove the dedicated wall-clock cap, arbitrate dedicated starts for one owner, and settle a draft boundary without closing a healthy stream.

## Impact

The React chat shell, composer, microphone controller and voice panel; the `/voice/session` relay, session core and their tests; and `docs/voice-providers.md`. The protocol changes are additive for older clients. No new provider, dependency, database migration, persistent audio or transcript history is needed.
