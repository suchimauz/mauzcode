# Tasks

## 1. SDK contract

- [x] 1.1 Add documented optional `usageRefreshMs` to ProviderDefinition and validate it in the provider loader (finite integer 10000–3600000); add loader tests for accepted, invalid and omitted values.
- [x] 1.2 Use the provider interval as the usage cache TTL in `models.connections.usage` for available and unavailable results, keeping `refresh` as a bypass; add cache tests and update JSDoc and docs/models-providers.md.

## 2. Claude

- [x] 2.1 Declare `usageRefreshMs: 180000` for Claude; verify header merges keep the expiry and the public-contract declaration test still passes.

## 3. Verification

- [x] 3.1 Hot-reload, validate changed runtime function docs, run one project typecheck, the models test suites and `openspec validate --strict`.
