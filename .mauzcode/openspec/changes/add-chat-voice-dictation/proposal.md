# Proposal

## Why

Dictating into an ongoing chat today means leaving the composer. People should be able to speak, see live text, correct it and only then send it. Recognition quality and latency matter most, so the first backend is OpenAI Realtime transcription; the architecture must still accept other recognizers later without touching the composer.

## What Changes

- Add a new, self-contained **Voice SDK** (`voice` core module) with its own provider declarations, connections, route resolution and live session protocol, modeled on the Models SDK but independent of it. It has one entry point for every consumer: discovery and route resolution through `ctx.fns.voice.*`, live audio through one authenticated WebSocket endpoint.
- Ship exactly one built-in provider: **OpenAI Realtime transcription** (`openai-realtime`), server-side WebSocket, transcription-only session, default model `gpt-live-transcribe`.
- Add two controls after the context indicator in editable open chats: inline dictation at the caret and a dedicated keyboard-operated voice panel. Only an explicit send submits the draft.
- Select a default voice connection and model in settings, optionally override them per chat, and show the audio destination before capture.

## Capabilities

### New Capabilities

- `voice-provider-sdk`: Provider declaration, connections, routing, session transport and normalized transcript protocol, audio and credential privacy.
- `voice-openai-realtime-provider`: The built-in OpenAI Realtime transcription adapter.
- `chat-voice-dictation`: Draft composition, keyboard and pointer behavior, capture lifecycle and ordinary message submission.

### Modified Capabilities

None. Models SDK, LLM routing, queue semantics and secret handling keep their contracts.

## Impact

New `src/voice` module (declarations, loader, connections table, WebSocket endpoint, facade), React composer/footer, settings and per-chat preference. No dependency on the Whisper plugin or its routes, and no change to it. No Models SDK change: voice connections are stored separately even when the same OpenAI key is used. OpenAI use is optional and metered (`gpt-live-transcribe` ≈ $0.017 per audio minute at time of writing). This change package specifies future implementation; it does not enable microphone capture by itself.
