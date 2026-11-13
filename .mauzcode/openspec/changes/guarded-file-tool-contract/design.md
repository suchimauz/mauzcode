# Design

## Context

See `proposal.md` for motivation and scope. This document designs a change to the current tool names, not a parallel experimental tool family. It is not implementation authorization.

### Current behavior verified in source

- `src/tools/$tool_read.md` and `src/tools/read.ts` expose path/host and line options. Text reads currently return strings; image reads use content attachments. Plain text rendering normalizes CRLF for display. No receipt identifies the version delivered to the agent.
- `src/tools/$tool_edit.md` combines literal and anchored fields in one operation schema. `src/tools/editValidate.ts` rejects mixed families and no-op literal replacements. The guideline requiring all changes to one file in one call does not explain this restriction.
- `src/files/applyEdits.ts` reads, transforms, and writes; only remote edits pass expectedContent. Local `src/files/write.ts` calls Bun.write without a version check or lock, so two writers can lose updates.
- `src/remote/writeFile.ts` uses a per-target mkdir lock, an optional expected-content check, and temporary-file rename. Its current content fingerprint and path resolution do not establish receipt identity from the agent's preceding read. An unconditional remote write remains an overwrite.
- `src/files/$route__PUT.ts` and Canvas save compare content before calling the writer. That early comparison is not a local commit guard. `src/files/$route__POST.ts` is a legacy form write without an expected version in its body; its live authentication/CSRF enforcement must be traced, not assumed from another route.
- Marker syntax remains in tool markdown, but the previously referenced `src/agent/markerArgs.ts` is absent. A migration must inventory real transports rather than revive a nonexistent consumer.

### Evidence and its limits

Synthetic Astra-medium experiments compared literal, anchors, strict context patches, and combined modes. All final challenge candidates reached 12/12; a version-guarded dual prototype produced shorter outputs and lower observed latency but used more input tokens and requests than literal-only. Those observations support testing the contract, not a universal performance claim or adoption of Codex's implementation.

A separate temporary contract prototype passed 22 tests, including six cooperating processes, and a native-engine smoke check. Its negative test reproduced a lost update from an external writer after the last check. Its in-memory receipts, small view limits, local-only support, and incomplete metadata handling are NOT production regression coverage or requirements to copy verbatim. This change is self-contained; implementation does not depend on ignored scratch files.

## Goals / Non-Goals

**Goals:**
- Bind mutations to evidence actually delivered to an authorized caller.
- Preserve existing literal/hashline editing semantics where compatible with strict scoped validation, without forcing all changes through a text patch parser.
- Share conditional publication across tools, local/SSH services, and declared browser save paths.
- Give deterministic recovery information without automatic semantic rebasing or unnecessary disclosure.
- Make safe migration, support gates, and known concurrency limits explicit.

**Non-Goals:**
- Multi-file transactions, universal CAS against unrelated processes, or crash-proof exactly-once mutation.
- A permanent alternate read/edit/write set, Codex integration, or new patch language.
- Treating a receipt as permission, treating frontend state as authorization, or removing required confirmations elsewhere.
- Automatically adding prototype caps, changing read-only capabilities, or broadly refactoring the UI.

## Decisions

### 1. Keep current tool names and make discriminators explicit

Conceptual wire contracts:

```ts
read({ path, host?, startLine?, endLine?, maxLines?, hashline? })
// Supported editable text -> { status: 'read', path, host?, readId,
//   view: { scope, completeFile, truncated, content, anchors? }, expiresInMs }
// Images/other inspection retain their supported result behavior without text authority.

edit({ readId, mode: 'literal', edits: [{ oldText, newText, all? }] })
edit({ readId, mode: 'anchor', edits: [{ op, anchor, endAnchor?, text? }] })

write({ mode: 'create', path, host?, content })
write({ mode: 'replace', readId, content })

// Internal service keeps its signature; preconditions are optional:
files.write({ path, host?, content, expectedContent?, expectedVersion?, readId?, ifAbsent? })
```

