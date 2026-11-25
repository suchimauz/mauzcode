# Design

## Context

`models.protocol.common.streamFetch` reads bounded HTTP error data for provider classifiers but otherwise falls back to status-only errors. Protocol stream decoders can also replace upstream error frames with a generic interruption. Native provider implementations need not use those paths. The Antigravity 403 classifier is one special case, not a global boundary. Agent retry logic already consumes machine failure information; the mutable `last_error` is not a run journal.

## Goals / Non-Goals

**Goals:** Normalize diagnostics where the error is first observed, then carry the safe result to the existing failed-turn view without losing provider wording. Cover every supported inference path, not just every status of a single provider.

**Non-goals:** Raw HTTP tracing, collecting prompts, changing retry/quota behavior, creating an admin-wide log, revising historical errors, or adding a separate error dashboard.

## Decisions

1. **One diagnostic contract, multiple capture points.** Capture a safe provider identifier from the resolved route, stage (`http`, `stream`, `transport`), observed HTTP status, upstream identifiers and safe message. Keep this optional diagnostic separate from policy fields such as internal code, acceptance and replay safety. Extract before a classifier or stream decoder discards the envelope; consume a failed body only once. Reuse the same normalization boundary for native/plugin SDK and transport errors. The agent runner alone is too late to reconstruct upstream facts; one classifier per HTTP status would miss custom paths.
2. **Extract before persisting; never log first and redact later.** Limit HTTP inspection to 16 KiB and the visible message to 300 characters after sanitization. For supported envelopes, select error-message and validated identifier fields only. Ignore debug details, headers, metadata and arbitrary nested values. Redact credential values and patterns, personal links and personal identifiers before truncation. Suppress echoed request values, including tool/prompt content; if a message cannot be separated safely, omit it and explain that no safe detail is available. Never serialize a whole exception or body as fallback. Render the resulting excerpt as text, not HTML or instructions.
3. **One canonical summary in existing failure history.** Carry the same safe summary to the owner-visible terminal run event and current last-error field, without relying on the latter for readback. Reuse existing access controls and rendering; do not create a new raw-error store. Preserve a local failure classification even when the provider uses similar words. Do not synthesize terminal events for transient retries, parking or user cancellation.

## Risks / Trade-offs

- **Unknown provider payload or partial oversized JSON** → report observed facts with a missing-detail marker rather than guessing or dumping the body. Provide SDK guidance and fixtures for adapters that know their envelopes.
- **Sensitive data inside ordinary prose** → use request-aware suppression and fail closed on ambiguous excerpts. Test persisted data and rendered output, not just the sanitizer.
- **Meaning lost during wrapping or retry** → test the full readback path with both HTTP and mid-stream errors; retain the terminal attempt's diagnostic, not a stale earlier attempt.

## Migration Plan

Introduce the optional diagnostic at the model boundary first; adopt it in protocol/native adapters and terminal run reporting. Continue reading historical entries with only their original message. No backfill or destructive migration. Rolling back resumes existing summaries without rewriting run history.
