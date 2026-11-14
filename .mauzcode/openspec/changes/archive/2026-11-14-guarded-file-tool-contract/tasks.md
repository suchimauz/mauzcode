# Tasks

## 1. Commit service

- [x] 1.1 Make local `files.write` atomic: per-path in-process mutex plus a lock directory `~/.mauzcode/locks/<sha256(real path)>` (`mkdir`, with an `owner` file) and bounded wait returning `busy` with lock path and owner; temp file in the same directory, copy mode, fsync, rename; write through symlinks.
- [x] 1.2 Add optional `expectedVersion` (sha256 of raw bytes) and `ifAbsent` to `files.write`, checked inside the lock locally; keep `expectedContent` working locally too.
- [x] 1.3 Add sha256 `expectedVersion` (`sha256sum`, fallback `shasum -a 256`) and `ifAbsent` to `remote.writeFile`; move its lock to `~/.mauzcode/locks/<hash>` on the remote; keep the md5 `expectedContent` path.
- [x] 1.4 Route the Files PUT route and the Canvas item save through `files.write` with their existing `expectedContent`, keeping HTTP contracts, auth and CSRF unchanged; make the Files POST create use `ifAbsent`.
- [x] 1.5 Tests: concurrent cooperating writers (several processes), refused precondition leaves the file intact, lock timeout returns busy, and the external-writer race recorded as a known limitation.

## 2. Receipts and read

- [x] 2.1 Add an in-memory per-session receipt store (keyed by `session.id`; no store when session is null) — entries hold short random id, version, host, abs path, range, completeness, EOL, final newline, BOM; 30-minute sliding TTL; LRU cap).
- [x] 2.2 Make `read` (plain and hashline) issue a readId header as the first line for text; none for images, binary, invalid UTF-8 or session-less calls. Make the stored-result preview always keep the readId line (head and tail).
- [x] 2.3 Tests: range vs complete, expiry, eviction, another session's readId resolves as expired, session-less read issues none, tail preview still shows the readId.

## 3. Edit

- [x] 3.1 New `edit({ readId, mode, edits })`: resolve the receipt, validate mode homogeneity, range bounds, literal match counts, no-op and overlap.
- [x] 3.2 Rework `files.applyEdits` to take the base content and version from the commit service under the lock, return `conflict` with fresh range content and a new readId, and return a new readId on success.
- [x] 3.3 EOL handling: literal search on the LF view mapped to raw offsets; re-encode to the original EOL; preserve final newline and BOM; untouched lines byte-identical.
- [x] 3.4 Legacy path-only edit: apply under the lock, return a warning and a readId. Move `files.editHashline` onto the reworked `applyEdits`.
- [x] 3.5 Tests: literal/anchor happy paths, invalid cases, conflict refresh, chained edits, CRLF literal and anchor regressions (both currently failing), mixed EOL.

## 4. Write

- [x] 4.1 `write` create (`ifAbsent`) and replace (complete readId, `expectedVersion`) modes; legacy path+content with a warning; keep the existing parse-check warning.
- [x] 4.2 Tests: create over existing, replace from a partial read, replace after a concurrent change.

## 5. Schemas, docs, validation

- [x] 5.1 Update `$tool_read.md`, `$tool_edit.md`, `$tool_write.md` and `EditOp` for the new forms and status outputs as a flat schema (all of readId/mode/path/host optional, combinations enforced in `tools.editValidate`); change `grep` hashline guidance to "grep, read the range, then edit"; remove the stale `§edit`/`§write` marker mentions.
- [x] 5.2 Hot-reload the changed namespaces and routes, run `runtime.docs.validate` strictly on changed functions, and run one full-project typecheck.
- [x] 5.3 Try the new tools on several real repository edits (including a CRLF file and a concurrent change) and note the results; run `openspec validate --strict`.

## Notes

- 5.2: types regenerated; full typecheck has no new errors against main (606 vs 607 baseline lines). Hot-reload is not applicable in the worktree; the running instance stays on main until merge.
- 5.3 trial (copies under .mauzcode/tmp): literal edit in a partial read plus a chained edit restored the file byte-identically; an anchor insert in a CRLF copy kept CRLF everywhere with the other bytes unchanged; a change between read and edit gave conflict with fresh content, the retry with the returned readId applied, and the other change survived. `openspec validate --strict` passes.
- Known limitation: writers that skip the lock (bash, editors) can still race between the check and the rename.
- Pre-existing failure unrelated to this change: "every newly assembled agent prompt includes runtime authoring rules" (fails on main too).
