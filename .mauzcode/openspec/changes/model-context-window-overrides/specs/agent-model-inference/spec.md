## MODIFIED Requirements

### Requirement: Context compaction through model connections
Compaction SHALL use the connection's native compaction when supported, otherwise a summarizing one-shot call through the same connection, without selecting by provider id. Thresholds SHALL use the resolved context limit: owner override, provider metadata, then 200,000 tokens. Existing percentage and absolute-threshold settings SHALL remain unchanged. Saving a limit MUST NOT itself trigger compaction.

#### Scenario: Codex agent compacts
- **WHEN** a codex agent exceeds its compaction threshold
- **THEN** the context is compacted through the codex connection's native compaction

#### Scenario: Custom agent compacts
- **WHEN** an agent on a `custom` connection exceeds its threshold
- **THEN** a summary is produced by a one-shot call through that connection

#### Scenario: Override affects the next threshold
- **GIVEN** an owner override of 128000, an effective percentage of 80 percent and an absolute threshold above 102400
- **WHEN** the next normal compaction eligibility calculation runs
- **THEN** the context-window-derived threshold is 102400 tokens
- **AND** the existing eligibility guards and compaction provider selection still apply

#### Scenario: Reset to provider or fallback
- **WHEN** the owner removes an override
- **THEN** subsequent threshold calculations use current provider metadata, or 200000 if absent, without changing the configured percentage or absolute threshold
