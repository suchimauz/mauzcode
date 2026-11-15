# Design

## Context

`models.connections.usage` wraps the provider `usage` call in `models.connections.cached` with the default 60 s TTL. The quotas route is the only production caller and is polled by visible tabs every 60 s, so the backend cache alone decides upstream frequency. Provider failures are converted to an `unavailable` report and cached like successes.

## Goals / Non-Goals

**Goals:** let each provider bound its own usage-endpoint frequency; slow Claude to 3 minutes.

**Non-Goals:** no user setting, no frontend polling change, no retry-after/backoff logic, no change to connection tests or header-based Claude updates.

## Decisions

1. A declaration field (`usageRefreshMs`) rather than a setting: the budget belongs to the provider's upstream API, and declarations are already validated at registration. A per-connection override can be added later.
2. Bounds 10 000 – 3 600 000 ms, integer. Too small values would defeat the purpose; more than an hour makes quota display misleading.
3. The interval applies to `unavailable` results too, so a 429 is not retried sooner than a success.
4. `refresh: true` keeps bypassing the cache; it is an explicit operator action, not polling.

## Risks / Trade-offs

- Additional Claude limits can be up to 3 minutes old → acceptable; general windows still refresh from inference headers, and each window carries `observedAt`.
- A provider declaring a long interval delays recovery after a failure by that interval → bounded by the 1 h maximum.
