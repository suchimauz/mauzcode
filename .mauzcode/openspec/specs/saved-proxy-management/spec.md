# Saved SOCKS5 Proxy Management

## Purpose
Describe how settings identifies saved proxies, protects edits and deletion, and limits connectivity checks against a fixed destination.

<!-- Last verified: d35de7c2 on 2026-11-22; source inspection only -->

## Requirements

### Requirement: Independent saved identities
Creation SHALL assign a new UUID and revision 1 even when the display name and endpoint match another record.

#### Scenario: Save the same endpoint twice
- **WHEN** two valid additions use identical settings
- **THEN** each returns its own ID and initial revision

<!-- id: socksProxy.create.randomUUID -->
<!-- entities: saved proxy -->
<!-- enforced: src/socksProxy/create.ts#default -->
<!-- test: src/socksProxy/registry.test.ts:5 -->

### Requirement: Public registry snapshot
Listing SHALL return ID, name, host, port, authentication flag, revision and referencing provider/account pairs, without credential values or secret references.

#### Scenario: Inspect references before removal
- **WHEN** a disabled connection still references a saved proxy
- **THEN** its provider and account appear in that proxy's users list; a proxy with no references has an empty list

<!-- id: socksProxy.list.users -->
<!-- kind: invariant -->
<!-- entities: saved proxy, connection -->
<!-- enforced: src/socksProxy/list.ts#default -->
<!-- test: src/socksProxy/registry.test.ts:13; src/socksProxy/registry.test.ts:22 -->

### Requirement: Revision-checked edits
An update SHALL preserve the ID and increment the revision by one on success, reject stale revisions with 409 and report an absent record with 404.

#### Scenario: Two editors start at revision one
- **WHEN** the first valid edit succeeds and the second submits revision one
- **THEN** the first returns revision two and the second fails without overwriting it

<!-- id: socksProxy.update.revision -->
<!-- entities: saved proxy -->
<!-- enforced: src/socksProxy/update.ts#default -->
<!-- test: src/socksProxy/registry.test.ts:5 -->

### Requirement: Guarded and repeatable removal
Removal with a valid ID and revision SHALL succeed for an absent record, reject stale revisions, and delete a current record only if no connection references it.

#### Scenario: A connection still uses the proxy
- **WHEN** removal supplies the current revision for a referenced record
- **THEN** it returns 409 with PROXY_IN_USE and the referencing provider/account pairs

#### Scenario: Repeat a deletion
- **WHEN** removal of an unused proxy succeeds and the same request is repeated
- **THEN** both requests return ok true

<!-- id: socksProxy.remove.users -->
<!-- entities: saved proxy, connection -->
<!-- enforced: src/socksProxy/remove.ts#default -->
<!-- test: src/socksProxy/registry.test.ts:5; src/socksProxy/registry.test.ts:13 -->

### Requirement: Saved-only connectivity probe
A check SHALL use the saved endpoint identified by UUID to request http://ip-api.com/json and tag the returned transport result with the saved revision, check time and duration.

#### Scenario: Check an edited record
- **WHEN** a probe completes using settings read at revision two
- **THEN** the result identifies revision two rather than a revision supplied by the caller

<!-- id: socksProxy.check.readSaved -->
<!-- entities: saved proxy, check result -->
<!-- enforced: src/socksProxy/check.ts#default; src/socksProxy/probeTransport.ts#default -->
<!-- test: src/socksProxy/check.test.ts:21; src/socksProxy/check.test.ts:37 -->

### Requirement: Shared check limits
The runtime SHALL admit at most one active check per ID, three active checks overall and thirty transport starts per rolling minute, and honor an active upstream cooldown.

#### Scenario: Admission refused
- **WHEN** a browser check hits a concurrency limit, exhausts the start budget or arrives during cooldown
- **THEN** it receives HTTP 429 with Retry-After instead of starting another probe

<!-- id: socksProxy.check.limits -->
<!-- entities: saved proxy, check admission -->
<!-- enforced: src/socksProxy/check.ts#default; src/socksProxy/browserApi.ts#default -->
<!-- test: src/socksProxy/check.test.ts:38; src/socksProxy/check.test.ts:39; src/socksProxy/check.test.ts:45 -->

### Requirement: Bounded check lifetime
Checks SHALL include storage lookup in their ten-second deadline and release admission when cancelled or timed out.

#### Scenario: Storage does not respond
- **WHEN** the request is aborted or its deadline expires while reading the record
- **THEN** no probe starts and the check reports cancelled or timeout respectively

<!-- id: socksProxy.check.stopped -->
<!-- entities: saved proxy, check admission -->
<!-- enforced: src/socksProxy/check.ts#default -->
<!-- test: src/socksProxy/check.test.ts:43; src/socksProxy/check.test.ts:44 -->

<!-- uncertainty: The cited unit tests do not establish availability of the external check destination. -->