`edit` and replacement `write` have no independent path/host or caller-supplied owner. Agent/session/workspace identity comes from trusted execution context. An empty or foreign session cannot be replaced with a default privileged context. Trusted internal and browser callers use their own authenticated context and the same conditional writer, not forged agent receipts.

Literal and anchor operations are homogeneous, visible, nonoverlapping, and refer to the original snapshot within a call. Ambiguous insertion/range intersections are rejected instead of receiving a hidden precedence rule. Unknown fields and legacy envelopes fail before mutation.

Prefer discriminated schema branches when the provider supports them. For restrictive provider schemas, expose the supported discriminator and fields but enforce branch exclusivity in the server validator. Provider grammar support never changes backend semantics. Update descriptions and prompt guidance to explain when literal or anchors fit; remove the contradictory unconditional batching instruction.

**Alternative rejected:** separate permanent tools for each mode or patch-only replacement. That expands tool competition or discards a useful pinpoint-edit mechanism without evidence of better correctness.

### 2. Use opaque, scoped, short-lived read receipts

A receipt store entry contains a random opaque identifier, issuing service epoch, principal, agent/session or browser view context, workspace identity, resolved host identity, canonical target identity, original byte revision, displayed scope/mapping, issue/expiry time, and lifecycle state. Default lifetime is 30 minutes, sliding on each authorized use. Receipts are stored in the framework Postgres store (one table keyed by opaque id, owner and agent/session) with a bounded number of live receipts per agent, so they survive restart and transcript compaction. Expired or unavailable receipts on a still-authorized target return a new readId with bounded fresh content of the same scope, so recovery is one retry. Several range reads of one unchanged version combine into complete-file evidence; a version-only read (`read({ path, versionOnly: true })`) yields replace-only evidence without content.

Use a collision-resistant digest of exact file bytes plus stable filesystem identity; do not accept the old path's content hash alone as identity. Same bytes on a replaced inode conflict. A full-file digest is conservative: unrelated changes can cause conflicts. Identical bytes on the same identity after an undetected external ABA are not promised to expose historical intermediate states; this is a snapshot guarantee, not an audit log.

Authorization is reevaluated on issuance, mutation, replay, and conflict evidence. Browser receipts/expected-version evidence are scoped to the authenticated viewer and target context, not transferable to an agent's session. Switching workspace/host invalidates use under the old context. Tokens are never bearer permissions for arbitrary paths.

Retain an exact successful request fingerprint and result while the consumed receipt remains live; repeated identical requests replay without writing. Different requests on consumed receipts fail. Do not issue a new full receipt merely from an applied summary: follow-up work needs a fresh delivered snapshot. Creation has no read receipt; retrying an already successful create encounters existing-target conflict rather than overwriting. Exactly-once across crash is explicitly excluded.

**Alternative rejected:** making the model compute/copy a SHA-256 plus path. Opaque receipts prevent target substitution, reduce protocol burden, and preserve knowledge of what was actually shown.

### 3. Bind authority at the final output boundary

Reading bytes and generating an unrestricted token is insufficient if the tool result is later truncated. Compute exact byte/line mappings from original content; formatting and hashline annotations remain views. Finalize or narrow an editable receipt only when the bounded response is delivered to the model/browser through the relevant transport. If a generic result limiter can clip it without a verifiable scope, withhold editable authority and provide bounded reread guidance.

A stored-output UUID is not an edit receipt. History/result viewers do not silently upgrade authority; callers needing more evidence use the receipt-aware read path. Full replacement requires complete delivered content. Multiple partial reads are not automatically merged into full-file authority in this version; a verified complete read is required. Large unsupported rewrites fail explicitly rather than bypassing the guard with write.

Literal matches map back to exact visible bytes; all:true cannot reach hidden matches. Anchor references must have been delivered for that receipt. Edge sentinels require the corresponding visible edge. Original EOL and final-newline metadata are kept separately from displayed lines. Invalid UTF-8/binary content cannot receive authority through lossy decoding.

Do not adopt the prototype's 80-line/16-KiB caps. Retain supported production read options and inspect current transport limits during implementation. Document final limits and tests before enabling the contract; clipped portions remain noneditable regardless of the chosen limit. A long/minified line delivered completely can support literal edits; a clipped line cannot authorize its hidden suffix.

