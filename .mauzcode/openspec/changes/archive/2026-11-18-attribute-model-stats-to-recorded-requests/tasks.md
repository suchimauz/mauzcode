## 1. Attribute and rank recorded requests

- [x] 1.1 Group recorded requests by shared model name, rank by request count, and preserve totals for unknown models. Verified by `bun test ./src/frontendBridge/stats.test.ts`, including an archived session with two known routes and unattributed requests.

## 2. Present partial coverage

- [x] 2.1 Use the request-based response in New Session, omit unknown models from the chart and show a dash when no favorite is known. Verified by `bun run frontend:test -- frontend/src/test/new-session-welcome.test.tsx`, including the unattributed-only case.

Implementation and tests: `c1e55b5c` (15 backend and 10 frontend tests passed).
