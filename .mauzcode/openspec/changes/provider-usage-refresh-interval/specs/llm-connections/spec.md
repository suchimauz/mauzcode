## ADDED Requirements

### Requirement: Provider-paced usage cache
The usage report of a connection whose provider implements usage SHALL be cached for the provider's usage refresh interval, for both available and unavailable results. An explicit refresh request MUST bypass the cache.

#### Scenario: Within the provider interval
- **WHEN** usage is requested again before the provider's interval has elapsed for an unchanged connection
- **THEN** the cached report is returned without calling the provider

#### Scenario: Failed usage is not retried early
- **WHEN** the provider usage call failed and usage is requested again within the interval
- **THEN** the cached `unavailable` report is returned without calling the provider

#### Scenario: Explicit refresh
- **WHEN** usage is requested with refresh within the interval
- **THEN** the provider is called again
