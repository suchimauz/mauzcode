# Tasks

These tasks describe a later implementation stage. Approval to prepare this change does not authorize executing them.

## 1. Storage and owner API

- [ ] 1.1 Inspect relevant call slices and callers, then add the empty-default connection override migration and types; verify migration tests preserve existing rows and remove overrides with connection deletion.
- [ ] 1.2 Implement the atomic per-model patch through the public Models facade and owner-authorized CSRF-protected API; add tests for positive safe integers, null removal, invalid whole-patch rejection, missing connections and unauthorized requests.
- [ ] 1.3 Test concurrent different-model patches, same-ID isolation across connections, rename/restart persistence and temporary catalogue disappearance; document patch and last-write semantics in runtime JSDoc and verify strict metadata validation.

## 2. Effective resolution and runtime consumers

- [ ] 2.1 Add the shared precedence/provenance resolver and owner-facing metadata, preserving raw provider contextWindow and maxOutputTokens; verify override/provider/200000 fallback and reset against refreshed defaults in unit tests.
- [ ] 2.2 Integrate cached route resolution and budget/compaction consumers; verify no provider fetch, preserved disabled-route errors, updated next-calculation thresholds and unchanged native/summarizing selection.
- [ ] 2.3 Add regression tests proving refresh and discovery failures cannot overwrite overrides, saves do not invoke or interrupt inference/compaction, and no override parameter reaches upstream request bodies; update relevant runtime documentation.

## 3. Models UI

- [ ] 3.1 Add labelled per-model context inputs, effective value/source, independent Save, Reset to default and Discard; verify UI tests for fallback display, save, reset/discard distinction, validation and retained drafts after save failure.
- [ ] 3.2 Separate availability labels from context controls and retain drafts across refresh and disappearing rows; verify interaction tests for no accidental toggle, unchanged availability Save (N), refresh failures and pending absent-model edits.
- [ ] 3.3 Add concise local-budget help text and accessible error feedback; verify keyboard focus, theme and reduced-motion behavior using existing UI conventions and tests.

## 4. Integration verification

- [ ] 4.1 Exercise the full owner edit → persisted override → next budget/compaction calculation → reset flow, including small valid limits under existing eligibility guards; verify all spec scenarios with integration tests or recorded manual checks.
- [ ] 4.2 Hot-reload changed runtime functions, regenerate types when needed and validate each changed function with strict metadata checks; run one coordinated full-project typecheck after the batch settles plus targeted backend/frontend suites, preserving complete diagnostics and distinguishing pre-existing failures.
- [ ] 4.3 Run strict OpenSpec validation and review scope against the three delta specs; verify no global fallback, retry-policy or provider-capacity behavior changed and no source edits from unrelated active changes were overwritten.

## Workflow follow-up

- Obtain separate authorization before implementation. This delivery stops after preparing and validating specification artifacts.
- Archive only after implementation, scenario verification and the project's review requirements have been satisfied; do not archive during this specification-only stage.
