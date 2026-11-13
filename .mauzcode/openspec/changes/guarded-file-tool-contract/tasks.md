# Tasks

## 1. Commit service

- [ ] 1.1 Make local `files.write` atomic: per-path in-process mutex plus a lock directory `~/.mauzcode/locks/<sha256(real path)>` (`mkdir`, with an `owner` file) and bounded wait returning `busy` with lock path and owner; temp file in the same directory, copy mode, fsync, rename; write through symlinks.
- [ ] 1.2 Add optional `expectedVersion` (sha256 of raw bytes) and `ifAbsent` to `files.write`, checked inside the lock locally; keep `expectedContent` working locally too.
- [ ] 1.3 Add sha256 `expectedVersion` (`sha256sum`, fallback `shasum -a 256`) and `ifAbsent` to `remote.writeFile`; move its lock to `~/.mauzcode/locks/<hash>` on the remote; keep the md5 `expectedContent` path.
- [ ] 1.4 Route the Files PUT route and the Canvas item save through `files.write` with their existing `expectedContent`, keeping HTTP contracts, auth and CSRF unchanged; make the Files POST create use `ifAbsent`.
- [ ] 1.5 Tests: concurrent cooperating writers (several processes), refused precondition leaves the file intact, lock timeout returns busy, and the external-writer race recorded as a known limitation.

## 2. Receipts and read

- [ ] 2.1 Add an in-memory per-session receipt store (keyed by `session.id`; no store when session is null) — entries hold short random id, version, host, abs path, range, completeness, EOL, final newline, BOM; 30-minute sliding TTL; LRU cap).
- [ ] 2.2 Make `read` (plain and hashline) issue a readId header as the first line for text; none for images, binary, invalid UTF-8 or session-less calls. Make the stored-result preview always keep the readId line (head and tail).
- [ ] 2.3 Tests: range vs complete, expiry, eviction, another session's readId resolves as expired, session-less read issues none, tail preview still shows the readId.

## 3. Edit

- [ ] 3.1 New `edit({ readId, mode, edits })`: resolve the receipt, validate mode homogeneity, range bounds, literal match counts, no-op and overlap.
- [ ] 3.2 Rework `files.applyEdits` to take the base content and version from the commit service under the lock, return `conflict` with fresh range content and a new readId, and return a new readId on success.
- [ ] 3.3 EOL handling: literal search on the LF view mapped to raw offsets; re-encode to the original EOL; preserve final newline and BOM; untouched lines byte-identical.
- [ ] 3.4 Legacy path-only edit: apply under the lock, return a warning and a readId. Move `files.editHashline` onto the reworked `applyEdits`.
- [ ] 3.5 Tests: literal/anchor happy paths, invalid cases, conflict refresh, chained edits, CRLF literal and anchor regressions (both currently failing), mixed EOL.

## 4. Write

- [ ] 4.1 `write` create (`ifAbsent`) and replace (complete readId, `expectedVersion`) modes; legacy path+content with a warning; keep the existing parse-check warning.
- [ ] 4.2 Tests: create over existing, replace from a partial read, replace after a concurrent change.

## 5. Schemas, docs, validation

- [ ] 5.1 Update `$tool_read.md`, `$tool_edit.md`, `$tool_write.md` and `EditOp` for the new forms and status outputs as a flat schema (all of readId/mode/path/host optional, combinations enforced in `tools.editValidate`); change `grep` hashline guidance to "grep, read the range, then edit"; remove the stale `§edit`/`§write` marker mentions.
- [ ] 5.2 Hot-reload the changed namespaces and routes, run `runtime.docs.validate` strictly on changed functions, and run one full-project typecheck.
- [ ] 5.3 Try the new tools on several real repository edits (including a CRLF file and a concurrent change) and note the results; run `openspec validate --strict`.
