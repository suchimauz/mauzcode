## ADDED Requirements

### Requirement: Provider usage refresh interval
A provider definition MAY declare `usageRefreshMs`, the minimum interval in milliseconds between usage requests for one connection. The value MUST be a finite integer from 10000 to 3600000; otherwise registration of that declaration fails and other providers stay registered. When omitted, the interval is 60000.

#### Scenario: Provider declares an interval
- **WHEN** a provider declares `usageRefreshMs: 180000`
- **THEN** it is registered and its usage reports are reused for 180 s

#### Scenario: Invalid interval
- **WHEN** a provider declares `usageRefreshMs: 1000`
- **THEN** registration of that declaration fails with an error naming `usageRefreshMs`

#### Scenario: Omitted interval
- **WHEN** a provider declares usage without `usageRefreshMs`
- **THEN** its usage reports are reused for 60 s
