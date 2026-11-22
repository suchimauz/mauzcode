# plugin-ui-runtime Specification

## Purpose
Define how the browser loads the approved plugin UI registry from the server and keeps plugin surfaces available, including automatic recovery after transient failures such as a server restart.

## Requirements

### Requirement: Automatic retry of a failed manifest request
When the plugin UI manifest request fails for a reason other than cancellation, the plugin runtime SHALL schedule another refresh automatically with exponential backoff (starting at about 1 second, capped at about 30 seconds) until a request succeeds or the runtime is stopped. It SHALL NOT require a page reload, a `plugins.changed` event or a live reconnect to recover.

#### Scenario: Server unavailable during page load
- **GIVEN** the page loads while the server is restarting and the manifest request fails
- **WHEN** the server becomes available again
- **THEN** a scheduled retry fetches the manifest and the plugin pages and Canvas buttons appear without a page reload.

#### Scenario: Backoff grows and is capped
- **GIVEN** consecutive manifest requests fail
- **WHEN** retries are scheduled
- **THEN** each delay is longer than the previous one and never exceeds the cap.

### Requirement: Retry of transiently failed plugin bundles
When a manifest entry's bundle import fails with a load error (network or server error), the runtime SHALL record the error for that plugin, keep the other plugins working, and include that plugin in the next scheduled retry. A bundle that loads but fails validation (id mismatch, core override, ungranted surface) SHALL NOT trigger automatic retries.

#### Scenario: Bundle import fails once
- **GIVEN** the manifest succeeds but one plugin's bundle import throws a load error
- **WHEN** the scheduled retry runs and the import succeeds
- **THEN** that plugin's surfaces appear and its error is cleared.

#### Scenario: Validation failure is not retried
- **GIVEN** a bundle whose extension id differs from the plugin name
- **WHEN** the refresh completes
- **THEN** the error is reported and no automatic retry is scheduled for it.

### Requirement: Registry is kept during recovery
While a retry is pending, the runtime SHALL keep the last successfully built registry and SHALL report the failure in its errors; built-in surfaces SHALL always remain available.

#### Scenario: Refresh fails after a successful load
- **GIVEN** plugins were loaded successfully
- **WHEN** a later manifest refresh fails
- **THEN** the previously loaded plugin surfaces stay visible and a retry is scheduled.

### Requirement: Immediate refresh cancels pending backoff
A `plugins.changed` event, a live resync, the browser coming back online or the page becoming visible SHALL cancel any pending retry and refresh immediately. A successful refresh SHALL reset the backoff and clear the manifest error. Stopping the runtime SHALL cancel any pending retry.

#### Scenario: Live resync during backoff
- **GIVEN** a retry is scheduled after a failure
- **WHEN** the live transport resyncs
- **THEN** the runtime refreshes at once, the pending timer is cancelled and only one retry chain remains.

#### Scenario: Stop cancels retries
- **GIVEN** a retry is scheduled
- **WHEN** the runtime is stopped
- **THEN** no further manifest requests are made.
