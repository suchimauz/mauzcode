# Tasks

## 1. Authorized catalogue input

- [x] 1.1 Separate static guidance from sanitized advertised metadata. Test identical bootstrap with zero, one and many entries; verify both reader gates and prompt-section exclusion.
- [x] 1.2 Scope descriptors by workspace, host and source. Test healthy-root progress alongside SSH failure or truncation, same IDs in distinct scopes and live denial on revoked access (including continuations and explicit commands). Verify any explicit revocation warning is generic.

## 2. Bounded catalogue delivery

- [x] 2.1 Render deterministic baseline and eligible additions/edits. Document and test shared limits of 40 distinct shown keys and 6,000 cumulative characters including line separators across multiple turns. Check exact boundaries, shorter edits, unshown overflow and list/search fallback.
- [x] 2.2 Retain shown entries without withdrawal or refund. Test delete, rename, identical and changed reappearance, multiple edits before a boundary and silent changes outside advertised fields. Verify no package-body I/O for reconciliation.

## 3. Effective context lifecycle

- [x] 3.1 Persist delivered rows and spend idempotently at real safe request boundaries. Test previews, token estimates, incomplete multi-tool batches, interrupted persistence, retry and restart; no no-op rows or idle wakes.
- [x] 3.2 Restore inherited spend and isolate scope on fork/resume/workspace switch. Test stricter child grants and compaction after exhaustion: a fresh bounded baseline and budget are issued exactly once.
- [x] 3.3 Document and test legacy initialization and rollback without rewriting earlier messages or deriving state from past tool outputs.

## 4. Integration checks

- [x] 4.1 Capture mock provider requests across publication, advertised edit, body-only edit and deletion. Verify the exact tail, byte-identical prior prefix under fixed inputs, stable tool schemas/cache keys and no preloaded bodies.
- [x] 4.2 Run affected Skills, context, command and compaction suites, one coordinated full-project check for the settled batch, and strict OpenSpec validation. Record results separately from pre-existing failures.

## Verification evidence

- `bun run test`: 4,351 passed, 0 failed (693 files). `bun run test:it src/skills`: 7 passed, 0 failed, including isolated SSH. No live provider or production instance was used.
- `procs.dev.typecheck({})`: clean after generating worktree declarations with the checked-in optional OpenCode Go provider enabled. Earlier diagnostics concerned that absent declaration and unchecked regex captures in the existing Skills acceptance fixture; no outstanding type errors.
- `code.quality({})` on the isolated worktree index: 0 errors, 588 project-wide warnings. Strict function metadata checks passed; `agent.run` retains its existing return-type documentation warning.
- `validate append-agent-skill-deltas --strict` and `git diff --check` passed.
