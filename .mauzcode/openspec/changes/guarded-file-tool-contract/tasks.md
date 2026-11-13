# Tasks

These are future implementation and verification tasks, not authorization to implement now. Every task remains unchecked: writing this change and prior scratch experiments do not complete production work. Requirement names below refer to this change's three capability deltas.

## 1. Establish caller and support boundaries

- [ ] 1.1 Inventory current read/edit/write entry points, indexed callers, native serializers, result limiters, Files/Canvas save consumers, direct filesystem writers, and live compatibility transports; verify a delivered inventory distinguishes participants, bypasses, and documentation-only marker references.
- [ ] 1.2 Capture baseline tests for ordinary/range/hashline/image reads, local/SSH paths, literal/anchor semantics, and current save authentication/ownership/CSRF; verify tests reproduce the relevant current behavior and document failures without claiming guarded support.
- [ ] 1.3 Record the supported platform/host identity and metadata matrix, current output limits, and explicit fail-closed cases; verify the matrix covers aliases, links, parent replacement, ownership/ACLs/xattrs, UTF-8, long lines, and remote acknowledgment behavior required by the design.

## 2. Implement receipt identity, authorization, and lifecycle

- [ ] 2.1 Add a bounded opaque receipt service using trusted owner/session/workspace/host context, canonical identity, exact-byte version, and service epoch; verify unit tests reject foreign ownership, session/workspace/host changes, guessed tokens, and target substitution without disclosure, and document each field's purpose.
- [ ] 2.2 Add current authorization checks for issuance, use, replay, and conflict evidence; verify revocation tests and browser-vs-agent scope separation prevent mutation and content leakage after access changes.
- [ ] 2.3 Implement five-minute default TTL, eviction/epoch invalidation, active/consumed/conflicted states, and exact successful-request replay; verify expiry, restart, changed payload, and concurrent duplicate tests, and document the boundary excluding crash-proof exactly-once.
- [ ] 2.4 Capture stable byte revision and file identity without treating display normalization as content; verify same-bytes replaced identity, mutation during read, and CRLF/Unicode fixtures produce correct receipts or safe failure.

## 3. Bind evidence to final delivered read scope

- [ ] 3.1 Update existing read output to include scoped editable evidence while retaining supported text, range, hashline, image, and host-aware inspection; verify native read regression tests and document the new output shape and no-receipt cases.
- [ ] 3.2 Integrate receipt finalization/narrowing with actual model/browser response bounding and tool-result storage; verify late truncation, stored-result previews, and generic history retrieval cannot expose a receipt covering hidden content.
- [ ] 3.3 Maintain exact mappings from displayed lines/text to source bytes and classify full versus partial evidence; verify hidden/all-match spans, edge visibility, empty text, CRLF, missing final LF, and invalid UTF-8 cases.
- [ ] 3.4 Preserve documented production limits rather than copying prototype caps, and implement safe long/minified-line handling; verify fully delivered supported lines remain editable while clipped/unsupported content never gains hidden-byte or full-replacement authority, with user-facing reread guidance.

## 4. Build the shared local conditional commit path

- [ ] 4.1 Separate validated byte transformation from publication in the current file services; verify literal and anchored operations can calculate results without an unchecked target write, and document the internal precondition contract.
- [ ] 4.2 Implement safe canonical target identity and bounded cross-process coordination for existing files and absent create targets; verify multi-process alias, create-vs-create, stale-update, parent replacement, and unsupported link tests.
- [ ] 4.3 Add expected-version/identity and expected-absence validation inside the critical section, preparation, final revalidation, and single-file atomic publication; verify fault injection before publication leaves the target unchanged and readers do not observe partial new bytes.
- [ ] 4.4 Preserve required permission bits and supported ownership/ACL/xattr metadata or reject before publication; verify the declared platform matrix with executable-file and unsupported-metadata tests, and document unsupported cases.
- [ ] 4.5 Implement bounded lock waiting, safe cleanup, and conservative crash/orphan handling without age-only lock stealing; verify live-lock timeout and owner-crash tests and deliver operator recovery guidance.
- [ ] 4.6 Add applied/not-applied/unknown commit-state reporting, durability uncertainty, and success-record timing; verify publication-before-response, fsync failure, and retry reconciliation tests do not cause blind double application.

## 5. Migrate the existing edit and write tools

