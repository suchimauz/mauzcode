# Tasks

## 1. Usage contract and provider compatibility

- [ ] 1.1 Inspect code slices/callers for usage producers and consumers, then add documented optional window identity, scope, period and observation metadata to SDK and bridge types; verify existing label-only reports remain accepted and are treated as unclassified in focused contract tests.
- [ ] 1.2 Audit supported built-in/plugin usage producers, including OpenCode Go, and add explicit metadata for their established general periods; document the label-only additional-window fallback and verify each provider's existing standard periods with focused tests. Coordinate overlapping OpenCode Go work before edits.

## 2. Codex normalization

- [ ] 2.1 Classify periods from reported seconds/minutes independently of slot and label; add and pass tests for weekly-only primary, conventional/reordered pairs, minutes-only input, missing/invalid/unsupported/conflicting durations and reset-countdown independence.
- [ ] 2.2 Preserve valid unknown-period windows and reject null/non-finite utilization without zero coercion; verify identity, usage and reset retention plus valid-sibling behavior in provider tests, and update affected normalization JSDoc.

## 3. Claude additional windows and cache

- [ ] 3.1 Preserve valid additional quota-shaped records with source identity and safe readable names; add and pass tests for general plus model-specific weekly limits, previously unseen model keys, additional-only reports, missing resets and malformed/null/disabled/unrelated records. Update provider normalization documentation.
- [ ] 3.2 Merge header observations only into corresponding general windows and preserve additional-window observation times; add and pass cache tests for missing headers, partial refresh, retained extras, full-snapshot removal and continued endpoint refresh despite inference traffic. Document the freshness contract.

## 4. Bridge and quota API

- [ ] 4.1 Partition explicit unique account-wide standard periods from additional windows without label regexes; add and pass API tests for Codex weekly primary, same-period model restriction, conflicting identities, unknown metadata and label-only reports.
- [ ] 4.2 Add the additional-window API collection and frontend types while preserving the envelope, main fields and existing status/balance behavior; document the additive contract and pass tests for additional-only accounts, null measurements, retained remaining amounts, observation metadata and aggregate severity across all windows.

## 5. Accessible additional-limit presentation

- [ ] 5.1 Extend existing expanded and compact quota triggers with a small additional-count indicator and tooltip section, preserving three main columns and click behavior; update both visual tooltip content and accessible text. Add and pass rendering tests for no extras, mixed limits, additional-only accounts, safe provider labels, unknown values and freshness.
- [ ] 5.2 Verify focus/hover access, Escape, pointer movement into the tooltip, long names, many entries, viewport bounds, light/dark themes and reduced motion; add interaction tests where supported and record browser verification for both sidebar modes, updating affected stories.

## 6. Integration validation

- [ ] 6.1 Hot-reload changed runtime functions and routes, regenerate types where needed and validate each changed runtime function's docs with strict validation and typecheck disabled; run one full-project typecheck for the settled batch, preserve complete diagnostics and distinguish pre-existing failures from new failures.
- [ ] 6.2 Run the relevant provider, cache, API and frontend suites together, inspect code quality for changed paths, and validate this OpenSpec change with `--strict`; record results and verify every delta scenario against implementation before marking the change complete.

## Workflow follow-up

- Agree the proposal before implementation; this task list is initially unchecked because only specification artifacts have been created.
- Archive only after implementation, verification and review are complete, then validate the merged specifications.
