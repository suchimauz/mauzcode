# Tasks

## 1. SDK and connection data

- [x] 1.1 Add validated provider transport declarations and safe metadata, defaulting legacy providers to direct-only.
- [x] 1.2 Persist transport separately from provider config; implement create/read/update validation, unchanged-selection handling and direct compatibility for existing rows.

## 2. Routed server clients

- [x] 2.1 Bind HTTP and WebSocket operations to the resolved connection for model discovery, checks and sessions; reuse saved SOCKS5 resolution and SSH lease management.
- [x] 2.2 Implement destination TLS validation, redirect refusal, cancellation, deadlines, safe failures and resource release without direct fallback.

## 3. Settings and built-in adapter

- [x] 3.1 Add provider-filtered transport and saved-reference selectors in Voice settings; round-trip selections and show unavailable references.
- [x] 3.2 Declare all three transports for OpenAI Realtime and use one bound WSS path for its no-audio check and live sessions, including custom Base URLs.

## 4. Verification and documentation

- [x] 4.1 Cover legacy declarations/rows, invalid selections, stale references, safe API views and settings round trips.
- [x] 4.2 Exercise HTTP and WSS with a third-party fixture over each route; assert observed dial path, TLS errors, redirect refusal, no direct retry and cleanup on abort, timeout and completion.
- [x] 4.3 Exercise OpenAI checks and live sessions over each route with local doubles, including a custom endpoint; assert no check audio, unchanged browser contract and redacted failures.
- [x] 4.4 Document transport declaration, bound clients, compatibility and a third-party provider example in the Voice SDK guide.