**Alternative rejected:** treating successful file I/O or a stored full result as proof that the model saw the entire file.

### 4. Introduce one participating conditional commit service

Expose an internal operation with an explicit authorized target and precondition: expected snapshot identity/version for edits/replacements, or expected absence for creation. It owns coordination and publication; helpers cannot downgrade failure to an unconditional write. Browser reads for Files/Canvas replacement must issue an opaque server-established revision bound to the authenticated viewer and target context, canonical file identity, and exact-byte version captured together at read time. Saves must present that revision; the commit path reauthorizes it and checks both identity and version inside coordination. Browser expectedContent may remain an additional compatibility check, but cannot substitute for the revision or establish read-time identity from save-time state. Legacy replacement requests carrying only expectedContent must fail without publication and request a fresh read through the current contract. Replacing a file with a different inode containing identical bytes must produce conflict, not authorize saving over the replacement.

For supported local and SSH targets:
1. Resolve authorized target identity and participation domain safely. For creation, include canonical parent identity and entry name; verify absence under coordination.
2. Acquire a bounded cross-process per-target lock shared by all declared participants.
3. Reauthorize and capture current bytes/identity inside the critical section. Compare the read receipt or absence precondition.
4. Validate all operations/scope and calculate the complete new bytes using the existing transformation engine, separated from unchecked publication.
5. Prepare an exclusive same-directory temporary file, preserve supported metadata, and synchronize its contents as required by the platform policy.
6. Revalidate identity/version immediately before publication and atomically publish one file; confirm directory durability where supported.
7. Record the known result, release coordination safely, and retire/replay receipts as appropriate.

Do not take a path lock that can be evaded through a known supported alias. The local and remote backends must agree on canonical target semantics for their respective participating writers. Creation cannot use rename-over-existing as its absence check outside the protected protocol.

The exact lock primitive is backend-specific; externally testable semantics are fixed: cross-process exclusion, bounded wait, no age-only lock stealing, and no silent stale overwrite. Existing SSH mkdir-lock infrastructure is a starting point, not proof of parity. Failure to prove safe ownership after a crash yields busy/unavailable with operator recovery guidance.

**Alternative rejected:** only an in-process mutex, only an early UI comparison, or calling the existing local unconditional writer after validation. None closes the participating-writer race.

### 5. Fail closed on unsupported filesystem identity and metadata

A target must preserve both authorization and identity from resolution through publication. Reject unsupported symlink/hardlink or parent-replacement cases rather than maintaining superficially compatible unsafe behavior. If support is implemented, use a proven stable-target policy and a shared lock domain across supported aliases; hostile-directory race tests are a release gate, not an assumption that realpath once is sufficient.

Preserve ordinary mode bits. Ownership, ACLs, extended attributes, and platform-specific metadata need an explicitly tested preservation policy; reject before publication when required metadata cannot be preserved. A blanket file replacement that silently drops metadata is not a supported guarded write. Single-file atomic publication does not make multi-file edits a transaction.

Remote host aliases require backend identity or explicit rejection when identity cannot be established; unsupported remote mutation remains unavailable while read-only inspection stays supported.

**Alternative rejected:** claiming general CAS from content checks and atomic rename. Uncoordinated shell/editor writes can still race after the final check. Direct Bun/node writes, code generators, rename/delete, and external editors are outside the guarantee until they participate. Retain a negative-guarantee test demonstrating that window.

### 6. Structure outcomes and recovery without semantic auto-retry

| Outcome | Meaning and caller action |
|---|---|
| `applied` | Confirmed publication; include byte count/target and `durability: confirmed | uncertain`. A replay returns the recorded result without mutation. |
| `conflict` | Confirmed no publication by this request; retire the old receipt. Include bounded currently authorized evidence and new readId only within the original coordinates. |
| `invalid` | Input/mode/scope/match error; confirmed no publication; actionable correction or reread guidance. |
| `expired` | Known receipt lifetime elapsed; no publication; reread. |
| `unavailable` | Unknown/foreign/unauthorized receipt, unsupported safe target, or unresolved target. Do not leak protected details. Include a non-sensitive reason when appropriate. |
| `busy` | Could not acquire safe coordination in time; no publication; bounded retry or report contention. |

