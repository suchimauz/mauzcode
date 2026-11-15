# Proposal

## Why

Every provider's usage report is cached for a fixed 60 s, so an open MauzCode tab queries each connection's usage endpoint about once a minute. Claude's OAuth usage endpoint now answers 429 at that rate, which hides its additional (model-specific) limits. Providers know their own endpoint budgets better than the core.

## What Changes

- Add an optional provider declaration member `usageRefreshMs`: the minimum interval between usage-endpoint requests for one connection. Omitted means the current 60 s.
- Validate it at registration (finite integer, 10 s – 1 h); an invalid value rejects that declaration only.
- `models.connections.usage` caches each provider's report (successful or `unavailable`) for that provider's interval instead of the fixed 60 s; explicit `refresh` still bypasses the cache.
- Claude declares 180 s (3 minutes). Its general 5h/7d windows keep updating from inference response headers in between, without extending the cache expiry.

## Capabilities

### New Capabilities

### Modified Capabilities

- `llm-provider-sdk`: optional provider usage refresh interval.
- `llm-connections`: usage cache lifetime follows the provider interval.
- `llm-claude-provider`: Claude usage endpoint polled at most every 3 minutes.

## Impact

`src/models/ProviderDefinition.ts`, `src/models/$loader_modelProvider.ts`, `src/models/connections/usage.ts`, `src/models/$modelProvider_claude.ts`, docs/models-providers.md and model tests. No API, frontend, database or settings change; frontend polling stays at 60 s and is served from the backend cache.
