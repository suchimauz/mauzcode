# Proposal

## Why

The current file tools do not bind an edit to the file version the agent actually read. `edit` re-reads the file at write time and applies its operations to whatever is on disk now, so a matching literal or a still-valid line anchor does not prove that the surrounding text the agent based its decision on is unchanged. Locally `files.applyEdits → files.write` is a plain read/transform/`Bun.write` with no version check, no lock and no atomic publication, so concurrent writers can lose updates. Source checks also found CRLF defects: an anchored edit silently converts a CRLF file to LF, and a multi-line literal copied from `read` output (which shows LF) finds zero matches in a CRLF file.

Experiments in `.mauzcode/tmp/hp/patch-bench-v3/` (synthetic tasks, one model, two repetitions) compared literal, anchors, context patches, hybrid and dual modes. The best observed candidate was **dual + version guard**: literal or anchor ops with an explicit, unmixed mode, a version check, and a fresh snapshot returned on conflict. It solved 12/12 with 1 632 output tokens versus 6 617 for literal-only and 6.5 s versus 14.6 s mean latency, at the cost of 18 versus 16 requests and about 17% more input tokens. A full switch to patches showed no correctness benefit. This change turns that candidate into the real tools. The goal is a better and safer editing tool, not an access-control barrier.

## What Changes

- Evolve the current `read`, `edit` and `write` tools in place; no parallel tool family. Text, range, hashline, image and host-aware reading keep working.
- Text reads return a short opaque `readId` naming the exact file version (content hash) and the delivered line range. Receipts are kept in memory per session with a sliding lifetime; only `read` issues them (`grep` anchors are for locating, not editing); they are a version reference, not a permission.
- `edit({ readId, mode: 'literal' | 'anchor', edits })`. The explicit mode keeps the two families unmixed, as tested. Literal matches and anchors must lie inside the delivered range.
- If the file changed since the receipt, nothing is written; the result states the reason and returns a new `readId` with fresh content for the same range, so the agent can retry without a separate read. Success also returns a new `readId`, so consecutive edits chain without rereading.
- `write` gains explicit `create` (fails if the file exists) and `replace` (needs a `readId` from a complete read).
- `files.write` keeps its signature and becomes atomic (temp file + rename) under a per-file lock locally, matching `remote.writeFile`. Optional `expectedVersion` is checked inside the lock. SSH uses the existing `remote.writeFile` lock with a version hash.
- Preserve the original line endings, final newline and BOM. Fix the two CRLF defects.
- Compatibility: legacy path-only `edit` and path+content `write` keep working. They run under the lock against the current file and return a warning plus a fresh `readId`. Removing them is a later decision based on usage.

## Capabilities

### New Capabilities

- `file-read-receipts`: version-and-range references issued by `read`, their lifetime and refresh.
- `guarded-file-edits`: receipt-bound literal/anchor edits, validation, conflict refresh and outcomes.
- `conditional-file-writes`: create vs replace, atomic locked publication, line-ending preservation, legacy compatibility.

### Modified Capabilities

None.

## Impact

Touches `src/tools/{read,edit,write}.ts`, their `$tool_*.md` schemas and guidance, `src/tools/editValidate.ts`, `src/files/{applyEdits,editHashline,write,readHashline}.ts`, `src/remote/writeFile.ts`, the `grep` tool guidance, the Files POST (create via `ifAbsent`), and the Files/Canvas save routes, which only move their existing `expectedContent` check into the locked commit. No migration, no new setting, no new dependency.

Out of scope: owner/session-bound authorization and durable receipt storage; warn/enforce rollout modes; multi-file transactions; protection against `bash`, direct `Bun.write`/`node:fs` and external editors (these are documented nonparticipants); Codex or a patch language; reworking the Files/Canvas browser protocol.
