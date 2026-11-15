# Tasks

## 1. Usage contract and provider compatibility

- [x] 1.1 Inspect code slices/callers for usage producers and consumers, then add documented optional window identity, scope, period and observation metadata to SDK and bridge types; verify existing label-only reports remain accepted and are treated as unclassified in focused contract tests.
- [x] 1.2 Extend `models.connections.usage` normalization to validate and pass through window metadata (bounded identity/label strings, enum-checked period/scope, finite observation time), dropping invalid fields rather than whole windows and never truncating general windows in favour of extras; add and pass tests that metadata survives normalization and the 60 s cache.
- [x] 1.3 Audit supported built-in/plugin usage producers, including OpenCode Go, and add explicit metadata for their established general periods; keep other valid windows from every provider as additional with stable identities; document in the provider SDK that label-only windows are shown only as additional limits (deliberate breaking change, no label fallback) and verify each provider's existing standard periods with focused tests. Coordinate overlapping OpenCode Go work before edits.

## 2. Codex normalization

- [x] 2.1 Classify periods from reported seconds/minutes independently of slot and label; add and pass tests for weekly-only primary, conventional/reordered pairs, minutes-only input, missing/invalid/unsupported/conflicting durations and reset-countdown independence.
- [x] 2.2 Preserve valid unknown-period windows and reject null/non-finite utilization without zero coercion; verify identity, usage and reset retention plus valid-sibling behavior in provider tests, and update affected normalization JSDoc.
- [x] 2.3 Keep every valid `rate_limits` entry, not only `limit_id: codex`: non-codex entries are additional windows with their limit identity and model/unknown scope even when their duration is standard; add and pass tests for multiple entries, a same-period model limit and malformed entries. Do not change `codexQuota`.

## 3. Claude additional windows and cache

- [x] 3.1 Preserve valid additional quota-shaped records with source identity and safe readable names; add and pass tests for general plus model-specific weekly limits, previously unseen model keys, additional-only reports, missing resets and malformed/null/disabled/unrelated records. Update provider normalization documentation.
- [x] 3.2 Merge header observations only into corresponding general windows and preserve additional-window observation times; add and pass cache tests for missing headers, partial refresh, retained extras, full-snapshot removal and continued endpoint refresh despite inference traffic. Document the freshness contract.

## 4. Bridge and quota API

- [x] 4.1 Partition explicit unique account-wide standard periods from additional windows without label regexes; add and pass API tests for Codex weekly primary, same-period model restriction, conflicting identities, unknown metadata and label-only reports.
- [x] 4.2 Add the additional-window API collection and frontend types while preserving the envelope, main fields and existing status/balance behavior; document the additive contract and pass tests for additional-only accounts, null measurements, retained remaining amounts, observation metadata and aggregate severity across all windows.

## 5. Accessible additional-limit presentation

- [x] 5.1 Extend existing expanded and compact quota triggers with a small additional-count indicator and tooltip section, preserving three main columns and click behavior; update both visual tooltip content and accessible text. Add and pass rendering tests for no extras, mixed limits, additional-only accounts, safe provider labels, unknown values and freshness.
- [x] 5.2 Verify focus/hover access, Escape, pointer movement into the tooltip, long names, many entries, viewport bounds, light/dark themes and reduced motion; add interaction tests where supported and record browser verification for both sidebar modes, updating affected stories.

## 6. Integration validation

- [x] 6.1 Hot-reload changed runtime functions and routes, regenerate types where needed and validate each changed runtime function's docs with strict validation and typecheck disabled; run one full-project typecheck for the settled batch, preserve complete diagnostics and distinguish pre-existing failures from new failures.
- [x] 6.2 Run the relevant provider, cache, API and frontend suites together, inspect code quality for changed paths, and validate this OpenSpec change with `--strict`; record results and verify every delta scenario against implementation before marking the change complete.

## Workflow follow-up

- Agree the proposal before implementation; this task list is initially unchecked because only specification artifacts have been created.
- Archive only after implementation, verification and review are complete, then validate the merged specifications.
