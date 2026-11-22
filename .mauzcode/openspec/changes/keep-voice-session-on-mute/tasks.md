# Tasks

## 1. Capture and audio privacy

- [ ] 1.1 Separate connected mute/unmute from terminal finish/cancel in `useVoiceCapture`. Update `use-voice-capture.test.tsx` to assert one microphone request, socket, `start`, generation and original deadline across repeated toggles, and exactly one cleanup on termination.
- [ ] 1.2 Gate the microphone track and implement an ordered worklet transition to generated PCM silence. Extend the DSP and capture fixtures/tests with a partial pre-mute frame, distinctive nonzero muted input, empty input channels, rapid toggles and delayed callbacks. Inspect decoded frames for preserved pre-mute speech, silence during mute, fresh speech only on unmute, valid sizes and continuous sequence numbers.
- [ ] 1.3 Update the session-flow section of `docs/voice-providers.md`; verify it matches the capture tests and distinguishes synthetic silence from missing frames, the 30-second idle guard from the original five-minute session limit, and mute from a new generation.

## 2. Dedicated panel and ordinary submission

- [ ] 2.1 Wire Space and the microphone button to the live toggle without closing the draft segment. Update panel and entry-control tests: delayed pre-mute revisions land in place; edits, clear ownership and attachments survive; key repeat and focus on other controls do not trigger extra toggles.
- [ ] 2.2 Expose localized mute/unmute, muted state, a stationary waveform and the continuing countdown; expose start/retry instead after termination. Verify desktop tooltips, touch targets, focus and screen-reader announcements in `voice-panel.test.tsx`, and update the keyboard table and panel examples in `docs/voice-providers.md` to match.
- [ ] 2.3 Make send from either live state use terminal finalization before the ordinary send/queue path. Extend `voice-submission.test.tsx` for double Enter while muted, delayed final words and failure; assert one complete submission or none, and a disconnected panel after acknowledgement. Verify Escape, inline click-to-stop, navigation, access loss and late-event cleanup with the relevant composer and capture tests.

- [ ] 2.4 Add single-word deletion to the shared dictation ledger alongside full clear. Test current draft order across panel/inline visits, repeated words, Russian words and punctuation, typed boundaries, detached phrases and attachments. Verify a late interim/final cannot restore the deletion, the surviving prefix remains eligible and new phrases still arrive.
- [ ] 2.5 Route plain Backspace and Ctrl+Backspace to word/full deletion in the panel and name the button for its single-word default. In `voice-panel.test.tsx`, verify listening and muted states, repeated keys, focused text and buttons, disabled/busy/empty states, and native keyboard/assistive activation; neither action submits or toggles the microphone.
- [ ] 2.6 Implement short click/tap and a 600 ms primary-pointer hold on the same button. With fake timers assert one word on short activation, one full selective clear on hold, no double action on release (including a new phrase arriving first), and no action after pointer/focus cancellation or unmount. Update `docs/voice-providers.md` and accessible help for both shortcuts and gestures; check desktop tooltip and touch wording against the behavior.

## 3. End-to-end verification

- [ ] 3.1 Update `src/voice/composer.browser.it.test.ts` and its local fake as needed: dictate multiple words, mute, delete one with Backspace or a short click, speak a distinct test signal while muted, unmute, invoke full dictation clear, dictate again and send/exit. Verify the typed prefix and attachments survive both deletions. Assert one browser socket and one upstream open for the run, no transmitted muted signal or duplicate text, and closure only at the terminal action. Use generated audio, not a real microphone or paid provider.
- [ ] 3.2 Exercise the transport bounds with deterministic time in the capture/relay tests: regular silence frames keep the session live past 30 seconds, no frames still trigger the idle timeout, and a run muted at its original five-minute deadline times out without reconnecting or sending. Run the focused frontend, relay and browser suites and record the results or any unavailable prerequisite.
