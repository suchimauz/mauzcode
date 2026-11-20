## 1. Shared image guard
- [x] 1.1 Raise the shared per-axis ceiling to 3000 pixels; verify the source diff leaves the byte guard and recovery advice unchanged.
- [x] 1.2 Run read-tool regressions demonstrating unchanged 2560 × 1440 and 3000 × 3000 attachments, rejection at 3001 pixels on either axis, and continued rejection of tall full-page captures.

## 2. Integration
- [x] 2.1 Reload the changed function, validate its metadata, and record the result of one full project typecheck.

Verification: `agent.imageContent` reloaded; strict metadata validation returned no errors or warnings. The final full typecheck passed, and `bun run test` passed all 4081 fast tests.

## Workflow follow-up
- Strictly validate, archive the change and validate the merged specifications before the local commit.
