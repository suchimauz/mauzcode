## Purpose

Provide officially distributed GitLab project and CI metadata access through explicit host selection and existing CLI authentication, while retaining a bounded read-only interface.

## ADDED Requirements

### Requirement: Official GitLab distribution
MauzCode SHALL ship the `glab` plugin independently of user-local plugin directories. It SHALL preserve the public `glab.read` interface and be discoverable in a normal clean installation. CLI installation and host authentication SHALL remain explicit prerequisites rather than automatic side effects.

#### Scenario: Clean installation
- **WHEN** MauzCode is installed without a user-local glab package
- **THEN** the official glab plugin is available for discovery and preset grants

#### Scenario: Missing prerequisite
- **WHEN** the requested GitLab operation lacks an installed CLI or valid host authentication
- **THEN** the operation fails safely without installing software, starting login or disclosing credentials

### Requirement: Fixed read-only resources
The integration SHALL support only fixed GET resources for the authenticated user, member projects, project details, issues, merge requests, pipelines and jobs. It SHALL reject arbitrary endpoints and unsupported operations, including writes, CI traces, artifacts, repository files, pipeline variables and credentials endpoints.

#### Scenario: Supported metadata request
- **WHEN** a caller requests jobs for an explicitly selected project and host
- **THEN** the integration returns bounded job metadata through the supported GET endpoint

#### Scenario: Unsupported operation
- **WHEN** a caller requests job retry, merge, arbitrary API access or CI trace retrieval
- **THEN** the request is rejected without making that operation

### Requirement: Explicit host and bounded authenticated execution
The integration SHALL require a valid explicit hostname and use existing host-specific local CLI credentials. It SHALL isolate execution from repository host inference and environment token/host overrides, close stdin, enforce a 30-second timeout and 2 MiB process output cap, and retain bounded response strings and explicit clipping metadata.

#### Scenario: Host isolation
- **WHEN** repository context or environment defaults point to another GitLab instance
- **THEN** the request uses only the explicitly selected host and its CLI configuration

#### Scenario: Invalid or stalled request
- **WHEN** the host or resource arguments are invalid, or execution exceeds its limits
- **THEN** the request fails safely without exposing tokens or raw credential-bearing CLI errors

### Requirement: Explicit pagination and identifiers
The integration SHALL preserve explicit page and limit arguments with a maximum limit of 100. Issues and merge requests SHALL use project-local identifiers; pipelines and jobs SHALL use their global identifiers. It SHALL NOT automatically crawl an entire instance.

#### Scenario: Paginated list
- **WHEN** a caller requests one page of merge requests with a valid limit
- **THEN** only that page is requested and pagination and clipping metadata accompany the result

### Requirement: Existing user-copy compatibility
Installing the official plugin SHALL NOT silently combine functions from official and user-local copies or delete user files. An ambiguous duplicate mount SHALL require explicit selection or produce an actionable conflict. Documentation SHALL explain selecting the official root without changing the public plugin identifier.

#### Scenario: Existing user-local plugin
- **WHEN** an installation already has a user-local glab copy
- **THEN** its files remain untouched
- **AND** discovery does not silently expose a mixed implementation under glab
- **AND** any required mount selection is explicit and documented
