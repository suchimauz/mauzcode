## ADDED Requirements

### Requirement: Duration-based Codex quota periods
The provider SHALL classify quota periods using valid reported window duration, not primary/secondary slot position, display labels or time remaining until reset. A duration of 18000 seconds SHALL identify five hours and 604800 seconds SHALL identify one week. Missing, invalid, contradictory or unsupported duration evidence MUST NOT imply a standard period.

#### Scenario: Weekly-only primary window
- **WHEN** usage contains only a primary window with `limit_window_seconds: 604800`
- **THEN** that window is identified as weekly, with its reported utilization and reset time, and no five-hour window is invented

#### Scenario: Conventional pair
- **WHEN** primary has a duration of 18000 seconds and secondary has a duration of 604800 seconds
- **THEN** they are identified as five-hour and weekly windows respectively

#### Scenario: Reordered slots
- **WHEN** primary has a duration of 604800 seconds and secondary has a duration of 18000 seconds
- **THEN** they are identified as weekly and five-hour windows respectively

#### Scenario: Minutes representation
- **WHEN** an otherwise valid window reports `window_minutes: 10080` without a seconds duration
- **THEN** it is identified as weekly

#### Scenario: No trustworthy period
- **WHEN** a valid usage window has no duration, an unsupported duration, an invalid duration, or conflicting seconds and minutes durations
- **THEN** its standard period remains unknown and the window is retained for additional-limit presentation
- **AND** neither its slot nor its reset timestamp is used to guess a period

### Requirement: Retained Codex quota identity
The provider SHALL preserve the identity and available usage/reset data of each valid parsed quota window independently of its standard-period classification. Unknown usage MUST NOT be converted to zero. Missing or malformed window entries MUST NOT create phantom limits or prevent valid sibling windows from being reported.

#### Scenario: Unknown duration with valid usage
- **WHEN** a primary window reports a valid used percentage and reset time but no duration
- **THEN** its identity, used percentage and reset time remain in the report without a fabricated session classification

#### Scenario: Null utilization
- **WHEN** an entry reports null or non-finite utilization and no other valid usage measurement
- **THEN** it is not emitted as a zero-percent quota
- **AND** a valid sibling window is still reported
