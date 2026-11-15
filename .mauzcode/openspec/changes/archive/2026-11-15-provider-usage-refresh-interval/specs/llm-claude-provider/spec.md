## ADDED Requirements

### Requirement: Claude usage polling interval
The Claude provider SHALL declare a usage refresh interval of 180000 ms, so the OAuth usage endpoint is requested at most once every 3 minutes per connection outside explicit refresh. Header observations from inference responses MUST continue to update the general windows without extending that interval.

#### Scenario: Frequent quota polling
- **WHEN** quotas are polled every 60 s for a Claude connection
- **THEN** the OAuth usage endpoint is requested at most once per 3 minutes

#### Scenario: Header update between polls
- **WHEN** an inference response carries 5h utilization headers between usage polls
- **THEN** the cached five-hour window is updated and the next endpoint request time is unchanged
