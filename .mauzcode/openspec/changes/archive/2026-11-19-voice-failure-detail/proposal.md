# Proposal

## Why

A live dictation failure on 2026-11-19 was journaled as `streaming / unknown` and could not be investigated: the OpenAI Realtime adapter discards the WebSocket close code, the service error code/type and the kind of local protocol violation, and nothing is logged. Several distinct failures (upstream disconnect, service `error` event, malformed frame, commit/item mismatch, failed send) are therefore indistinguishable, so the owner cannot tell a network or tunnel drop from a provider rejection.

## What Changes

- The voice error journal records two more sanitized fields per failure: a **reason** from a closed set describing what ended the session (for example `socketClosed`, `socketError`, `serviceError`, `malformedMessage`, `sequenceMismatch`, `sendFailed`, `setupTimeout`, `finishTimeout`) and an optional short **detail** limited to safe machine values (a WebSocket close code, or a service error code/type matching a strict identifier pattern).
- The provider SDK failure contract lets a provider attach these fields to a terminal failure; core validates and normalizes them before storage and drops anything else.
- The OpenAI Realtime provider classifies each terminal failure with a reason and, where available, the close code or the service error `code`/`type`.
- Settings → Voice → Errors shows the reason and detail next to stage and cause.
- Free-form text (close reason strings, error messages, URLs, payloads, credentials, audio, transcripts) is still never stored, returned or logged.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `voice-error-journal`: safe diagnostic fields gain a closed-set failure reason and a strictly validated machine detail (close code or service error identifier) instead of discarding all unrecognized codes.
- `voice-openai-realtime-provider`: service errors and disconnects are reported with their reason and safe detail.

## Impact

- DB: new migration adding nullable `reason` and `detail` columns to `voice_error_journal`.
- Code: `src/voice/journal/record.ts`, `src/voice/journal/read.ts`, `src/voice/session/open.ts` (cause/detail propagation), `src/voice/StreamSession.ts` (failure type), `src/voice/$voiceProvider_openai-realtime.ts`.
- UI: `frontend/src/components/settings/VoiceErrors.tsx`.
- Tests: journal, session and OpenAI Realtime unit tests; docs `docs/voice-providers.md`.
- No browser `/voice/session` protocol change; user-facing error messages stay the same fixed sentences.
