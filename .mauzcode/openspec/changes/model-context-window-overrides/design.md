# Design

## Context

See proposal.md for motivation. `models.inference.resolveRoute` currently reads cached model metadata; `compaction.contextWindow` supplies 200,000 when absent. `ModelsPanel` has per-connection model lists and local availability drafts. The existing row-wide switch label must be narrowed before adding interactive controls. `llm-model-cache` remains the contract for discovery; owner configuration is not discovery data. Other active changes concern retries and new-session titles, so their behavior must remain untouched.

## Goals / Non-Goals

**Goals:** one effective limit and explicit provenance, durable connection-scoped configuration, backward-compatible metadata and predictable local editing.

**Non-Goals:** upstream capacity guarantees, new provider parameters, changed retry policy, new automatic-compaction scheduling, guessing Qwen deployment limits, or executing implementation as part of this artifact delivery.

## Decisions

### Store overrides separately from discovery

Add a `model_context_overrides` JSONB object on `llm_connections`, defaulting to `{}`. Keys are exact model IDs and values are positive safe integers. Connection UUID provides stable ownership across rename; deletion naturally removes overrides. Keep entries for absent models. A separate table would work but adds lifecycle joins for a small connection-owned mapping; writing into `models_cache` would incorrectly mix configuration and refreshable observations.

Implement a patch operation inside the models module, exposed through its public facade and the existing Models API authorization/CSRF boundary. Accept connection ID plus explicitly supplied model entries containing a number or null. Validate the complete patch before an atomic locked merge or equivalent database update. Never replace the entire mapping from a stale browser copy. Serialize concurrent updates so different-model writes are not lost; same-model writes use last successful write. Missing connections fail without creating records. Do not enforce presence in a warm catalogue: discovery can omit configured models. A saved override does not grant availability.

### Keep metadata and effective policy distinguishable

Preserve `ModelInfo.contextWindow` as provider metadata. Extend the owner-facing catalogue/route information with a structured limit description: nullable provider and override values, effective token value, and source. Compute the description after reading cache and overrides; never persist it into `models_cache`. Route resolution remains network-free, with existing disabled/missing-route errors. Keep `maxOutputTokens` unchanged.

Use the models-owned resolver as the sole precedence implementation. Let the resolved route's existing `contextWindow` represent the effective value for established consumers, and attach provenance separately. Update `compaction.contextWindow` and audit all budget displays/callers to avoid a second divergent fallback. This changes optional route metadata behavior deliberately; add contract regression tests. Existing provider-supplied limits remain defaults, not ceilings imposed on an explicit override.

### Separate context drafts from availability drafts

Use independent context-limit drafts per model ID and explicit context Save / Reset to default / Discard actions. Existing availability Save (N) semantics stay unchanged; each save affects only its own concern. Render input and buttons outside the availability label. Show persisted effective value/source separately from an unsaved draft; reset sends null only after Save. Disable duplicate submits, announce errors and retain drafts on failure.

Refresh provider data without replacing the context draft map. If a draft's model disappears, show it in a retained pending-edits area with explicit save/discard actions rather than silently dropping it. Validate numeric input locally for feedback and repeat validation server-side; do not silently round or coerce strings. Use existing UI tokens and accessibility patterns, not a new visual framework.

### Apply on the next calculation

A successful save updates storage and invalidates/reloads owner-facing model state using existing Models refresh conventions. Subsequent route and budget resolution sees the new override without restarting agents. Do not interrupt active sampling or schedule compaction on save. Existing percentage, absolute threshold, eligibility guards and native compaction support remain in force. Low valid limits may interact with existing minimum-size guards; do not promise that every context overflow is prevented. This is local budgeting, not a provider setting.

## Risks / Trade-offs

- Incorrect owner-entered limits → show provenance and explain upstream capacity remains unchanged; provide reset.
- Stale cache or temporarily missing metadata → use the existing cache policy; overrides remain authoritative and retained.
- Small limits versus existing compaction guards → preserve current guards and test boundary behavior; no hidden clamping of saved values.
- Concurrent saves → atomic patch merge prevents unrelated-model loss; same-model last-write behavior is explicit.
- Catalogue refresh overwriting drafts → keep draft state independent of refreshed rows.
- Contract ripple across context UI → inspect `code.slice` and `code.callers` before editing, test consumers and preserve provider metadata separately.

## Migration Plan

During the later implementation stage, add the empty-default JSONB migration before deploying readers/writers. Existing connections retain provider-derived or fallback behavior without backfill or provider calls. Reload runtime functions, regenerate types for added files, validate changed function docs and run one coordinated full-project typecheck after edits settle, plus targeted backend/UI tests.

Rollback application code can leave the additive column intact; old code ignores it and uses previous default behavior. Do not automatically drop stored overrides on rollback. No migration, reload, source changes or rollout are performed in this specification-only delivery.
