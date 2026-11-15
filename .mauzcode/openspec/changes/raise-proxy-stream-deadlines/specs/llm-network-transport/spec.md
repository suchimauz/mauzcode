## MODIFIED Requirements

### Requirement: Cancellation and deadlines
The transport entry point SHALL honour an abort signal, a total timeout, a response-header deadline and an inactivity (idle) deadline for every transport. The header and idle deadlines SHALL behave identically for `direct`, `socks` and `ssh-tunnel` transports, MUST NOT exceed the total timeout, and MUST NOT silently fall back to a shorter proxy-specific default. Model inference streams and native compaction SHALL use a total deadline of 30 minutes, a header deadline of 5 minutes and an idle deadline of 5 minutes; the idle deadline restarts on every received body chunk.

#### Scenario: Caller aborts
- **WHEN** the caller aborts a request in progress
- **THEN** the request stops and its proxy or tunnel resources are released

#### Scenario: Long silent model stream through a tunnel
- **WHEN** a model stream over an `ssh-tunnel` or `socks` transport sends no bytes for 60 seconds and then continues
- **THEN** the stream is not interrupted and completes normally

#### Scenario: Stalled stream
- **WHEN** a model stream sends no bytes for longer than its idle deadline
- **THEN** the request fails with a retryable transport error and its proxy or tunnel resources are released

#### Scenario: Idle deadline bounded by total deadline
- **WHEN** a request is made with a total timeout shorter than the requested idle or header deadline
- **THEN** the shorter total timeout governs the request
