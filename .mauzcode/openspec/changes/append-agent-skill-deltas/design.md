# Design

## Context

Request assembly currently calls skills.promptSection in the bootstrap. Its sanitized descriptor lines expose exact ID, source label and description. The policy layer already governs discovery and access; agent.syncWorldState provides a precedent for cursor-excluded tail context.

## Goals / Non-Goals

Compare request bytes, not provider billing or cache hit rates. Discovery uses only authorized catalogue metadata: no package-body scans, tool-result inspection, background wakes, or changes to command behavior.

## Decisions

1. Keep usage and overflow guidance invariant for eligible readers, including empty catalogues. Rebuilding a prompt with the list at the end would still alter the prefix before the conversation. Render deterministic, escaped lines with the existing field caps. Compare the fields actually advertised, not package revisions or unrendered description suffixes.
2. Checkpoint a scoped map of entries actually shown and their last advertised fields, plus cumulative rendered characters. Key by host/workspace, supplying source and qualified ID. Charge each emitted descriptor line plus its newline against 6,000 characters; only first delivery of a scoped key spends one of 40 slots. Charge edits even if shorter; never subtract. Keep static framing and list/search guidance outside descriptor accounting. In deterministic order skip candidates that do not fit; omitted entries remain unshown. No-op boundaries write nothing.
3. Keep missing keys rather than mirroring the latest inventory: a returning key compares against its last emitted fields. A partial or failed root cannot imply withdrawal or prevent other roots making progress. Ordinary deletes and rename-away emit nothing. Never treat this map as a permission cache. Only confirmed explicit policy revocation can justify a generic access warning; do not enumerate skills or emit warnings for filesystem absence.
4. Persist each tail row and matching checkpoint atomically via session helpers, or recover idempotently from durable delivery records. Never advance counters for previews, unfinished tool batches or failed persistence. Resume or fork from the retained catalogue rows and corresponding spend, filtering future disclosure through current grants. A workspace switch cannot reuse old identities or refund spend in the same window. Compaction resets the ledger and emits a fresh authorized baseline once, even if a summary mentions old skills.

## Risks / Trade-offs

- [Long-lived windows can exhaust the allowance] → Keep on-demand search available; do not recycle deleted entries or repeat truncation notices.
- [SSH outages or source replacement] → Preserve uncertainty and scoped identity; use live source checks for every access.
- [A warm prefix is not a guaranteed cache hit] → Compare serialized requests with fixed unrelated inputs.

## Migration Plan

Deploy static guidance and tail delivery together, after the Skills substrate from add-project-skills. In legacy conversations initialize the ledger from a new bounded baseline, not historical tool results. One cold prefix is acceptable; do not rewrite old rows. Rollback restores legacy discovery for subsequent requests; retained rows confer no authority.
