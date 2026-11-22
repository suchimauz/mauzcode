# Instance directory and local server health

## Purpose
Distinguish the instance status reported to the control plane from two local measurements: an owner's host-wide monitor and the server process-tree snapshot.

Last verified: 2026-11-22 at `d35de7c2`. Source and test references are listed below.

## Requirements

### Requirement: Report instance activity
The server SHALL schedule a heartbeat at startup and every five minutes, sending only version and aggregate counts as heartbeat metadata.

#### Scenario: Connected instance
- **WHEN** configuration and a token are available
- **THEN** the heartbeat posts the short Git revision (null if empty), non-disabled user count, unarchived agent count and running-state agent count to the issuer's `/services/heartbeat` with bearer authentication.

#### Scenario: No acknowledgement
- **WHEN** configuration or token is missing, the fetch rejects or the response is not successful
- **THEN** the heartbeat returns null instead of an acknowledged service ID.

<!-- id: control-plane-heartbeat-post -->
<!-- entities: instance, heartbeat -->
<!-- enforced: src/controlPlane/$start.ts default export; src/controlPlane/heartbeat.ts default export -->
<!-- test: src/controlPlane/controlPlane.test.ts :: not connected: everything is a quiet no-op (disconnected branch) -->

### Requirement: Read-only directory access
The overview SHALL require a signed-in user before checking the request method, accept only GET, and return responses with Cache-Control: no-store and Vary: Cookie.

#### Scenario: Request rejected before discovery
- **WHEN** a caller is anonymous or a signed-in user submits a non-GET request
- **THEN** the former receives 401 and the latter receives 405 with Allow: GET; neither initiates discovery.

<!-- id: control-plane-overview-method -->
<!-- kind: invariant -->
<!-- entities: user, directory -->
<!-- enforced: src/controlPlane/overview.ts default export; src/controlPlane/$route_overview_GET.ts default export -->
<!-- test: src/controlPlane/overview.test.ts :: overview requires authentication before config or discovery; no action endpoint or configuration writes -->

### Requirement: Distinguish configuration from discovery
The directory SHALL distinguish missing configuration from a configured issuer that returns no usable service list.

#### Scenario: No issuer configuration
- **WHEN** a member opens the directory without issuer configuration
- **THEN** it returns connected false and an empty instance list without querying discovery.

#### Scenario: Discovery cannot return rows
- **WHEN** configuration exists but the MauzCode-kind lookup lacks a token, its fetch rejects, it receives a non-success response, or its JSON object lacks a services array
- **THEN** the directory returns connected true with no instances; an exception escaping discovery instead yields 502 without upstream error details.

<!-- id: control-plane-overview-connected -->
<!-- entities: issuer, directory, service -->
<!-- enforced: src/controlPlane/overview.ts default export; src/controlPlane/services.ts default export -->
<!-- test: src/controlPlane/overview.test.ts :: disconnected directory never calls discovery -->

### Requirement: Project public directory fields
The directory SHALL return only instance ID, name, URL, owner email, users, agents, running, version and last-seen timestamp per row, not the original service metadata.

#### Scenario: Untrusted display values
- **WHEN** a configured directory projects issuer and instance URLs
- **THEN** it retains only origin and pathname for credential-free HTTP(S) URLs and returns null for invalid or disallowed URLs.

#### Scenario: Invalid heartbeat values
- **WHEN** a count is not a nonnegative safe integer, version or owner email is not a string, or the timestamp is not a finite number in the JavaScript Date range
- **THEN** the corresponding field is null rather than coerced.

<!-- id: control-plane-overview-projection -->
<!-- kind: invariant -->
<!-- entities: instance, heartbeat metadata -->
<!-- enforced: src/controlPlane/overview.ts default export (safeUrl, count, services.map) -->
<!-- test: src/controlPlane/overview.test.ts :: directory preserves authenticated member read access without revealing credentials or arbitrary metadata -->

### Requirement: Owner host monitor
The host metrics endpoint SHALL sample only for owners, request details only for details=1, and disable HTTP caching even on errors.

#### Scenario: Insufficient access or unavailable sampler
- **WHEN** an anonymous caller or signed-in non-owner requests status
- **THEN** the endpoint returns 401 or 403 respectively without sampling; an owner whose sampler throws receives a generic 503.

<!-- id: server-metrics-status-owner -->
<!-- entities: owner, host sample -->
<!-- enforced: src/serverMetrics/$route_status_GET.ts default export -->
<!-- test: src/serverMetrics/sample.test.ts :: metrics endpoint rejects anonymous and members before sampling; owner endpoint requests details explicitly, disables HTTP caching and hides failures -->

### Requirement: Bound host process detail
The monitor SHALL sample the local server host, reuse a matching sample younger than two seconds, and omit process rows from summaries.

#### Scenario: First summary
- **WHEN** no previous CPU reading exists
- **THEN** the summary reports null CPU, memory and load measurements, and an empty cores array.

#### Scenario: Detailed sample
- **WHEN** Linux host details are requested
- **THEN** at most 4096 numeric process entries are scanned and at most 200 rows returned, ordered by descending CPU (null treated as zero), descending RSS, then ascending PID; rows contain only PID, name, state, RSS and CPU. Other platforms report process listing unavailable.

<!-- id: server-metrics-sample-details -->
<!-- entities: host, process -->
<!-- enforced: src/serverMetrics/sample.ts default export -->
<!-- test: src/serverMetrics/sample.test.ts :: real server sampling caches summaries and bounds safe process fields -->

### Requirement: Separate machine and process-tree usage
The resource snapshot SHALL distinguish machine totals from the local server process and its visible descendants, rather than attributing all host processes to MauzCode.

#### Scenario: Linux tree memory and CPU
- **WHEN** a complete tree is identified
- **THEN** memory uses summed PSS if complete, otherwise summed RSS if complete, otherwise null; tree CPU is null without comparable complete readings, including when a PID is reused.

#### Scenario: Non-Linux host
- **WHEN** the collector cannot use Linux procfs because the host is not Linux
- **THEN** it reports unsupported tree metrics, one known main process, machine memory and null MauzCode CPU, memory and swap.

<!-- id: resources-collect-snapshot-tree -->
<!-- entities: machine, process tree -->
<!-- enforced: src/resources/collectSnapshot.ts default export; src/resources/reduceReading.ts default export -->
<!-- test: src/resources/collector.test.ts :: partial PSS falls back to full RSS, swap remains null; machine-normalized CPU and PID reuse -->

### Requirement: Serve shared local snapshots
The server resources GET handler SHALL return the collector's snapshot without HTTP caching and return a generic no-store 503 if collection throws.

#### Scenario: Concurrent and repeated reads
- **WHEN** collection is pending or the cached snapshot is less than two seconds old
- **THEN** callers receive copies of the shared result with the same sample time, without another collection.

#### Scenario: Collection failure
- **WHEN** collection throws and the handler logs the failure
- **THEN** the response identifies `resource_snapshot_unavailable` rather than disclosing the exception.

<!-- id: resources-collect-snapshot-pending -->
<!-- entities: caller, resource snapshot -->
<!-- enforced: src/resources/collectSnapshot.ts default export; src/ui/$route_server-resources_GET.ts default export -->
<!-- test: src/resources/collector.test.ts :: live snapshot and concurrent cache coalescing -->

<!-- uncertainty: The tree snapshot handler has no handler-local role check; global middleware admission was not verified. Connected heartbeat transport, timer delivery and the tree route failure response were inspected, not exercised. -->
<!-- deferred: src/controlPlane/token.ts; authentication middleware and external control-plane behavior are outside this baseline. -->
