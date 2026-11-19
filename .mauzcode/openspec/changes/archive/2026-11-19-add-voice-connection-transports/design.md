# Design

## Context

Models binds HTTP requests to a resolved connection and already knows how to resolve saved SOCKS5 proxies and acquire SSH tunnel leases. Voice passes config, secret access and cancellation to provider hooks, but its OpenAI adapter constructs its own WebSocket. A routed HTTP client alone cannot carry that upgrade and subsequent duplex stream.

## Goals / Non-Goals

Route provider traffic consistently from discovery through session teardown. Keep the chooser per connection, not per chat or model. Do not create another infrastructure registry, route browser traffic through a proxy, or treat third-party provider code as sandboxed.

## Decisions

1. Add optional provider `transports` metadata and a separate persisted connection `transport` using Models' discriminated shapes. An absent declaration means direct-only; a missing stored selection means direct. Preserve the saved selection on unrelated edits. Validate declarations and reject unsupported kinds, extra credential fields and unknown references on selection. Resolve references again at use time because infrastructure may be removed after saving.
2. Expose connection-bound `fetch` and `openWebSocket` to `listModels`, `test` and `open`. Providers advertising proxy/tunnel support must use them for all upstream traffic. Share HTTP routing and low-level SOCKS5 connection / SSH lease logic with Models rather than importing provider-specific code. For WSS, establish the selected path, perform TLS for the destination hostname, then upgrade on that same stream. Do not follow redirects or retry directly. Bind abort/deadline during setup and keep cleanup ownership through response-body completion or socket close. Release late acquisitions and release only the caller's lease, once.
3. Keep transport selection next to the connection in Voice settings. Populate choices from declared capabilities and saved infrastructure; retain a visibly unavailable reference until the user selects a replacement. Continue to disclose the recognizer endpoint, not the intermediary. OpenAI checks and sessions share one connection-bound socket creation path; the check never appends audio.

## Risks / Trade-offs

- A socket API that silently dials the destination again after tunnel setup would bypass the route. Test at the dial boundary, including failed upgrades and TLS failures.
- Legacy providers may use their own network clients. Defaulting them to direct-only avoids promising unsupported routing; transport support is an explicit provider contract, not enforcement against malicious code.
- Stale references or cancellation racing a dial can leak resources. Fail closed with existing safe error categories and cover these races with isolated fixtures.