Include a publication state discriminator (`not-applied`, `applied`, `unknown`) rather than equating all errors with no write. For a lost SSH acknowledgment where the outcome cannot be established, use unavailable with `commitState: unknown` and reconciliation guidance; never automatic replay. A known rename followed by fsync failure remains applied with uncertain durability.

Fresh conflict evidence uses the original delivered coordinates and current permissions. If the file shrank, content cannot be bounded, or access changed, do not expand the scope. After line shifts, new text at those coordinates is not asserted to be the previous semantic target. The model or human must reconsider identity/preconditions; the engine does not automatically rebase their change.

**Alternative rejected:** returning only a stale-anchor message followed by an unconditional auto-read/reapply loop, or reporting a committed-but-unacknowledged write as a harmless retryable validation failure.

### 7. Migrate all declared write participants and live transports

| Surface | Responsibility |
|---|---|
| `src/tools/$tool_read.md`, `$tool_edit.md`, `$tool_write.md`; tool validators/handlers | Current names, new shapes, exact guidelines, structured status mapping; no legacy mutation fallback |
| `src/files/read.ts`, `readHashline.ts`, browser read data and tool-result formatting | Exact snapshot and delivered scope; ordinary/image reading preserved |
| `src/workspace/target.ts`, `src/files/resolveSafe.ts`, `src/canvas/fileTarget.ts` | Authorized canonical host/workspace/target identity; no receipt target substitution |
| `src/files/applyEdits.ts`, `src/files/write.ts` | Transformation separated from publication; all participating writes carry explicit preconditions |
| `src/remote/writeFile.ts` and its callers | Remote coordination, identity, metadata, safe outcome reconciliation, parity gates |
| Files POST/PUT and Canvas save routes | Current auth/CSRF/ownership, expected-version validation inside commit, conflict response mapping |
| CanvasFile/FilesPage data transports | Consume versions/conflicts without making the frontend a security boundary; no visual redesign required |
| Native tool serializers and any verified compatibility consumer | Same backend restrictions despite provider schema differences; no fabricated receipt from old history |

Before changing signatures, inspect indexed callers and direct filesystem writes separately. Grep quoted marker syntax is not proof of a live call path. Trusted code generation/internal writers using affected services must be migrated to explicit conditional operations or identified as nonparticipants with guarded guarantees withheld for their bypass path; they cannot inherit an implicit unconditional default from the guarded service.

Compatibility of `files.write`: the signature does not change and about thirty existing callers keep working. Every call goes through the shared coordination and atomic publication; calls without preconditions are classified as unverified writes. The system prompt line in `src/agent/buildLlmRequest.ts` that recommends `files.write` for content generated in eval is changed to recommend `write` create/replace. `bash`, direct `Bun.write`/`node:fs` and external editors are declared nonparticipants.

**Alternative rejected:** shipping a guarded edit while leaving write, browser save, or an advertised compatibility route as an overwrite escape hatch. Breaking all `files.write` callers at once was also rejected; coordination plus optional preconditions removes interleaving loss without a mass migration.

### 8. Roll out through a warn/enforce setting in stages

A declared `files.guard` setting (`warn` | `enforce`, default `warn` during rollout) controls legacy forms. In `warn`, path-only `edit` and path-and-content `write` still work: they run inside the writer critical section against the current file, return a warning, a new readId, and `verified: false`. In `enforce` they are rejected with migration guidance. Rollback means switching to `warn`; coordination and atomic publication stay on.

Conflicts remain whole-file. Conflict responses state whether the original scope changed, list changed line ranges as coordinates only, and include a new readId with the bounded fresh scope, so an unaffected edit is repeated in one call. Per-range versioning is deferred.

