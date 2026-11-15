# Design

## Context

`models.transport.fetch` forwards only a total `timeoutMs` to `socksProxy.request`, whose header and idle deadlines default to `min(total, 30000)`. `direct` requests have no transport idle limit; only `parseSSE` (120 s) and the total deadline apply. The legacy `sshProvider.dispatch` path already uses 30 min total / 90 s idle. Inference streams pass a 10-minute total.

## Goals / Non-Goals

**Goals:**
- One explicit set of deadlines for model streams, identical across transports.
- Tolerate long silent reasoning or tool-argument generation without hiding real stalls forever.

**Non-Goals:**
- Owner-configurable deadline settings (can be added later on top of the explicit options).
- Changing retry policy or `STREAM_INTERRUPTED` classification.
- Changing short request deadlines (catalogue, usage, tests).

## Decisions

- **Limits: total 30 min, header 5 min, idle 5 min.** Silence of 30–120 s is normal for large reasoning models and big tool calls; 5 minutes covers that with margin while still detecting a dead tunnel well before the total deadline. Header 5 min covers slow prefill of large contexts. Total 30 min matches the existing `sshProvider.dispatch` budget and permits long outputs. Alternative 90 s idle (as in dispatch) was rejected: it already sits close to observed silent periods.
- **Options on `transport.fetch`:** add optional `headerTimeoutMs` and `idleTimeoutMs`, defaulting to `min(total, 300000)`, and pass them to `socksProxy.request`. `connections.resolve` forwards them. This removes the hidden 30-second proxy default for every caller of the transport.
- **`parseSSE` default idle 300000 ms** so `direct` streams and proxied streams share the same effective idle limit.

## Risks / Trade-offs

- [A truly dead upstream now takes up to 5 min to detect instead of 30 s] → user cancellation still stops it at once; tunnel death aborts via the lease signal.
- [Longer total deadline holds a tunnel lease longer] → leases are released on completion, cancellation or failure as before.
