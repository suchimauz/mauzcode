# Tasks

## 1. Relay lifetime and ownership

- [x] 1.1 Negotiate dedicated vs inline starts and remove all age-triggered finish paths for dedicated runs only. Extend `src/voice/socket.test.ts` with fake time: speech and valid muted silence cross five minutes on one session/stream, and accept later audio; omitted/inline mode still expires, invalid mode is refused and 30 seconds with no frames still times out.
- [x] 1.2 Arbitrate dedicated starts by authenticated owner as well as by chat. Test A→B, same-chat second tab, different owners, rejected/unauthorized starts, inline in another chat, overlapping async starts and failed setup after takeover. Assert the old stream stops, the winning lease survives stale cleanup, and archived/read-only chats cannot keep a parked session.
- [x] 1.3 Update the wire/lifetime section of `docs/voice-providers.md` against the relay tests: start/ready compatibility, mode-specific limit, real liveness/size/queue/finish bounds, ownership scope and provider-imposed closures.

## 2. Settle one message without stopping the stream

- [x] 2.1 Add a bounded, non-terminal draft boundary to the session core. Exercise client- and provider-detected turns with fakes: short tail, already-committed speech, silence-only, out-of-order finals, phrase failure, upstream close and deadline. Success must leave the same provider handle usable for the next draft.
- [x] 2.2 Add correlated dedicated-only boundary request/acknowledgement to the relay; keep legacy finish/cancel terminal. Verify ordered frames and final events precede acknowledgement, repeated requests cannot create a second send boundary, and access loss/timeout while settling releases the run. Document these messages and ordering in `docs/voice-providers.md`.
- [x] 2.3 Bound retained settled-phrase/provider correlation state independently of session age. Run a many-draft fake-provider test that checks retention levels off, duplicate/late finals never rewrite new text, and terminal close releases queues, timers, listeners and leases.

## 3. Navigation and microphone privacy

- [x] 3.1 Move dedicated capture ownership above the agent-keyed composer and bind phrase/draft data (including attachments and corrections) to the originating chat/generation. Test A→B→A with both drafts nonempty and a late A final while viewing B: A alone changes, B stays in ordinary editing, no new socket, permission request or send.
- [x] 3.2 Force the existing audio gate to mute before a chat switch; latch it through delayed permission/ready, worklet acknowledgements, rapid navigation and back/forward. Extend capture/worklet tests with marked samples: no sound from the muted interval reaches the wire or replays; returning never unmutes; deliberate unmute resumes the original session.
- [x] 3.3 Clear dedicated ownership and media on explicit Exit, terminal error, supersession, access loss and actual page teardown, not on an ordinary agent switch. Test B takeover and provider/socket loss in visible and parked A, with stale callbacks: only the correct panel resets, drafts/files survive in-page, and there is no automatic reconnect. Keep inline stop-on-navigation coverage.
- [x] 3.4 Update panel time, accessible announcements and owner-scoped terminal notices. Test desktop/touch and keyboard with the UI clock past five minutes: elapsed time continues across mute/navigation, the stopped waveform and unmute action agree, no expiry warning is announced, and the reason/error ID is visible only in the affected chat. Update the navigation/mute instructions in `docs/voice-providers.md` to match.

## 4. Composer send and end-to-end acceptance

- [x] 4.1 Wire explicit dedicated Send to the capture gate, settlement and existing idempotent send/queue. Extend `frontend/src/test/voice-submission.test.tsx`: from listening and mute, delayed final plus repeated Enter sends once; acknowledgement leaves the same connection muted, and the next draft gets no old words. Include failure/uncertain acknowledgement, attachments and switching chats during a pending send; inline keeps terminal finish semantics. Use a fake clock and withhold the worklet acknowledgement through the deadline; assert muted capture, preserved text and attachments, unlocked Send and no settlement/submission, including after a stale acknowledgement during retry. Document the revised Enter behavior.
- [x] 4.2 Extend the existing browser voice fixture with two editable chats, a fake microphone and a loopback provider. Exercise long listening and mute (fake clock in relay tests), navigate, return/unmute, send, switch ownership and disconnect. Assert stream/session counts, captured samples, per-chat drafts and ordinary message counts; do not use a live provider or credentials.
- [x] 4.2a Add a provider-VAD fake that closes a turn before `settle` but delays its notification and final until afterwards. Assert zero extra commits and one final before success; withhold the notification through the deadline and assert failure without submission.
- [x] 4.3 Run the focused relay/core/provider, frontend voice and browser integration suites and strict OpenSpec validation. Record the passing commands/results, including legacy inline behavior and negotiated fallback when the server lacks dedicated support.

## Verification

Commands were run from the change worktree. The integration tests use isolated Postgres, a synthetic microphone and a loopback provider; no live account is required.

| Command | Result |
| --- | --- |
| `bun test --timeout 20000 ./src/voice/{socket.test.ts,session.test.ts,sessionVad.test.ts,sessionContract.test.ts,openaiRealtime.unit.test.ts,openaiRealtime.it.test.ts,providers.test.ts,registryReload.test.ts,httpApi.test.ts}` | 167 passed. Fake time distinguishes session age from idle; delayed provider turn notifications never trigger a speculative commit. Two 320-draft cases check that settled state stays bounded. |
| `bun run frontend:test -- frontend/src/test/{use-voice-capture.test.tsx,voice-capture-dsp.test.ts,voice-submission.test.tsx,voice-panel.test.tsx,voice-entry-controls.test.tsx,inline-dictation.test.ts,inline-dictation-composer.test.tsx,voice-navigation-setup.test.tsx,live-navigation.test.tsx,live-canvas.test.tsx,new-session.test.tsx,settings-voice.test.tsx,composer-footer.test.tsx,message-queue.test.tsx}` | 227 passed. Covers delayed permission, rejected and failed takeovers, the worklet deadline, stale replies, and terminal inline/fallback `finish` without `settle`. |
| `bun test --timeout 60000 ./src/voice/composer.browser.it.test.ts` | 2 passed in Chromium (inline and dedicated). Back/Forward, marked PCM, late finals, preserved attachments, takeover and ordinary queue submission are checked against the real relay. |
| `bun run test` | 4,230 passed; no failures. |
| `procs.dev.typecheck({})` and `bun node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json --pretty false` | Root and frontend: no diagnostics. Strict runtime metadata validation for `voice.session.open` and `voice.session.vadFlush` returned no errors or warnings. |
| `openspec.run({ args: ['validate', 'keep-voice-mode-connected', '--strict'] })` | Change valid. |
