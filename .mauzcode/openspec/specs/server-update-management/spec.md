# Server checkout update management

## Purpose
Describe how owners inspect the server checkout and request a restart for a specific fast-forward update, without treating acceptance as proof that the supervisor installed it.

<!-- Last verified: 2026-11-22 at d35de7c21ff42cdbfb2db0272d6874d4db17a4e0 by source inspection -->

## Requirements

### Requirement: Classify the server checkout
A successful comparison SHALL report the local and upstream revisions, upstream name, ahead and behind counts, cleanliness, check time, message and update state.

#### Scenario: A fast-forward is possible
- **WHEN** the checkout is behind and not ahead
- **THEN** the state is `available` for empty porcelain status output and `dirty` for reported changes, including reported untracked files.

<!-- id: update.check.state -->
<!-- entities: checkout, upstream -->
<!-- enforced: src/update/check.ts default export, state selection -->
<!-- test: src/update/check.it.test.ts / update.check distinguishes current, behind and dirty checkouts -->

#### Scenario: Histories diverge
- **WHEN** both counts are positive
- **THEN** the state is `diverged` regardless of cleanliness.

#### Scenario: No upstream commits are missing
- **WHEN** the behind count is zero
- **THEN** the state is `current` even with local commits or working-tree changes.

### Requirement: Distinguish unavailable comparisons
The checker SHALL distinguish an unsuccessful upstream lookup from a failed fetch or thrown comparison error without reporting an eligible update.

#### Scenario: Upstream lookup returns failure
- **WHEN** the upstream reference lookup returns an unsuccessful result
- **THEN** the state is `unconfigured`, both counts are zero and `clean` is false.

<!-- id: update.check.upstream-result -->
<!-- entities: checkout, upstream -->
<!-- enforced: src/update/check.ts default export, upstreamResult and catch branches -->

#### Scenario: Check fails
- **WHEN** a requested fetch fails or a comparison operation throws
- **THEN** the state is `error` with a diagnostic message, zero counts and `clean` false.

### Requirement: Owner-only HTTP controls
The status and apply routes SHALL reject requests without an owner session before performing any checkout operations.

#### Scenario: Missing or insufficient role
- **WHEN** an anonymous user or non-owner requests GET `/update/status` or POST `/update/apply`
- **THEN** the route returns HTTP 403 without checking the checkout.

<!-- id: update.routes.owner -->
<!-- kind: invariant -->
<!-- entities: session, status route, apply route -->
<!-- enforced: src/update/$route_status_GET.ts default export; src/update/$route_apply_POST.ts default export, role guards -->
<!-- test: src/update/routes.test.ts / update pages and status deny nonowners before git access -->

### Requirement: Explicit upstream refresh
The owner status route SHALL return the check result and a request-bound CSRF token with `Cache-Control: no-store`, requesting a fetch only for a `check` value of `1`.

#### Scenario: Inspect without refreshing
- **WHEN** the owner requests GET `/update/status` without a query string
- **THEN** the comparison runs without fetching and the response contains `status` and `csrfToken`.

<!-- id: update.route-status-get.check -->
<!-- entities: status route, upstream, CSRF token -->
<!-- enforced: src/update/$route_status_GET.ts default export -->
<!-- test: src/update/routes.test.ts / owner redirect is native and status does not fetch by default -->

#### Scenario: Refresh before comparison
- **WHEN** the first `check` query value is `1`
- **THEN** the route requests a fetch before upstream comparison.

### Requirement: Authenticate and validate confirmation
The apply route SHALL require a valid CSRF token followed by a JSON object with `confirmed` equal to boolean true and a string `target` before rechecking eligibility.

#### Scenario: Invalid token
- **WHEN** the owner's `X-CSRF-Token` fails verification
- **THEN** the route returns HTTP 403 before parsing confirmation.

<!-- id: update.route-apply-post.confirmation -->
<!-- entities: apply route, CSRF token, target -->
<!-- enforced: src/update/$route_apply_POST.ts default export, verifyCsrf and input guards -->
<!-- test: src/update/routes.test.ts / apply requires CSRF and explicit confirmation without running update -->

#### Scenario: Invalid confirmation body
- **WHEN** token verification succeeds but JSON parsing fails or the confirmation object lacks the required values
- **THEN** the route returns HTTP 400 without requesting an update check.

### Requirement: Recheck the confirmed revision
The apply route SHALL request a fresh upstream check and refuse staging unless the result is `available` with both revisions present and the target exactly matches the confirmation.

#### Scenario: The upstream target moved
- **WHEN** the confirmed target differs from the newly checked target
- **THEN** the route returns HTTP 409 asking for refresh and confirmation without staging or scheduling restart.

<!-- id: update.route-apply-post.target -->
<!-- entities: apply route, target, checkout -->
<!-- enforced: src/update/$route_apply_POST.ts default export, s.state and s.target guard -->
<!-- test: src/update/routes.test.ts / changed target refuses confirmed request before staging or restart -->

### Requirement: Stage a supervisor handoff
An accepted apply request SHALL write a pending update record and schedule server shutdown with update exit code 75, returning HTTP 202 rather than reporting installation success.

#### Scenario: The refreshed target is still eligible
- **WHEN** the eligible target matches and staging succeeds
- **THEN** `.runtime/update-pending.json` under the checkout records version 1, old and target revisions, upstream, request time and change flags; shutdown is scheduled and the response reports that the update was staged.

<!-- id: update.route-apply-post.update-pending -->
<!-- entities: pending record, supervisor -->
<!-- enforced: src/update/$route_apply_POST.ts default export, files through process.exit(75) -->

#### Scenario: Classify changed paths for the supervisor
- **WHEN** the route examines paths changed between the checked revisions
- **THEN** `lockChanged` indicates a root `bun.lock` or `bun.lockb` change, and `migrationsChanged` indicates a changed basename starting with `$migration_` followed by at least one character before `.ts`.

<!-- uncertainty: The inspected backend tests do not exercise divergence, failed checks, or the successful staging and exit path. Frontend settings tests use mocked HTTP, not a supervisor. -->
<!-- deferred: Supervisor processing, installation and restart outcomes are outside this HTTP handoff. -->
