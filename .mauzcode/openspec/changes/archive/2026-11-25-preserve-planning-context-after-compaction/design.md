# Design

## Context

Mode synchronization currently scans canonical history; request assembly scans the compact projection. A matching historical row before the retained boundary can therefore suppress the durable append, leaving request-only guidance at a moving tail.

## Goals / Non-Goals

Make the synchronization decision using the selected projection; keep the existing session append/sync path, mode semantics and preview fallback. Do not edit existing checkpoints or change Codex cache settings. Special authority-scoped requests keep their existing request-only safeguards.

## Decisions

- Use the existing compaction projector on the same ordered root or fork history when compact mode is active. Do not infer visibility from a stored offset alone: the checkpoint may contain guidance, and an unusable generation can select full history instead.
- Keep the ordinary full-history path cheap. When current guidance is missing at a safe boundary, append a normal cursor-excluded guidance row; do not move transient control messages into the bootstrap or mutate a checkpoint.
- Test request-prefix equality deterministically. Outside the automated suite, verify cache reads with a disposable synthetic conversation and a native checkpoint on GPT-6.2-Sol. Do not transmit real agent history, files or secrets.

## Risks / Trade-offs

- Active compaction adds a projection read before inference. Reusing projector semantics is preferable to duplicating checkpoint validation.
- Cache routing and retention belong to the provider. Record actual usage, not a permanent minimum hit rate or a mocked live result.
