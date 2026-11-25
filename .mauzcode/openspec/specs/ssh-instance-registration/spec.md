# SSH instance registration and trust

## Purpose
Describe how MauzCode registers a named SSH destination, records its host key and forgets or replaces its local descriptor.

<!-- last_verified: 2026-11-22 at d35de7c2; source files listed under enforced -->
<!-- uncertainty: Registration conflicts and repeated submission of the same pin were not covered by the inspected tests. Independent verification is asserted by the caller, not performed by the registry. -->
<!-- deferred: src/sshInstance/connection.ts and src/sshInstance/probe.ts concern operational connections. -->

## Requirements

### Requirement: Administrative request boundary
The management POST route SHALL require an owner, a matching Origin and a request not marked cross-site before dispatching any action.

#### Scenario: Forbidden edit
- **WHEN** a non-owner submits an edit or an owner submits one from another origin
- **THEN** the route returns 403 without dispatching the edit.

<!-- id: ssh-instance-route-post-origin -->
<!-- entities: management request -->
<!-- enforced: src/sshInstance/$route_POST.ts default export -->
<!-- test: src/sshInstance/actions.test.ts :: cross-origin and non-owner edit/remove remain forbidden -->

### Requirement: Register a unique endpoint
Registration SHALL validate the endpoint and save a new descriptor under its name with no pinned host key, without overwriting an existing registration.

#### Scenario: First registration
- **WHEN** an authorized caller registers a new valid DNS or IP destination without specifying a port
- **THEN** the returned descriptor contains port 22, a new instance ID, a public key and a null host pin.

#### Scenario: Duplicate name
- **WHEN** another descriptor already occupies the name at insertion
- **THEN** registration reports a duplicate and leaves that descriptor in place.

<!-- id: ssh-instance-create-insert -->
<!-- entities: instance descriptor, endpoint -->
<!-- enforced: src/sshInstance/create.ts default export; src/sshInstance/validate.ts default export -->

### Requirement: Confirm host trust
Trust SHALL require explicit confirmation and a valid OpenSSH Ed25519 host key. Changing an existing pin SHALL also require explicit replacement permission.

#### Scenario: First or repeated pin
- **WHEN** the caller confirms a valid key for an unpinned instance
- **THEN** the instance records the normalized key without its comment; confirming the same normalized key again returns the unchanged descriptor.

#### Scenario: Different key without replacement permission
- **WHEN** the caller confirms a different key but does not permit replacement
- **THEN** the existing pin remains and the operation reports that replacement confirmation is required.

<!-- id: ssh-instance-trust-normalized -->
<!-- entities: host pin, instance descriptor -->
<!-- enforced: src/sshInstance/trust.ts default export -->
<!-- test: src/sshInstance/lifecycle.test.ts :: replacement requires both explicit flags and creates known_hosts before publishing -->

### Requirement: Preserve or reset endpoint trust on save
Saving an unchanged endpoint SHALL return the existing descriptor. Changing its host, user or port SHALL clear the pin and assign a new ID while preserving the instance name and login identity.

#### Scenario: Edit a pinned destination
- **WHEN** a save changes the destination host of a pinned instance
- **THEN** the new descriptor has the same name and public key, a different ID and no pin.

<!-- id: ssh-instance-save-endpoint -->
<!-- entities: endpoint, instance descriptor -->
<!-- enforced: src/sshInstance/save.ts default export; src/sshInstance/replaceDescriptor.ts default export -->
<!-- test: src/sshInstance/lifecycle.test.ts :: endpoint edit retains key, rotates namespace, clears pin and fails only related accounts -->

### Requirement: Guard descriptor changes
Replacement and removal SHALL reject a pending login for the instance and compare the full previously read descriptor before committing any descriptor or account changes.

#### Scenario: Pending login
- **WHEN** a login for the instance is pending during a requested change
- **THEN** the change is rejected without committing it.

#### Scenario: Concurrent edit
- **WHEN** the stored descriptor no longer matches the edit's previous descriptor
- **THEN** the edit reports a concurrency error and discards its staged files instead of overwriting the stored descriptor.

<!-- id: ssh-instance-replace-descriptor-changed -->
<!-- entities: instance descriptor, pending login -->
<!-- enforced: src/sshInstance/replaceDescriptor.ts default export -->
<!-- test: src/sshInstance/lifecycle.test.ts :: CAS loss removes staged files and preserves original identity -->
<!-- test: src/sshInstance/lifecycle.test.ts :: pending login blocks edit trust and remove -->

### Requirement: Invalidate accounts on replacement
A committed replacement SHALL mark local account records for that instance as failed without changing records for other instances.

#### Scenario: Changed endpoint
- **WHEN** a replacement commits and two instances each have a connected account
- **THEN** only the account belonging to the edited instance is marked failed.

<!-- id: ssh-instance-replace-descriptor-accounts -->
<!-- entities: instance descriptor, local account -->
<!-- enforced: src/sshInstance/replaceDescriptor.ts default export -->
<!-- test: src/sshInstance/lifecycle.test.ts :: endpoint edit retains key, rotates namespace, clears pin and fails only related accounts -->

### Requirement: Forget an instance locally
Removal SHALL require explicit confirmation and on success delete the descriptor and its local account records without deleting its protected identity directory or contacting the remote host.

#### Scenario: Confirmed removal
- **WHEN** an authorized caller confirms removal of an instance with no pending login and the descriptor still matches
- **THEN** the named descriptor and its accounts are forgotten, other instances' accounts remain, and the previous identity file is retained.

<!-- id: ssh-instance-remove-confirmed -->
<!-- entities: instance descriptor, local account -->
<!-- enforced: src/sshInstance/remove.ts default export; src/sshInstance/replaceDescriptor.ts default export -->
<!-- test: src/sshInstance/lifecycle.test.ts :: confirmed removal only forgets local metadata and retains protected keys -->
