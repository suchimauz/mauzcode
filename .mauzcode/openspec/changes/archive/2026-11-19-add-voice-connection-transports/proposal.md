# Voice connection transports

## Why

Models connections can use saved SOCKS5 proxies and SSH instances. Voice connections cannot: even a successful direct connection check says nothing about whether dictation is available over the user's intended route.

## What Changes

- Let voice providers declare transport support and receive HTTP and WebSocket clients bound to the saved connection route.
- Let users select that route in Voice settings. Existing providers and connections retain their direct behavior.
- Use the selected route for both OpenAI Realtime connection checks and live dictation. A broken route fails rather than sending traffic directly.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `voice-provider-sdk`: transport declarations, connection storage and settings, and routed server-side network operations.
- `voice-openai-realtime-provider`: use the selected connection transport for every upstream WebSocket.

## Impact

Affects Voice SDK types, registry, connection persistence/API, Voice settings, adapter, tests and provider documentation. Reuses Models transport infrastructure; no change to model routing, the browser voice protocol or audio destination disclosure.
