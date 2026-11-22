## MODIFIED Requirements

### Requirement: Bounded retries on the same connection
The call SHALL retry on the same connection and model, at most three attempts in total, only when the failure is `retryable`, `replaySafe` and its `acceptance` is `none` or `rejected`, waiting `retryAfterMs` or else 500 ms and then 2000 ms. It SHALL NOT retry past the `timeoutMs` deadline or after cancellation, and SHALL NOT switch connection, account or model. A Codex retry MUST prove it is still in the same verified account generation, regardless of the options supplied.

#### Scenario: Transient throttling
- **WHEN** the first attempt fails with a retryable, replay-safe throttled failure with acceptance `none` and the second succeeds
- **THEN** the call returns the second result with `attempts` 2

#### Scenario: Upstream may have accepted the request
- **WHEN** an attempt fails with acceptance `uncertain` or `accepted`
- **THEN** the call fails with that failure without retrying

#### Scenario: Deadline shorter than the delay
- **WHEN** a retryable failure asks for a delay longer than the remaining deadline
- **THEN** the call fails with that failure without waiting

#### Scenario: Cancellation during the delay
- **WHEN** the signal is aborted while waiting before a retry
- **THEN** the call rejects with an abort error and sends no further request

#### Scenario: Ordinary calls cannot cross a login boundary
- **GIVEN** the first attempt on Codex account A used omitted options or explicit Standard and Default
- **WHEN** a replacement login completes during retry backoff, even for the same account ID
- **THEN** the call terminates without sending its prompt a second time
- **AND** ordinary token renewal that verifies continuity does not by itself prevent an otherwise safe retry

#### Scenario: Account continuity cannot be proved
- **WHEN** a valid default first attempt used credentials without a verified identity, or the verified binding is lost before retry
- **THEN** no second inference request is sent, even if the connection later obtains a verified identity
