# Design

## Context

The Claude wire helper owns HTTP failure classification, bounded error-body reads and redaction. The run loop owns user-visible truncation handling and tool dispatch. Neither side alone can safely handle both kinds of recovery.

## Goals / Non-Goals

Keep rejected HTTP requests separate from accepted model turns. Do not change non-Claude routes, attempt to resume partial tool JSON, or introduce a setting or migration.

## Decisions

- Use the known catalogue models' documented 128K limit and a conservative 64K fallback, rather than guessing by a substring or probing a real account. An explicit caller value is a contract, not a suggestion.
- Detect a specific size rejection before the existing sanitized HTTP failure is thrown. Use the bounded reader; do not keep raw error text in logs or infer retryability from an arbitrary mention of `max_tokens`. Only shrink the automatic limit. Preserve connection, signal, authentication, betas and all other body fields across attempts. Generate a fresh `x-client-request-id` for each HTTP request, as required by the existing Claude headers contract.
- Handle no-tool length stops after the normal streaming, accounting and cancellation path but before final delivery. Count consecutive cutoffs within the running agent turn, not in global provider state. Supply short recovery guidance rather than committing the truncated assistant output as a reply. Leave the existing malformed batch handling distinct.

## Risks / Trade-offs

- **Additional latency and token usage** → negotiate only on explicit pre-acceptance rejection; allow at most two additional accepted turns after no-tool cutoffs.
- **Unknown provider error formats** → prefer a normal sanitized error over replaying an ambiguous request.
- **Catalogue drift** → tie coverage to known model IDs; unknown models negotiate down from the fallback.
