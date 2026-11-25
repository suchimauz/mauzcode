# Spec Delta

## ADDED Requirements

### Requirement: Provider diagnostics on failed model calls
For every core, custom and plugin model route, a terminal inference failure SHALL identify the provider and failure stage, retain the observed HTTP status if known, and include safely extractable upstream code, reason and message in the provider's own words. Local classifications SHALL remain distinct from upstream statements and keep their existing retry semantics.

#### Scenario: Antigravity rejects the request
- **WHEN** Google returns HTTP 400 with RPC status `INVALID_ARGUMENT` and message `Unknown field: example` for an Antigravity agent turn
- **THEN** the operator sees Antigravity, HTTP 400, `INVALID_ARGUMENT` and `Unknown field: example` together, not just a generic bad-request label

#### Scenario: A different provider rejects a call
- **WHEN** a plugin model route returns HTTP 503 with a safe provider message but no provider code and the retry policy is exhausted
- **THEN** the final failure shows that provider, HTTP 503 and its wording without inventing a provider code; the same diagnostic rules apply whether or not the adapter supplies a classifier

#### Scenario: Provider error after stream acceptance
- **WHEN** a model returns a successful HTTP handshake and subsequently emits a structured error frame with code and message
- **THEN** the diagnostic identifies an in-stream failure and includes its safe code and message; the handshake is not reported as an HTTP rejection

#### Scenario: Response without a usable explanation
- **WHEN** an upstream rejection has an empty, unrecognized or unsafe error payload
- **THEN** the diagnostic reports the known status and indicates that no safe provider explanation is available; it does not substitute raw body data

#### Scenario: No upstream response
- **WHEN** a connection fails before a provider response arrives
- **THEN** the diagnostic identifies a transport failure before response and the safe transport code if known, without attributing a status or explanation to the provider

### Requirement: Safe persistence and readback of model errors
The affected agent's owner SHALL be able to read the same bounded, redacted diagnostic in the failed run's history after reloading the chat. Only diagnostic fields SHALL be retained, not raw payloads, request content, credentials or personal verification links. Provider text SHALL be displayed as untrusted text.

#### Scenario: Readback after a later successful turn
- **WHEN** the operator reloads the chat after a terminal failure and a later successful turn
- **THEN** the earlier run still shows its diagnostic, independently of the agent's current status or last-error field

#### Scenario: Provider echoes sensitive or oversized data
- **WHEN** an error contains credentials, a verification URL, quoted prompt content, markup, or an oversized message
- **THEN** only safe bounded diagnostic content reaches storage, logs and the chat; markup cannot execute, and unsafe excerpts are withheld rather than stored as raw data

#### Scenario: Recovery without a terminal failure
- **WHEN** a retry succeeds or the existing quota policy parks the agent without recording an error
- **THEN** the diagnostic feature does not create a terminal error or change retries, quota handling or replay decisions