- [ ] 5.1 Replace current edit input validation with readId plus explicit literal/anchor modes and no path/host override; verify native schema and backend tests reject mixed fields, unknown fields, empty/no-op/overlapping operations, and guessed/hidden anchors.
- [ ] 5.2 Enforce literal uniqueness/all-match scope and anchor/range visibility against the receipt snapshot; verify every match is visible, batch errors publish nothing, and target identity/precondition changes conflict even when a substring or line hash still matches.
- [ ] 5.3 Connect current edit to the shared conditional writer and retire consumed/conflicting receipts; verify native literal/anchor parity, follow-up fresh-read requirements, exact-success replay, and EOL/final-newline preservation.
- [ ] 5.4 Change current write to explicit create-if-absent and full-receipt replace branches; verify create races, stale overwrite, partial receipt denial, existing-target conflicts, and successful replacement replay without unconditional fallback.
- [ ] 5.5 Update tool descriptions, schemas, and promptGuidelines to describe the current names' new behavior, compatible batching, and safe recovery; verify transport-specific schema tests and documented examples agree with server validators, including providers without schema-union enforcement.
- [ ] 5.6 Implement bounded fresh conflict evidence and actionable outcome mapping; verify no automatic semantic rebase, no content outside the original coordinates, no disclosure after revocation, and correct behavior when the file shrinks or lines shift.

## 6. Bring SSH writers to the same supported contract

- [ ] 6.1 Extend the remote backend with receipt-compatible host/canonical identity and current-byte checks inside shared coordination; verify host aliases, replaced identities, participating remote writers, and conditional creation do not bypass the guard.
- [ ] 6.2 Implement supported remote metadata preservation, preparation/publication cleanup, lock timeout/crash behavior, and acknowledgment reconciliation; verify disconnect-before/after-publication and uncertain-result tests never imply confirmed nonapplication without evidence.
- [ ] 6.3 Execute the local-equivalent remote acceptance matrix on declared supported host configurations; verify unsupported guarantees explicitly disable guarded mutation while authorized read-only inspection remains available, and publish the support/limitation documentation.

## 7. Migrate browser saves and remaining participating callers

- [ ] 7.1 Move Files POST/PUT saves to explicit conditional creation/replacement as applicable; verify stale expectedContent is checked inside commit and authentication, ownership, authorization, and CSRF tests cover each live route rather than inheriting assumptions from another route.
- [ ] 7.2 Move Canvas saves and relevant browser read evidence to the same commit path; verify save-vs-agent-edit and save-vs-save races preserve the winner and provide authorized bounded conflicts without weakening tab/workspace ownership.
- [ ] 7.3 Update FilesPage/CanvasFile data transports only as needed for revision/conflict semantics; verify authorized request shapes, CSRF handling, and existing focus/accessibility/theme behavior, and document migration without adding a visual redesign.
- [ ] 7.4 Migrate all remaining indexed service callers and verified compatibility transports to explicit preconditions; verify no declared participant retains unchecked write fallback and document direct Bun/node, shell/editor, rename/delete, and generator nonparticipants separately.
- [ ] 7.5 Test current-schema activation with old in-flight calls and persisted conversations; verify legacy path-only edit/unconditional write requests fail with reread guidance, tool metadata refreshes for subsequent turns, and historical messages are not rewritten.

## 8. Integration, validation, and rollout gates

- [ ] 8.1 Run an end-to-end scenario matrix across the three specs using real tool handlers and local/SSH/browser participants; verify ownership/scope isolation, retries, image/text regressions, conditional create/replace, and single-file publication guarantees with recorded results.
- [ ] 8.2 Run repeated multi-process contention tests and an explicit uncoordinated check-to-publication race; verify cooperating updates are preserved while the external-race result is documented as a negative guarantee, not a successful protection claim.
- [ ] 8.3 Compare the new contract with representative independent repository editing tasks using actual native tool transports; verify final bytes/tests, preservation of other writers' changes, bounded recovery, token/request costs, and absence of hidden-reference feedback before making performance claims.
- [ ] 8.4 Complete runtime authoring validation for the settled implementation: create new runtime functions through createFunction, regenerate types only for added/removed files, hot-reload changed namespaces, refresh touched routes, and strictly validate changed function docs without per-function typechecks; verify one coordinated full-project typecheck preserves complete diagnostics and distinguishes new errors from pre-existing ones.
- [ ] 8.5 Audit actual writer participation and platform support against the inventory, update release/migration/rollback documentation, and verify activation is blocked for any declared participant or backend missing its acceptance gates; rollback must not silently restore unsafe mutation behind the guarded schema.
- [ ] 8.6 Re-run strict OpenSpec validation and check proposal/design/tasks/scenario consistency against the implemented behavior; verify every implementation checkbox is supported by recorded evidence before proposing completion.

## Workflow follow-up

- Implementation requires separate explicit authorization; this specification-only work does not execute the checklist.
- Do not commit, push, apply, or archive as part of preparing this change. Any later archive or outward action follows its own user authorization and project workflow.
