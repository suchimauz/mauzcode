# Design

## Context

See proposal.md for motivation. `codexUsage` assigns Session/Weekly by slot; `codexWireWindowOf` adds a duration suffix but does not provide a machine-readable period. `/api/v1/quotas` uses label-prefix regexes and silently keeps only the first window per period. `claudeUsage` reads only `five_hour` and `seven_day`, so additional upstream quota records are already lost before the UI bridge.

`frontendBridge.modelUsage` preserves window fields via spread and calculates severity across all windows. `QuotaMatrix` uses `NavigationTooltip` and `QuotaTooltipBody`; `quotaTooltip` supplies the card's accessible text. Both expanded and compact paths need updates, including checks that currently equate missing standard periods with unmeasured quota.

This is a specification-only change until the proposal is agreed. Implementation must follow the repository's Apple Design guidance, existing React components and UI architecture; no new extension mechanism is needed.

## Goals / Non-Goals

**Goals:** Keep provider evidence separate from presentation; retain useful additional restrictions end to end; make the smallest accessible addition to the existing quota matrix.

**Non-Goals:** No duration inference from reset countdowns, fuzzy label parsing, provider model-name catalogue, raw payload display, new scheduling behavior or new tooltip library.

## Decisions

### 1. Add explicit metadata without removing existing usage fields

Extend normalized windows with an optional stable `id`, `period` (`fiveHour`, `weekly`, `monthly` when established), `scope` (`account`, `model`, `unknown`), optional provider-reported duration/model metadata, and per-window observation time for partial updates. Keep `label`, measurements and reset fields compatible. Metadata is optional at the SDK boundary for existing plugins; absence means unknown, not an implied general session.

`models.connections.usage` is the single normalization point between provider adapters and every consumer. It currently rebuilds each window from `label`, `usedPercent`, `remaining` and `resetAt` only, so it must validate and pass through the new fields (bounded strings, enum-checked `period`/`scope`, finite observation time) and drop invalid values rather than whole windows. Its window-count bound must stay but be large enough for general plus additional limits; truncation must never drop general windows in favour of extras.

Update all in-tree providers that currently supply standard periods (Claude, Codex, OpenCode Go) to emit explicit metadata. The custom provider and installed user plugins currently report no windows. Label-only providers are a deliberate breaking change: their reports stay valid, but every window without explicit metadata is shown only as an additional limit until its own adapter classifies it. Document this in the provider SDK. Do not infer metadata in the presentation layer, and do not add a label-based compatibility fallback.

Alternative rejected: repairing the Session prefix regex or parsing the `(7d)` suffix. It still conflates model-specific and account-wide limits and makes localized display text an API contract.

### 2. Normalize Codex periods from evidence and Claude scopes from source keys

For Codex, accept positive finite reported `limit_window_seconds` or `window_minutes`; normalize to seconds. If both are present they must agree. Map exactly 18000 to five-hour and 604800 to weekly; do not guess monthly semantics from arbitrary durations. Missing, malformed, conflicting and other durations remain unclassified, while valid measurements survive. General `rate_limit` windows have account scope; the primary/secondary key is source identity only, never a period. Reject null/non-finite utilization before numeric conversion can invent zero. Keep every valid `rate_limits` entry, not only the `codex` one: the `codex` entry supplies account-scope general windows, other entries keep their `limit_id`/name as identity and are additional (model scope when the entry names a model, otherwise unknown), even if their duration is a standard period. `codexQuota` inference-response observations are out of scope.

For Claude, explicitly classify `five_hour` and `seven_day` as general periods. Inspect other top-level quota-shaped records with finite numeric utilization and optional reset metadata, excluding null, disabled and unrelated objects. Preserve their source keys as stable identities and readable fallback labels; use provider-supplied names when available. Do not recursively traverse arbitrary response objects or hard-code a model allowlist. Recognized model-specific records carry model scope; otherwise scope stays unknown. Both are additional even if a weekly period is known.

The user's Fable5 name is an illustrative requirement, not a confirmed API field. Synthetic fixtures can use a clearly generic previously unseen model key; implementation should also use sanitized observed fixtures when available, without logging credentials or full account responses.

For OpenCode Go, classify its established five-hour, weekly and monthly windows explicitly and keep any other valid reported windows as additional with stable identities.

### 3. Preserve additional windows across partial Claude cache updates

Inspect the existing header-cache merge and usage cache before implementation. Header observations update only corresponding general-window identities; unrelated windows and their observation timestamps remain intact. Missing headers do not clear existing values. A successful full endpoint snapshot replaces the previous endpoint snapshot and removes omitted extras. Header-only refreshes must not extend the freshness of old additional windows or stop normal endpoint refreshes indefinitely.

Alternative rejected: rebuilding the complete usage array from the two general headers. It would make the new tooltip intermittently lose model-specific restrictions immediately after inference.

### 4. Partition windows once in the quota API

Keep the existing `{ updatedAt, accounts }` envelope and main `windows` map. Add `additionalWindows` with identity, label, measurements, reset, tone and available observation metadata. Map only unique explicit account-scope standard periods. Conflicting distinct windows for the same period all remain additional and leave that main cell empty; there is no first-wins or maximum-value guess.

Preserve existing overall severity across all valid windows, including extras. Determine quota/status kind from all windows, not just mapped columns. Preserve status-only and balance-only behavior. Escape provider text at rendering boundaries; never send raw provider payloads as tooltip HTML.

### 5. Extend the existing tooltip, not the main matrix

Keep the three existing columns. Add a small `+N` indicator within the existing quota trigger when additional windows exist, with accessible wording such as “N additional limits.” Do not nest a second button in the card. In `QuotaTooltipBody`, add an additional-limits section listing each label, measured percentage or remaining amount, reset when known, and explicit unknown values. Carry the same information into `quotaTooltip` for assistive technology and compact mode.

Reuse `NavigationTooltip`, retain keyboard focus and click behavior, support focus/hover and Escape, and allow moving the pointer into the popup. Bound the popup to the viewport with wrapping and an accessible overflow strategy for many limits; verify it with keyboard and pointer rather than relying on clipping. Preserve existing colors, reduced motion and typography. A tooltip with only additional windows is real usage, not “Quota not measured.”

Alternative rejected: adding dynamic columns for model-specific limits. It expands the sidebar unpredictably and obscures comparable account-wide periods.

## Risks / Trade-offs

- [Provider payloads evolve] → Preserve unknown valid quota-shaped records, restrict classification to explicit evidence and test malformed/unrelated records.
- [Legacy third-party adapters lack metadata] → Additive SDK fields, documented unknown-to-additional fallback and an adapter audit; never silently drop their limits.
- [Partial refresh makes old extras look fresh] → Per-window observation times, identity-based header merges and full-snapshot replacement tests.
- [Many extra limits overwhelm a hover surface] → Compact indicator, wrapping, viewport bounds, hoverable popup and keyboard/assistive-technology checks in both sidebar modes.
- [Concurrent OpenCode Go work touches usage] → Coordinate provider metadata changes with `add-opencode-go-provider`; retain its standard-window behavior and run its regression tests.

## Migration Plan

No database migration is planned. Implement SDK/provider metadata, cache handling, bridge/API and React support as one coordinated batch. Regenerate types if needed, hot-reload changed runtime namespaces/routes, validate changed runtime docs and run one full-project typecheck for the settled source state, preserving complete diagnostics. Run provider/API/frontend tests and browser checks. Do not archive the change until its tasks and acceptance scenarios are complete. Roll back the coordinated code batch if necessary; existing persisted credentials and configuration are unchanged.
