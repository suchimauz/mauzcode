## ADDED Requirements

### Requirement: Per-connection transport selection

Providers MAY declare a nonempty list of distinct transport kinds. The SDK SHALL expose those kinds in provider metadata, defaulting to direct-only. Each connection SHALL select one supported transport: `{kind: "direct"}`, `{kind: "socks", proxyId}` or `{kind: "ssh-tunnel", instance}`. Non-direct selections SHALL reference saved infrastructure, never inline credentials.

#### Scenario: Upgrade with existing providers and connections
- **WHEN** a provider has no transport declaration and its existing connection has no saved transport
- **THEN** discovery reports direct-only and that connection continues to use direct without user intervention.

#### Scenario: Select a saved route in settings
- **WHEN** the user creates or edits a connection in Voice settings
- **THEN** only supported transport kinds are offered, with saved references from the matching registry for non-direct kinds; after saving and reopening, the same selection is shown without credentials and unrelated edits preserve it.

#### Scenario: Invalid or stale selection
- **WHEN** an API client selects an unsupported kind, supplies inline credentials or selects an unknown reference
- **THEN** the write fails without changing the existing connection or echoing credentials.
- **WHEN** a previously saved reference disappears
- **THEN** settings identify the unavailable selection and routed operations fail without changing it or contacting the destination directly.

### Requirement: Connection-bound provider networking

The server SDK SHALL supply connection-bound HTTP and WebSocket operations to `listModels`, `test` and `open`. Providers advertising non-direct transport SHALL use these operations for upstream traffic. Non-direct connections SHALL use the selected saved SOCKS5 proxy or SSH tunnel for the whole exchange, require HTTPS/WSS with destination hostname and certificate verification, reject redirects and never fall back to direct. Failures SHALL NOT expose secrets, audio or upstream payloads.

#### Scenario: Third-party provider uses the selected path
- **WHEN** a provider discovers models via HTTP and opens a WSS check or transcription stream
- **THEN** each exchange, including the upgrade and subsequent frames, travels over the configured path, with no independent destination dial for a proxied connection.

#### Scenario: Route or handshake fails
- **WHEN** proxy negotiation, tunnel acquisition, TLS validation or a redirected request or upgrade fails
- **THEN** the operation reports a safe failure without following a redirect, disabling TLS verification or retrying directly.

#### Scenario: Resource ownership ends
- **WHEN** an operation completes, fails, times out or is cancelled during setup or streaming
- **THEN** the SDK closes its stream and releases its tunnel lease exactly once, including resources acquired after cancellation, without interrupting other leases.
