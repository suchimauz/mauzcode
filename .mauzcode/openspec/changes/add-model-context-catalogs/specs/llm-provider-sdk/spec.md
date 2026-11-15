## MODIFIED Requirements

### Requirement: Provider inference descriptors
A provider definition MAY declare inference descriptors: an optional system preamble that callers place first in the system instructions, the vendor whose public price catalogue applies to its models, and optional ordered models.dev and pi-ai catalogue sections describing its models' context and output limits. Callers MUST obtain these values through route resolution and MUST NOT branch on provider ids.

#### Scenario: Claude preamble
- **WHEN** a route on a `claude` connection is resolved
- **THEN** the result carries the Claude Code identity line as system preamble and `anthropic` as price vendor

#### Scenario: Provider without descriptors
- **WHEN** a provider declares no inference descriptors
- **THEN** resolution reports no preamble and no price vendor

#### Scenario: Catalogue sections default to price vendor
- **WHEN** a provider declares a price vendor but no catalogue sections
- **THEN** context limits are looked up in that vendor's catalogue sections
