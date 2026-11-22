# Background job scheduling

## Purpose
Describe how global cron tasks become due, what a worker records for each invocation, and when a task may act for a notification owner.

Last verified: 2026-11-22, source revision `d35de7c2` (static inspection).

## Requirements

### Requirement: Named interval tasks
Adding an interval task SHALL create or update one enabled schedule by name, using the supplied target, arguments and interval.

#### Scenario: Replace an interval
- **WHEN** a caller adds the same name twice, changing the interval from one hour to two and supplying new arguments
- **THEN** one task remains with the new arguments and two-hour interval; its first due time is two hours from the update unless immediate scheduling was requested

<!-- id: cron.add.upsert -->
<!-- entities: interval task -->
<!-- enforced: src/cron/add.ts#default -->
<!-- test: src/cron/cron.test.ts::add upserts one task -->

### Requirement: One-shot scheduling
A deferred task SHALL use exactly one absolute time or relative delay and default its name to the target function when no name is supplied.

#### Scenario: Ambiguous due time
- **WHEN** a caller supplies both an absolute time and a relative delay
- **THEN** the scheduler rejects the request without creating the task

<!-- id: cron.defer.runAt -->
<!-- entities: one-shot task -->
<!-- enforced: src/cron/defer.ts#default -->

### Requirement: Reconcile registered definitions
Reconciliation SHALL apply new or changed declarations, skip unchanged definitions and disable declared tasks whose declaration is absent.

#### Scenario: Definition changes while disabled
- **WHEN** a disabled task with a non-null next due time receives a changed interval declaration
- **THEN** the task uses the new definition but retains its disabled status and due time

#### Scenario: Declaration disappears
- **WHEN** reconciliation no longer finds a previously declared task
- **THEN** the task is disabled rather than deleted and its name is returned in `disabledMissing`

<!-- id: cron.reconcile.definitionHash -->
<!-- entities: declaration, task -->
<!-- enforced: src/cron/reconcile.ts#default -->

### Requirement: Manual runs request scheduling
A manual run SHALL enable the named idle task and make it immediately due; it SHALL reject a missing or running task.

#### Scenario: Disabled idle task
- **WHEN** a caller requests a manual run for a disabled idle task
- **THEN** the task becomes enabled and the caller receives its name and new due time, not an execution result

<!-- id: cron.runNow.idle -->
<!-- entities: task -->
<!-- enforced: src/cron/runNow.ts#default -->

### Requirement: Claim one due task
A claim SHALL atomically mark at most one enabled, idle, due task running and create its running history entry, choosing the earliest unlocked due time and breaking ties by name.

#### Scenario: Competing claims
- **WHEN** two workers claim the only eligible task before either completes it
- **THEN** one receives the run and the other receives null; history contains one entry with the claimed target, arguments and scheduled time

<!-- id: cron.claim.due -->
<!-- kind: invariant -->
<!-- entities: task, run -->
<!-- enforced: src/cron/claim.ts#default -->
<!-- test: src/cron/cron.test.ts::concurrent claim creates one run -->

### Requirement: Record execution and advance the schedule
After target execution the scheduler SHALL record the outcome and finish time, return the task to idle, and schedule the next enabled interval from completion rather than from its previous due time.

#### Scenario: Interval target returns a small JSON result
- **WHEN** a claimed interval task finishes successfully and remains enabled
- **THEN** its history records `done` and the returned value, and its next due time is the finish time plus the interval

#### Scenario: One-shot target fails
- **WHEN** a claimed one-shot target throws
- **THEN** its run records `error` with up to 16,000 characters of error detail and the task is disabled with no next due time

#### Scenario: Result does not fit inline
- **WHEN** a successful result serializes to more than 8,192 UTF-16 code units
- **THEN** history stores an object with `truncated: true` and `bytes` equal to the serialized string length instead of the payload

<!-- id: cron.runOne.finished -->
<!-- entities: task, run, result -->
<!-- enforced: src/cron/runOne.ts#default -->
<!-- test: src/cron/cron.test.ts::run records history and advances interval task -->

### Requirement: Task history lookup
History SHALL return runs for the exact task name in descending run ID order, defaulting to 100 rows and clamping a supplied finite limit to 1–500 after rounding down.

#### Scenario: Request only the latest run
- **WHEN** a caller requests history with limit zero for a task with several runs
- **THEN** only its highest-ID run is returned, including its target, arguments, timestamps, status, result and error

<!-- id: cron.runs.limit -->
<!-- entities: task, run -->
<!-- enforced: src/cron/runs.ts#default -->

### Requirement: Invocation-scoped notification identity
Notification authority SHALL exist only during a worker-authorized invocation with a matching owner grant for the task, target, definition version and notification scope.

#### Scenario: Matching notification grant
- **WHEN** the target resolves `notification.enqueue` authority during the authorized run
- **THEN** its service identity identifies the grant owner, task, target and run, with transport actor `cron:<task name>:<run id>`; lookup on that session after execution returns null

#### Scenario: Stale definition or legacy invocation
- **WHEN** the claimed definition no longer matches the current grant or a sessionless caller executes the run directly
- **THEN** the target receives no notification authority

<!-- id: cron.runOne.notificationServices -->
<!-- kind: invariant -->
<!-- entities: run, service session, notification grant -->
<!-- enforced: src/cron/runOne.ts#default; src/cron/authority.ts#default -->
<!-- test: src/cron/authority.test.ts::parallel owner services isolate scope, identity and cleanup; legacy has no authority -->
<!-- test: src/cron/authority.test.ts::changed target invalidates grant, including claimed definition snapshot -->

<!-- uncertainty: No dedicated assertions identified in the sampled tests for declaration reconciliation, history limits or oversized results. No crash atomicity is asserted for the separate run and task completion writes. -->
<!-- deferred: src/cron/recover.ts, src/cron/remove.ts, src/cron/setEnabled.ts; recovery and other management operations are outside this baseline. -->