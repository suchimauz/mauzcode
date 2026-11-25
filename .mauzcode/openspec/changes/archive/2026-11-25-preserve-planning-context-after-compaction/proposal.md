# Proposal

## Why

A compacted session can lose its last collaboration-mode instruction even though the original transcript still contains it. MauzCode then adds that instruction to the end of every outgoing request instead of keeping an append-only prefix. In one measured session the cache-read share fell from 97.5% to 5.2% after the second compaction.

## What Changes

- Restore the current mode instruction once when an active checkpoint no longer exposes it. Reuse a matching instruction already present in the projected transcript.
- Keep preview read-only and preserve existing full-history fallback, fork boundaries and tool-call pairing. Do not change the mode itself or rewrite historical messages.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `planning-proposal-review`: deliver current collaboration-mode guidance as stable history after compaction.

## Impact

Changes agent request preparation; no database migration, provider protocol change, cache-hit guarantee or change to plan approval. Verify with deterministic local tests and a separate, explicitly authorized synthetic live check on GPT-6.2-Sol.
