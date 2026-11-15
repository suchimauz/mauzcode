## Why

Model streams sent through `socks` and `ssh-tunnel` transports are cut off after 30 seconds without bytes, because the proxied request falls back to the proxy layer's default 30-second header and idle deadlines. Models that think or assemble a large tool call silently for longer (observed with zai-coding GLM writing a test file) fail every retry with `STREAM_INTERRUPTED`, while the same request over a `direct` transport succeeds.

## What Changes

- The transport entry point gains explicit response-header and inactivity (idle) deadlines that apply identically to every transport, instead of inheriting the proxy layer's 30-second defaults.
- Defaults for model traffic: total 30 minutes for inference streams and native compaction, 5 minutes to receive response headers, 5 minutes of allowed silence between body chunks; header and idle deadlines never exceed the total deadline.
- The SSE frame parser's default inactivity limit is aligned to the same 5 minutes, so the effective idle limit is consistent across protocols.
- Short non-streaming requests (model lists, usage, connection tests) keep their existing short total deadlines.

## Capabilities

### New Capabilities

### Modified Capabilities

- `llm-network-transport`: the "Cancellation and deadlines" requirement adds header and idle deadlines that are equal across transports and bounded by the total deadline.

## Impact

- `src/models/transport/fetch.ts` (new optional `headerTimeoutMs`/`idleTimeoutMs`, passed to `socksProxy.request`).
- `src/models/connections/resolve.ts` (forwards the deadlines to the resolved fetch).
- `src/models/inference/stream.ts`, `src/models/inference/compact.ts` (stream deadlines).
- `src/models/transport/parseSSE.ts` (default idle limit).
- Tests in `src/models/transport.test.ts`.
