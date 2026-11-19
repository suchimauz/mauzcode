# Design

## Context

The voice adapter sanitizes provider errors before the session passes them to the browser. Raw upstream messages are neither safe to display nor appropriate for later storage.

## Goals / Non-Goals

**Goals:** Correlate a visible failure with one safe, time-limited record; preserve current failure handling when diagnostics are unavailable.

**Non-Goals:** Recording microphone/browser failures, recovering past incidents, retaining speech, and external telemetry.

## Decisions

- Classify known provider signals at the adapter boundary into fixed codes (e.g. authentication, rate limit, timeout, unknown). Never use upstream text or an arbitrary upstream code as a fallback. Derive stage from session state, not exception text.
- Persist once in the server's terminal provider-failure path. Generate a random short reference with a uniqueness constraint; attach it as an optional error field only on successful write. Both capture surfaces render that field without changing public error codes.
- Use a dedicated table with an expiry index, owner-authorized reads and bounded newest-first results plus exact ID lookup. Apply the seven-day cutoff on every read and purge expired rows periodically, including catch-up after downtime.
- Prefer this narrow journal over generic request logging: request logs could retain audio, credentials or transcripts and cannot safely be shown in settings.

## Risks / Trade-offs

Unknown provider errors remain unknown by design. If storage is unavailable the user still sees the original failure, but no reference. Scheduled deletion can lag during downtime; read filtering must never depend on a successful cleanup run.
