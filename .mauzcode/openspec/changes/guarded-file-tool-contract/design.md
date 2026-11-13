# Design

## Context

Current behavior verified in source:

- `src/tools/read.ts` returns plain strings for text (CRLF normalized to LF) and attachments for images. `src/files/readHashline.ts` normalizes CRLF and anchors lines with `lineHash`. Nothing identifies the version that was delivered.
- `src/tools/edit.ts` converts structured ops and calls `src/files/applyEdits.ts`, which reads the file, transforms it and calls `files.write`. Only the remote path passes `expectedContent`.
- `src/files/write.ts` writes locally with `Bun.write`: no version check, no lock, not atomic.
- `src/remote/writeFile.ts` already uploads to a `mktemp` file, takes a `mkdir` lock, optionally compares the md5 of `expectedContent`, and renames atomically.
- Files `$route__PUT.ts` and the Canvas item POST route compare content before calling `files.write`, outside any lock.
- CRLF defects reproduced on a scratch file: an anchored replace turned `a\r\nb\r\nc\r\n` into `a\nB\nc\n`, and the literal `"a\nb"` found 0 matches in the CRLF file.
- `$tool_edit.md`/`$tool_write.md` still mention the `§edit`/`§write` marker syntax, but `src/agent/markerArgs.ts` does not exist.

Evidence: `.mauzcode/tmp/hp/patch-bench-v3/README.md`. The candidate was dual + guarded (explicit literal|anchor mode, version check, fresh snapshot on conflict). Its limits: synthetic fixtures, one model, two repetitions, and a version check that ran before staging rather than inside a lock. The separate contract prototype passed 22 tests, including six cooperating processes. It also reproduced the expected lost update from a writer that ignores the lock.

## Goals / Non-Goals

**Goals**
- Bind each edit to the version and range the agent read.
- Keep literal and anchor editing, as an explicit dual mode.
- On conflict, return the reason plus fresh content and a new receipt in the same response.
- Make every write path in MauzCode atomic and serialized per file.
- Preserve line endings, final newline and BOM.

**Non-Goals**
- Authorization or isolation through receipts. Existing authorization stays where it is.
- Durable receipts, rollout modes, multi-file transactions.
- Protection from writers that ignore the lock (`bash`, direct fs calls, editors).

## Decisions

### 1. Wire contract

```ts
read({ path, host?, startLine?, endLine?, maxLines?, hashline? })
// text -> header line `readId: r7k2 · lines 1-120 of 120 · complete` + the same body as today
// images unchanged (no readId)

edit({ readId, mode: 'literal', edits: [{ oldText, newText, all? }] })
edit({ readId, mode: 'anchor',  edits: [{ op, anchor, endAnchor?, text? }] })
// legacy: edit({ path, host?, edits }) — see Decision 7

write({ mode: 'create', path, host?, content })
write({ mode: 'replace', readId, content })
// legacy: write({ path, host?, content }) — see Decision 7

files.write({ path, host?, content, expectedContent?, expectedVersion?, ifAbsent? })
```

Results stay text-first, like today's tools. Each starts with a status line (`applied`, `conflict`, `invalid`, `expired`, `busy`), followed by the new `readId` and, on conflict, the fresh content. Models read text better than nested JSON.

**Why the explicit mode:** in v3 dual beat hybrid, where the model picked the format itself. Mixing modes was never tested. A literal replace shifts lines, so anchors issued after it would be invalid. Keeping one mode per call keeps the engine simple.

### 2. Receipts

- A receipt is `{ id, agentId, host, absPath, version (sha256 of raw bytes), range: [start, end], totalLines, complete, eol, finalNewline, bom, expiresAt }`. It lives in an in-memory map in `ctx.state`.
- The ID is short and random (about 8 base32 characters), so the model does not copy long hashes.
- The lifetime is 30 minutes, sliding on use, with at most about 500 receipts per agent (LRU). If the server restarts, the agent simply rereads; the response says so.
- A receipt is looked up only for the calling agent, which avoids accidental cross-agent mix-ups. This is a correctness measure, not a security boundary.
- A hashline read and a plain read issue the same kind of receipt. Anchors are checked against the receipt's version, not merely re-hashed against the current file.
- Several range reads of the same version are not merged in v1. Replacing a file requires a complete read.

### 3. Edit pipeline

1. Resolve the receipt; if it is unknown or expired, return `expired` with guidance to reread.
2. Validate: homogeneous mode, no no-op literal, no overlapping ranges, and every anchor and literal match inside the delivered range. Literals match against the LF view and are mapped back to raw byte offsets.
3. Take the per-file lock (Decision 4), read the current bytes and compare the version.
4. If it differs, release the lock and return `conflict` with a new receipt and fresh content for the same range, clipped to the read limits. The old receipt is retired.
5. Otherwise apply the edits, restore EOL, final newline and BOM, publish atomically, issue a new receipt for the edited range, then release the lock.

Return a short diff summary rather than the full file, as today.

### 4. Commit service

All writes go through `files.write`.

- **Locally:** a per-path mutex within the process plus an exclusive `<file>.mauzcode-lock` (`mkdir`) for other processes, with bounded waiting that returns `busy`. Locks are never stolen automatically. Inside the lock: check the precondition (`expectedVersion`, `expectedContent`, `ifAbsent`), write a temp file in the same directory, copy the mode, fsync and rename. Symlinks are written through to their target, as `remote.writeFile` does.
- **SSH:** `remote.writeFile` gains a sha256 `expectedVersion` and `ifAbsent` inside its existing lock, keeping the md5 `expectedContent` path for compatibility.
- **Files PUT and Canvas save:** pass their existing `expectedContent` to `files.write`, so the comparison happens inside the lock. Their HTTP contract is unchanged.

### 5. Line endings

The receipt records the dominant EOL, the final newline and the BOM. Edits operate on the LF view, and the result is re-encoded to the original EOL. Mixed-EOL files keep the untouched lines' original bytes: line-level ops splice raw lines, and new lines use the dominant EOL. The literal search runs on the LF view and maps back to raw offsets.

### 6. Read limits

Production limits stay as they are now (10 MB file cap, existing line options). `complete` is set only when lines 1..total were all delivered. Invalid UTF-8 or binary content gets no receipt.

### 7. Legacy forms

Path-only `edit` and path+content `write` remain accepted. Under the lock they apply against the current file, as today but atomically, and return `warning: no readId — edit was applied to the current file without a version check` plus a new `readId`. `$tool_*.md` documents only the new form. The stale marker-syntax mentions are removed.

## Risks / Trade-offs

- Every unrelated change to a file, such as a comment elsewhere, makes the receipt stale. The fresh snapshot keeps the extra turn cheap. This is the measured cost in v3 (+2 requests).
- In-memory receipts are lost on restart, so one extra read is needed afterwards. This is acceptable for a dev runtime.
- The lock protects only cooperating writers. A writer that ignores it can still race between the check and the rename; this is documented and tested as a known limitation.
- Legacy forms still allow blind edits. They are kept for compatibility, flagged with a warning, and reconsidered later.

## Migration Plan

1. Add the commit service (atomic, locked local `files.write`; `expectedVersion`/`ifAbsent` locally and over SSH) and route Files/Canvas through it.
2. Add receipts to `read`, the dual `edit`, and create/replace `write`; fix EOL handling.
3. Update `$tool_*.md` schemas and guidance, hot-reload, validate, and run one full typecheck.
4. Run tests (unit, CRLF, concurrency, real tool handlers); try it on real repository edits.

Rollback means reverting the commit. No data migration is involved.