Stages:
1. Local `read`/`edit`/`write`, `files.write`, Files/Canvas saves, receipts and `files.guard=warn`.
2. SSH writers on top of the existing `remote.writeFile` lock and temp-file rename; until then SSH keeps current behavior under `warn` (marked unverified) and fails closed under `enforce`.
3. Representative measurements of conflict/recovery cost, then default switches to `enforce`.

## Risks / Trade-offs

- Full-file versioning conflicts on unrelated changes → return bounded fresh evidence; measure recovery cost, do not weaken identity checks merely to lower error counts.
- Final output clipping can invalidate evidence assumptions → finalize/narrow receipts at delivery; fail closed if delivery cannot be proven by the transport.
- Large complete rewrites can exceed delivery limits → retain inspection, reject unsupported full authority, and use scoped targeted edits rather than a hidden write bypass.
- Tokens/context become stale after compaction, workspace switch, or restart → explicit scope/epoch/TTL checks and reread, without transcript mutation.
- Same-content ABA on the same external identity is not a history detector → document snapshot semantics; do not claim every intervening external event is observable.
- Nonparticipating writer races remain → inventory boundaries, enforce cooperation where possible, preserve the negative-guarantee test and honest documentation.
- Post-commit acknowledgment/durability failures invite duplicate work → explicit commitState, live replay records, and reconciliation before any new mutation.
- Remote identity, aliases, filesystem APIs, or metadata differ by host → supported-backend acceptance gates; no unconditional fallback.
- Breaking tool shapes affect in-flight sessions and clients → regenerate schemas on the next turn, reject queued legacy mutations safely, and keep historical messages intact.
- Broad writer migration can break internal generation/save workflows → inventory before edits, migrate callers with tests, and gate activation on complete participation.

## Migration Plan

1. Only after separate implementation approval, record a current caller/writer inventory and tests of existing text/image/SSH behavior. Confirm actual compatibility transports and current output limits; do not infer them from stale markdown.
2. Introduce internal receipt, transform, conditional publication, and structured-outcome services with isolated unit/integration tests. Preserve current tool names as the eventual activation target; no permanent duplicate public tools.
3. Migrate local and SSH participating services and browser save routes, including explicit create/replace and checks inside commit. If a backend cannot meet the contract, expose it as read-only/unavailable for guarded mutation until its gates pass.
4. Update current read/edit/write metadata, validators, native schemas, documentation, and caller transports together. Existing queued path-only edits and legacy unconditional writes follow `files.guard`: applied with a warning under coordination in `warn`, rejected with reread/new-schema guidance in `enforce`. Do not rewrite prior messages or silently manufacture receipts.
5. Validate delivery-scope integration, owner isolation, platform/metadata cases, and every declared writer path. Run concurrency and negative-guarantee tests. Guarded support is not declared active before these gates pass.
6. Hot-reload the settled runtime changes and refresh touched routes/types as appropriate, using one coordinated full-project typecheck and complete diagnostics. Keep UI architecture/security requirements when changing browser transports.
7. Observe correctness, safe conflict recovery, and bounded evidence on representative repository tasks. Synthetic benchmark improvements are not rollout criteria by themselves.
8. If rollback is necessary, switch `files.guard` to `warn` or disable the affected mutation paths; never reactivate uncoordinated overwrite semantics. Read-only inspection and prior transcripts remain available.

## Implementation Acceptance Map

The normative scenarios live in the three capability deltas. The implementation checklist must cover them all, with particular emphasis on:
- Authenticated owner/session/workspace/host isolation, revocation, path substitution, and receipt epochs/TTL.
- Partial, transport-clipped, stored-result, long-line, image, UTF-8/CRLF/final-newline, and hidden-match behavior.
- Same-bytes new identity, repeated text, positional reordering, conditional edits, mixed/no-op/overlap rejection, and exact retry.
- Create-vs-create, save-vs-edit, multiple participating processes, lock crash/timeout, publication before response, and durability/SSH acknowledgment failure.
- Metadata/alias/hardlink/symlink/hostile-directory support gates and no partial file publication.
- A deliberately uncoordinated writer in the final check-to-publication window, recorded as a known limitation rather than passed protection.

No implementation tasks are completed by creating these documents or by prior scratch prototype tests.
