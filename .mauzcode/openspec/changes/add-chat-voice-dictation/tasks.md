# Tasks

## 1. Voice SDK core

- [x] 1.1 Create the `voice` module: `types.voice.ProviderDefinition`, `$loader_voiceProvider.ts` with validation, ownership, duplicate rejection and unload; test with a fixture provider and a broken declaration. No import from `src/models` or the Whisper plugin.
- [x] 1.2 Add `voice_connections` storage with secrets in the secret store, CRUD, secret-free projections and `test`; add the minimal facade and access/preset classification for the new namespace. Test validation, rename and secret absence in projections.
- [x] 1.3 Implement route parsing/resolution, the `voice.defaultRoute` setting and the per-chat override in scratchpad key `voice.route` with `voice.effectiveRoute`; test inheritance, reset and unavailable route without fallback.
- [x] 1.4 Implement the normalized session core (phrase ID, commit order, revisions, single final, finish/cancel, generations, timeouts) and server-side energy VAD (≈500 ms silence, forced commit at 15 s, commit on finish, no silence-only commits, forced commit at the lowest-energy window; test a synthetic 20 s utterance) and a reusable provider contract test suite driven by a fake provider.
- [x] 1.5 Add `$ws_voice_session.ts`: origin/owner/chat checks, start/finish/cancel messages, server-enforced 5-minute limit with finalization, sequenced PCM frames (gap/repeat → `protocol`), closed error codes, re-check of edit access during the session (`readOnly`), bounds, one session per owner+chat, no disk or log output; test unauthorized access, foreign chat, oversize frame, sequence gap, idle timeout, session limit without client cooperation, loss of edit access mid-session, second-tab takeover (`superseded`) and cleanup on disconnect.

## 2. OpenAI Realtime provider

- [ ] 2.1 Implement `$voiceProvider_openai-realtime.ts`: fields, models, option validation, connect with transcription intent, session update, append/commit, commit acknowledgements bound to core order (`previous_item_id` only as an assertion), event mapping, sanitized errors. No own segmentation: commits come only from core.
- [ ] 2.2 Test against a fake Realtime WebSocket server: setup, deltas/completed, out-of-order completion, failed item, bad key, disconnect, no response/audio/tool messages, connection test without audio; run the shared contract suite.
- [ ] 2.3 Document setup (API key, models, options, billing, that audio goes from the MauzCode server to OpenAI) and the provider declaration guide for third parties.

## 3. Settings and capture UI

- [ ] 3.1 Add voice connections and the default route to settings, per-chat route selection/reset and destination disclosure; test persistence and the unconfigured state without microphone access.
- [ ] 3.2 Build `useVoiceCapture`: secure-context and capability checks (disabled controls with explanation, no socket), getUserMedia, AudioWorklet resampling to the announced rate, PCM16 framing, remaining-time display, states and generation cleanup; test with synthetic tracks: insecure context (HTTP), missing AudioWorklet, permission denial, pause/resume, navigation, read-only transition, socket loss and late events.
- [ ] 3.3 Place both accessible controls after the context meter in open editable chats; verify order, names, focus and absence in new-session and read-only composers.
- [ ] 3.4 Implement inline dictation at the caret for both `CommandEditor` and `textarea`; test partial replacement, manual edits win, surrounding text and attachments preserved, stop without submission.
- [ ] 3.5 Implement the voice panel with scoped shortcuts (ignored on buttons and editable targets), equivalent buttons, selective clear and Escape; test pause/resume, focus, live-region announcements limited to state changes (no phrase text) and preservation of text and attachments. Document controls in user help.

## 4. Submission and verification

- [ ] 4.1 Connect explicit send to finish and the existing send/queue action; test double Enter during finalization, enqueue while busy, retry after failure, nothing sent on finish error, paused after acknowledgement.
- [ ] 4.2 End-to-end inline and panel flows against the fake Realtime server: no key in browser traffic, no audio file, no interim history or queue entry.
- [ ] 4.3 Regression checks for editor/queue shortcuts and Models routing, project typecheck, `code.quality` and strict OpenSpec validation; record results.
